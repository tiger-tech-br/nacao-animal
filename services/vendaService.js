"use strict";

/* ==================================================
   DEPENDÊNCIAS
================================================== */

const db = require("../database/connection");

const VendaModel = require("../models/vendaModel");
const ItemVendaModel = require("../models/itemVendaModel");

const MovimentacaoEstoqueService = require(
    "./movimentacaoEstoqueService"
);

const FinanceiroService = require("./financeiroService");
const CupomService = require("./cupomService");
const PagSeguroService = require("./pagseguroService");
const audit = require("./auditService");

const RESERVA_MINUTOS = Math.min(1440, Math.max(10, Number(process.env.ORDER_RESERVATION_MINUTES) || 30));

const {
    sendOptionalEmail,
    paymentApprovedTemplate,
    orderOutForDeliveryTemplate,
    orderDeliveredTemplate,
    orderCanceledTemplate
} = require("./emailService");

/* ==================================================
   FORMAS DE PAGAMENTO ACEITAS
================================================== */

const FORMAS_PAGAMENTO = [
    "PIX",
    "CARTAO_CREDITO",
    "CARTAO_DEBITO",
    "PAGBANK"
];

/* ==================================================
   SERVICE
================================================== */

const VendaService = {

    /* ==============================================
       FINALIZAR VENDA
    ============================================== */

    async finalizarVenda(empresaId, venda, itens) {

        if (!empresaId) {
            throw new Error("Empresa não informada.");
        }

        if (!venda || typeof venda !== "object") {
            throw new Error("Dados da venda não informados.");
        }

        if (!Array.isArray(itens) || itens.length === 0) {
            throw new Error(
                "A venda deve possuir pelo menos um item."
            );
        }

        if (itens.length > 50) {
            throw Object.assign(new Error("O pedido pode conter no máximo 50 produtos diferentes."), { status: 400 });
        }

        const quantidadeTotal = itens.reduce((total, item) => total + Number(item?.quantidade || 0), 0);
        if (!Number.isFinite(quantidadeTotal) || quantidadeTotal > 500) {
            throw Object.assign(new Error("A quantidade total do pedido excede o limite permitido."), { status: 400 });
        }

        const formaPagamento =
            venda.forma_pagamento ??
            venda.formaPagamento ??
            "PIX";

        if (!FORMAS_PAGAMENTO.includes(formaPagamento)) {
            throw new Error("Forma de pagamento inválida.");
        }

        let desconto = Number(venda.desconto ?? 0);
        const acrescimo = Number(venda.acrescimo ?? 0);
        const valorFrete = Number(venda.valor_frete ?? 0);
        if (!Number.isFinite(valorFrete) || valorFrete < 0) throw new Error("Frete inválido.");

        if (
            !Number.isFinite(desconto) ||
            desconto < 0
        ) {
            throw new Error("Desconto inválido.");
        }

        if (
            !Number.isFinite(acrescimo) ||
            acrescimo < 0
        ) {
            throw new Error("Acréscimo inválido.");
        }

        await liberarReservasExpiradas(empresaId);
        const client = await db.connect();

        try {

            await client.query("BEGIN");

            const novaVenda = await VendaModel.criar(
                {
                    empresa_id: empresaId,

                    cliente_id:
                        venda.cliente_id ??
                        venda.clienteId ??
                        null,

                    usuario_id:
                        venda.usuario_id ??
                        venda.usuarioId ??
                        null,

                    data_venda:
                        venda.data_venda ??
                        venda.dataVenda ??
                        new Date(),

                    forma_pagamento: formaPagamento,

                    status:
                        venda.status ??
                        "AGUARDANDO_PAGAMENTO",

                    desconto: 0,

                    acrescimo,
                    valor_frete: valorFrete,
                    distancia_entrega_m: venda.distancia_entrega_m,
                    endereco_entrega: venda.endereco_entrega,

                    observacoes:
                        venda.observacoes ?? null,

                    valor_total: 0
                },
                client
            );

            let valorTotalBruto = 0;

            const itensCriados = [];

            for (const item of itens) {

                const produtoId =
                    item.produto_id ??
                    item.produtoId;

                const quantidade = Number(
                    item.quantidade
                );

                if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) {
                    throw Object.assign(new Error("A quantidade de cada produto deve estar entre 1 e 100."), { status: 400 });
                }

                if (!produtoId) {
                    throw new Error(
                        "Produto não informado."
                    );
                }

                if (
                    !Number.isInteger(quantidade) ||
                    quantidade <= 0
                ) {
                    throw new Error(
                        "A quantidade do produto deve ser um número inteiro maior que zero."
                    );
                }

                /*
                ==========================================
                 BUSCA O PREÇO VERDADEIRO NO BANCO

                 O valor enviado pelo navegador é ignorado.
                ==========================================
                */

                const { rows } = await client.query(
                    `
                        SELECT
                            id,
                            nome,
                            preco
                        FROM produtos
                        WHERE id = $1
                          AND empresa_id = $2
                          AND ativo = TRUE
                        LIMIT 1
                        FOR UPDATE;
                    `,
                    [
                        produtoId,
                        empresaId
                    ]
                );

                const produto = rows[0];

                if (!produto) {
                    throw new Error(
                        "Produto não encontrado ou indisponível."
                    );
                }

                const precoUnitario = Number(
                    produto.preco
                );

                if (
                    !Number.isFinite(precoUnitario) ||
                    precoUnitario < 0
                ) {
                    throw new Error(
                        `O produto ${produto.nome} possui um preço inválido.`
                    );
                }

                const disponivel =
                    await MovimentacaoEstoqueService
                        .verificarDisponibilidade(
                            empresaId,
                            produtoId,
                            quantidade,
                            client
                        );

                if (!disponivel) {
                    throw new Error(
                        `Estoque insuficiente para o produto ${produto.nome}.`
                    );
                }

                const descontoItem = 0;

                const subtotal =
                    quantidade * precoUnitario -
                    descontoItem;

                const novoItem =
                    await ItemVendaModel.criar(
                        {
                            venda_id: novaVenda.id,
                            produto_id: produtoId,
                            quantidade,
                            preco_unitario:
                                precoUnitario,
                            desconto: descontoItem,
                            subtotal
                        },
                        client
                    );

                itensCriados.push(novoItem);

                await MovimentacaoEstoqueService.saida(
                    empresaId, produtoId, quantidade, client,
                    { referenciaTipo: "RESERVA_VENDA", referenciaId: novaVenda.id,
                        observacao: "Reserva temporária do pedido" }
                );
                await client.query(
                    `INSERT INTO reservas_estoque
                     (empresa_id,venda_id,produto_id,quantidade,expira_em)
                     VALUES ($1,$2,$3,$4,NOW()+($5::text || ' minutes')::interval)
                     ON CONFLICT (venda_id,produto_id) DO UPDATE
                     SET quantidade=reservas_estoque.quantidade+EXCLUDED.quantidade,
                         expira_em=EXCLUDED.expira_em`,
                    [empresaId, novaVenda.id, produtoId, quantidade, RESERVA_MINUTOS]
                );

                valorTotalBruto += subtotal;

            }

            valorTotalBruto = Math.round(valorTotalBruto * 100) / 100;
            let cupomCodigo = null;
            if (venda.cupomCodigo != null && venda.cupomCodigo !== "") {
                const cupom = await CupomService.validar(client, empresaId, venda.cupomCodigo,
                    Math.round(valorTotalBruto * 100), true, venda.cliente_id || venda.clienteId || null);
                desconto = cupom.desconto;
                cupomCodigo = cupom.codigo;
            }

            const valorFinal =
                valorTotalBruto -
                desconto +
                acrescimo + valorFrete;

            if (valorFinal < 0) {
                throw new Error(
                    "O desconto não pode ser maior que o valor da venda somado ao acréscimo."
                );
            }

            /*
            ==========================================
             ATUALIZA OS TOTAIS

             O model recebe o total bruto.
             Ele calcula:
             valor_final = valor_total - desconto
                           + acréscimo
            ==========================================
            */

            if (cupomCodigo && Math.round(valorFinal * 100) === 0) {
                throw Object.assign(new Error("O total para pagamento deve ser maior que zero. Adicione outro produto ou remova o cupom."), { status: 400 });
            }

            const { rows: [vendaAtualizada] } = await client.query(
                `UPDATE vendas SET valor_total=$1, desconto=$2, cupom_codigo=$3,
                 valor_final=$1::numeric-$2::numeric+acrescimo+valor_frete,
                 estoque_baixado_em=NOW(),
                 reserva_expira_em=NOW()+($6::text || ' minutes')::interval,
                 updated_at=NOW()
                 WHERE id=$4 AND empresa_id=$5 RETURNING *`,
                [valorTotalBruto, desconto, cupomCodigo, novaVenda.id, empresaId, RESERVA_MINUTOS]
            );

            await client.query("COMMIT");

            return {
                success: true,

                message:
                    "Venda finalizada com sucesso.",

                venda: vendaAtualizada,

                itens: itensCriados
            };

        } catch (error) {

            await client.query("ROLLBACK");

            throw error;

        } finally {

            client.release();

        }

    },

    /* ==============================================
       CONFIRMAR PAGAMENTO
    ============================================== */

    async confirmarPagamento(empresaId, referencia, dadosPagamento = {}) {

        const client = await db.connect();

        try {

            await client.query("BEGIN");

            const venda = await buscarVendaPagamento(
                referencia,
                empresaId,
                client
            );

            if (!venda) {
                await client.query("COMMIT");
                return null;
            }

            if (venda.status === "CANCELADA") {
                throw Object.assign(new Error("Este pedido foi cancelado e não pode receber pagamento."), { status: 409 });
            }

            let shouldNotifyPayment = false;

            if (["PAGAMENTO_APROVADO", "EM_SEPARACAO", "SAIU_PARA_ENTREGA", "ENTREGUE", "FINALIZADA"].includes(venda.status)) {
                await VendaModel.atualizarPagamentoPorReferencia(
                    referencia,
                    {
                        ...dadosPagamento,
                        status: venda.status
                    },
                    client
                );

                await client.query("COMMIT");
                return venda;
            }

            shouldNotifyPayment = true;

            if (!venda.estoque_baixado_em) {
                const itens = await listarItensVenda(venda.id, venda.empresa_id, client);
                for (const item of itens) {
                    await MovimentacaoEstoqueService.saida(
                        venda.empresa_id, item.produto_id, item.quantidade, client,
                        { referenciaTipo: "VENDA", referenciaId: venda.id, observacao: "Baixa por pagamento aprovado" }
                    );
                }
            }

            const vendaAtualizada =
                await VendaModel.atualizarPagamentoPorReferencia(
                    referencia,
                    {
                        status: "PAGAMENTO_APROVADO",
                        ...dadosPagamento
                    },
                    client
                );

            await client.query("UPDATE vendas SET estoque_baixado_em = NOW() WHERE id = $1", [venda.id]);
            await client.query(
                "UPDATE reservas_estoque SET confirmada_em=COALESCE(confirmada_em,NOW()) WHERE venda_id=$1 AND liberada_em IS NULL",
                [venda.id]
            );
            await gerarFinanceiroSeNaoExistir(
                venda.empresa_id,
                vendaAtualizada || venda,
                client
            );

            await audit.registrar({
                empresaId: venda.empresa_id,
                acao: "PAGAMENTO_APROVADO",
                entidade: "VENDA",
                entidadeId: venda.id,
                descricao: "Pagamento do pedido confirmado pelo PagBank.",
                anterior: { status: venda.status },
                novo: { status: "PAGAMENTO_APROVADO", pagseguro_status: dadosPagamento.pagseguroStatus }
            }, client);

            await client.query("COMMIT");

            if (shouldNotifyPayment) {
                await enviarEmailStatusPedido(
                    vendaAtualizada || venda,
                    "PAGAMENTO_APROVADO"
                );
            }

            return vendaAtualizada || venda;

        } catch (error) {

            await client.query("ROLLBACK");
            throw error;

        } finally {

            client.release();

        }

    },

    /* ==============================================
       ATUALIZAR STATUS DO PEDIDO
    ============================================== */

    async atualizarStatusPedido(empresaId, vendaId, status, options = {}) {

        if (status === "PAGAMENTO_APROVADO") {
            throw Object.assign(new Error("O pagamento só pode ser aprovado após confirmação do PagBank."), { status: 409 });
        }

        if (status === "CANCELADA") {
            return this.cancelarPedido(empresaId, vendaId, options);
        }

        const result = await db.transaction(async client => {
            const { rows } = await client.query("SELECT * FROM vendas WHERE id=$1 AND empresa_id=$2 FOR UPDATE", [vendaId,empresaId]);
            const current = rows[0];
            if (!current) return null;
            if (current.status === status) return { sale: current, changed: false };
            const allowed = {
                AGUARDANDO_PAGAMENTO: ["CANCELADA"],
                PAGAMENTO_APROVADO: ["EM_SEPARACAO","SAIU_PARA_ENTREGA","CANCELADA"],
                EM_SEPARACAO: ["SAIU_PARA_ENTREGA","CANCELADA"],
                SAIU_PARA_ENTREGA: ["ENTREGUE","CANCELADA"],
                ENTREGUE: ["FINALIZADA"], FINALIZADA: [], CANCELADA: []
            };
            if (!allowed[current.status]?.includes(status)) throw Object.assign(new Error("Esta mudança de status não é permitida. Confira a etapa atual e a confirmação do pagamento."), { status: 409 });
            const updatedSale = await VendaModel.atualizarStatus(vendaId,empresaId,status,client);
            await audit.registrar({
                empresaId,
                usuarioId: options.usuarioId || null,
                acao: "ALTERAR_STATUS",
                entidade: "VENDA",
                entidadeId: vendaId,
                descricao: `Status do pedido alterado de ${current.status} para ${status}.`,
                anterior: { status: current.status },
                novo: { status }
            }, client);
            return { sale: updatedSale, changed: true };
        });
        if (!result) return null;
        if (result.changed) await enviarEmailStatusPedido(result.sale,status);
        return result.sale;

    },

    async cancelarPedido(empresaId, vendaId, options = {}) {
        const motivo = String(options.motivo || "Cancelado pelo administrador").trim().slice(0, 500);
        const result = await db.transaction(async client => {
            const { rows } = await client.query(
                "SELECT * FROM vendas WHERE id=$1 AND empresa_id=$2 FOR UPDATE",
                [vendaId, empresaId]
            );
            const current = rows[0];
            if (!current) return null;
            if (current.status === "CANCELADA") return { sale: current, changed: false };
            if (["ENTREGUE", "FINALIZADA"].includes(current.status)) {
                throw Object.assign(new Error("Pedido entregue não pode ser cancelado."), { status: 409 });
            }

            // Revalida o pagamento com o pedido bloqueado, inclusive em cancelamentos simultâneos.
            const pago = ["PAGAMENTO_APROVADO", "EM_SEPARACAO", "SAIU_PARA_ENTREGA"].includes(current.status);
            let reembolso = null;
            if (pago && !options.skipRefund) {
                if (!current.pagseguro_charge_id) {
                    throw Object.assign(new Error("O pedido pago não possui identificador da cobrança. Faça o estorno no PagBank e registre o cancelamento depois."), { status: 409 });
                }
                reembolso = await PagSeguroService.cancelarCobranca(
                    current.pagseguro_charge_id,
                    current.valor_final,
                    `cancel-${current.id}`
                );
            }

            if (current.estoque_baixado_em && !current.estoque_devolvido_em) {
                const itens = await listarItensVenda(current.id, empresaId, client);
                for (const item of itens) {
                    await MovimentacaoEstoqueService.entrada(
                        empresaId, item.produto_id, item.quantidade, client,
                        { tipo: "DEVOLUCAO", usuarioId: options.usuarioId,
                            referenciaTipo: "CANCELAMENTO_VENDA", referenciaId: current.id,
                            observacao: motivo }
                    );
                }
            }

            const updated = await client.query(
                `UPDATE vendas SET status='CANCELADA',estoque_devolvido_em=COALESCE(estoque_devolvido_em,NOW()),
                 cancelado_em=NOW(),cancelado_por=$1,cancelamento_motivo=$2,
                 reembolso_status=$3,reembolso_id=$4,pagseguro_status=COALESCE($5,pagseguro_status),updated_at=NOW()
                 WHERE id=$6 AND empresa_id=$7 RETURNING *`,
                [options.usuarioId || null, motivo,
                    reembolso ? "PROCESSADO" : (pago ? "CONFIRMADO_PELO_PROVEDOR" : "NAO_APLICAVEL"),
                    reembolso?.id || null, options.pagseguroStatus || null, current.id, empresaId]
            );
            await client.query(
                "UPDATE reservas_estoque SET liberada_em=NOW() WHERE venda_id=$1 AND confirmada_em IS NULL AND liberada_em IS NULL",
                [current.id]
            );
            await FinanceiroService.cancelarPorReferencia(empresaId, "VENDA", current.id, client);
            await audit.registrar({ empresaId, usuarioId: options.usuarioId || null,
                acao: pago ? "REEMBOLSAR_CANCELAR" : "CANCELAR", entidade: "VENDA", entidadeId: current.id,
                descricao: `Pedido cancelado: ${motivo}`, anterior: current, novo: updated.rows[0] }, client);
            return { sale: updated.rows[0], changed: true };
        });
        if (result?.changed) await enviarEmailStatusPedido(result.sale, "CANCELADA");
        return result?.sale || null;
    },

    /* ==============================================
       ATUALIZAR STATUS DO PAGAMENTO
    ============================================== */

    async atualizarStatusPagamento(
        empresaId,
        referencia,
        status,
        dadosPagamento = {}
    ) {

        const result = await db.transaction(async client => {
            const vendaAtual = await buscarVendaPagamento(referencia, empresaId, client);
            if (!vendaAtual) return null;
            const vendaAtualizada = await VendaModel.atualizarPagamentoPorReferencia(
                referencia, { ...dadosPagamento, status }, client
            );
            return { vendaAtual, vendaAtualizada: vendaAtualizada || vendaAtual };
        });
        if (!result) return null;
        const { vendaAtual, vendaAtualizada } = result;
        if (vendaAtual.status !== vendaAtualizada.status) {
            await enviarEmailStatusPedido(
                vendaAtualizada,
                vendaAtualizada.status
            );
        }

        return vendaAtualizada;

    }

};

