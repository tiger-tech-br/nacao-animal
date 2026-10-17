"use strict";

const db = require("../database/connection");

const CompraModel = require("../models/compraModel");
const ItemCompraModel = require("../models/itemCompraModel");

const MovimentacaoEstoqueService = require("./movimentacaoEstoqueService");
const FinanceiroService = require("./financeiroService");
const audit = require("./auditService");

const CompraService = {

    /* ==============================================
       FINALIZAR COMPRA
    ============================================== */

    async finalizarCompra(empresaId, compra, itens) {

        if (!Array.isArray(itens) || itens.length === 0) {

            throw new Error("A compra deve possuir pelo menos um item.");

        }

        const client = await db.connect();

        try {

            await client.query("BEGIN");

            const novaCompra = await CompraModel.criar({

                empresa_id: empresaId,
                fornecedor_id: compra.fornecedor_id,
                data_compra: compra.data_compra,
                valor_total: 0,
                observacoes: compra.observacoes,
                usuario_id: compra.usuario_id || null,
                status: "RECEBIDA"

            }, client);

            let valorTotal = 0;

            const itensCriados = [];

            for (const item of itens) {

                const quantidade = Number(item.quantidade);
                const valorUnitario = Number(item.valor_unitario);

                if (quantidade <= 0) {

                    throw new Error("Quantidade inválida.");

                }

                if (valorUnitario < 0) {

                    throw new Error("Valor unitário inválido.");

                }

                const subtotal = quantidade * valorUnitario;

                const novoItem = await ItemCompraModel.criar({

                    compra_id: novaCompra.id,
                    empresa_id: empresaId,
                    produto_id: item.produto_id,
                    quantidade,
                    valor_unitario: valorUnitario,
                    subtotal

                }, client);

                itensCriados.push(novoItem);

                await MovimentacaoEstoqueService.entrada(

                    empresaId,
                    item.produto_id,
                    quantidade,
                    client,
                    {
                        usuarioId: compra.usuario_id,
                        referenciaTipo: "COMPRA",
                        referenciaId: novaCompra.id,
                        observacao: "Entrada pela compra recebida"
                    }

                );

                valorTotal += subtotal;

            }

            const compraAtualizada = await CompraModel.atualizarValorTotal(

                novaCompra.id,
                valorTotal,
                client

            );

            /* ==========================================
               GERA CONTA A PAGAR
            ========================================== */

            await FinanceiroService.gerarContaPagar(

                empresaId,

                {

                    id: compraAtualizada.id,

                    valor_total: valorTotal,

                    data_compra: compra.data_compra,

                    observacoes: compra.observacoes

                },

                client

            );

            await audit.registrar({
                empresaId,
                usuarioId: compra.usuario_id || null,
                acao: "CRIAR",
                entidade: "COMPRA",
                entidadeId: compraAtualizada.id,
                descricao: `Compra recebida no valor de ${valorTotal.toFixed(2)}.`,
                novo: compraAtualizada
            }, client);

            await client.query("COMMIT");

            return {

                success: true,

                message: "Compra finalizada com sucesso.",

                compra: compraAtualizada,

                itens: itensCriados

            };

        } catch (error) {

            await client.query("ROLLBACK");

            throw error;

        } finally {

            client.release();

        }

    },

    async cancelarCompra(empresaId, compraId, usuarioId, motivo) {
        const texto = String(motivo || "").trim();
        if (texto.length < 5) throw Object.assign(new Error("Informe o motivo do cancelamento."), { status: 400 });

        return db.transaction(async client => {
            const result = await client.query(
                "SELECT * FROM compras WHERE id=$1 AND empresa_id=$2 FOR UPDATE",
                [compraId, empresaId]
            );
            const atual = result.rows[0];
            if (!atual) return null;
            if (atual.status === "CANCELADA") return atual;

            const { rows: itens } = await client.query(
                "SELECT produto_id,quantidade FROM itens_compra WHERE compra_id=$1 AND empresa_id=$2",
                [compraId, empresaId]
            );
            for (const item of itens) {
                await MovimentacaoEstoqueService.saida(empresaId, item.produto_id, item.quantidade, client, {
                    usuarioId,
                    referenciaTipo: "CANCELAMENTO_COMPRA",
                    referenciaId: compraId,
                    observacao: texto
                });
            }

            const { rows } = await client.query(
                `UPDATE compras SET status='CANCELADA',cancelado_em=NOW(),cancelado_por=$1,
                 motivo_cancelamento=$2,updated_at=NOW()
                 WHERE id=$3 AND empresa_id=$4 RETURNING *`,
                [usuarioId, texto, compraId, empresaId]
            );
            await FinanceiroService.cancelarPorReferencia(empresaId, "COMPRA", compraId, client);
            await audit.registrar({ empresaId, usuarioId, acao: "CANCELAR", entidade: "COMPRA",
                entidadeId: compraId, descricao: `Compra cancelada: ${texto}`, anterior: atual, novo: rows[0] }, client);
            return rows[0];
        });
    }

};

module.exports = CompraService;