async function liberarReservasExpiradas(empresaId) {
    await db.transaction(async client => {
        const { rows: vendas } = await client.query(
            `SELECT v.* FROM vendas v
             WHERE v.empresa_id=$1 AND v.status='AGUARDANDO_PAGAMENTO'
               AND v.reserva_expira_em IS NOT NULL AND v.reserva_expira_em<=NOW()
             FOR UPDATE SKIP LOCKED`,
            [empresaId]
        );
        for (const venda of vendas) {
            const { rows: reservas } = await client.query(
                `SELECT * FROM reservas_estoque WHERE venda_id=$1
                 AND confirmada_em IS NULL AND liberada_em IS NULL FOR UPDATE`,
                [venda.id]
            );
            for (const reserva of reservas) {
                await MovimentacaoEstoqueService.entrada(
                    venda.empresa_id, reserva.produto_id, reserva.quantidade, client,
                    { tipo: "DEVOLUCAO", referenciaTipo: "RESERVA_EXPIRADA", referenciaId: venda.id,
                        observacao: "Reserva expirada antes do pagamento" }
                );
            }
            await client.query("UPDATE reservas_estoque SET liberada_em=NOW() WHERE venda_id=$1 AND liberada_em IS NULL", [venda.id]);
            await client.query(
                `UPDATE vendas SET status='CANCELADA',estoque_devolvido_em=NOW(),cancelado_em=NOW(),
                 cancelamento_motivo='Reserva de estoque expirada antes do pagamento',updated_at=NOW()
                 WHERE id=$1`, [venda.id]
            );
        }
    });
}

async function liberarTodasReservasExpiradas() {
    const { rows } = await db.query(
        `SELECT DISTINCT empresa_id FROM vendas
         WHERE status='AGUARDANDO_PAGAMENTO'
           AND reserva_expira_em IS NOT NULL AND reserva_expira_em<=NOW()`
    );
    for (const row of rows) {
        await liberarReservasExpiradas(row.empresa_id);
    }
    return rows.length;
}

async function buscarVendaPagamento(referencia, empresaId, client) {

    const { rows } = await client.query(
        `
            SELECT *
            FROM vendas
            WHERE
                (
                    id::TEXT = $1
                    OR pagseguro_checkout_id = $1
                    OR pagseguro_order_id = $1
                    OR pagseguro_charge_id = $1
                )
                AND (
                    $2::uuid IS NULL
                    OR empresa_id = $2
                )
            LIMIT 1
            FOR UPDATE;
        `,
        [
            String(referencia || ""),
            empresaId || null
        ]
    );

    return rows[0] || null;

}

async function listarItensVenda(vendaId, empresaId, client) {

    const { rows } = await client.query(
        `
            SELECT
                iv.produto_id,
                iv.quantidade
            FROM itens_venda iv
            INNER JOIN vendas v
                ON v.id = iv.venda_id
            WHERE iv.venda_id = $1
              AND v.empresa_id = $2;
        `,
        [
            vendaId,
            empresaId
        ]
    );

    return rows;

}

async function gerarFinanceiroSeNaoExistir(empresaId, venda, client) {

    const { rows } = await client.query(
        `
            SELECT id
            FROM financeiro
            WHERE empresa_id = $1
              AND origem = 'VENDA'
              AND referencia_id = $2
            LIMIT 1;
        `,
        [
            empresaId,
            venda.id
        ]
    );

    if (rows[0]) {
        return rows[0];
    }

    return FinanceiroService.gerarContaReceber(
        empresaId,
        {
            id: venda.id,
            valor_total: venda.valor_final,
            data_venda: venda.data_venda,
            observacoes: venda.observacoes
        },
        client
    );

}

async function enviarEmailStatusPedido(venda, status) {

    const templateFactory = {
        PAGAMENTO_APROVADO: paymentApprovedTemplate,
        SAIU_PARA_ENTREGA: orderOutForDeliveryTemplate,
        ENTREGUE: orderDeliveredTemplate,
        CANCELADA: orderCanceledTemplate
    }[status];

    if (!templateFactory || !venda?.id || !venda?.empresa_id) {
        return null;
    }

    const pedido = await VendaModel.buscarPorId(
        venda.id,
        venda.empresa_id
    );

    const cliente = pedido?.cliente;

    if (!cliente?.email) {
        return null;
    }

    const template = templateFactory({
        name: cliente.nome,
        orderId: pedido.id,
        total: pedido.valor_final ?? pedido.valor_total
    });

    return sendOptionalEmail({
        to: cliente.email,
        subject: template.subject,
        html: template.html,
        text: template.text
    });

}

VendaService.liberarReservasExpiradas = liberarTodasReservasExpiradas;

module.exports = VendaService;
