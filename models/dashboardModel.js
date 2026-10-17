"use strict";

const db = require("../database/connection");

const STATUS_VENDAS_CONFIRMADAS = [
    "PAGAMENTO_APROVADO",
    "EM_SEPARACAO",
    "SAIU_PARA_ENTREGA",
    "ENTREGUE",
    "FINALIZADA"
];

class DashboardModel {

    /* ==============================================
       RESUMO GERAL
    ============================================== */

    static async resumo(empresaId) {

        const query = `

            SELECT

                /* Clientes */

                (
                    SELECT COUNT(*)

                    FROM clientes

                    WHERE empresa_id = $1
                ) AS total_clientes,

                /* Produtos */

                (
                    SELECT COUNT(*)

                    FROM produtos

                    WHERE empresa_id = $1
                ) AS total_produtos,

                /* Vendas */

                (
                    SELECT COALESCE(SUM(valor_total),0)

                    FROM vendas

                    WHERE empresa_id = $1

                    AND DATE(data_venda)=CURRENT_DATE

                    AND status = ANY($2)

                ) AS vendas_hoje,

                (
                    SELECT COUNT(*)

                    FROM vendas

                    WHERE empresa_id = $1

                    AND DATE(data_venda)=CURRENT_DATE

                    AND status = ANY($2)

                ) AS total_pedidos,

                (
                    SELECT COALESCE(SUM(valor_total),0)

                    FROM vendas

                    WHERE empresa_id=$1

                    AND DATE_TRUNC('month',data_venda)=DATE_TRUNC('month',CURRENT_DATE)

                    AND status = ANY($2)

                ) AS vendas_mes,

                /* Compras */

                (
                    SELECT COALESCE(SUM(valor_total),0)

                    FROM compras

                    WHERE empresa_id=$1

                    AND DATE_TRUNC('month',data_compra)=DATE_TRUNC('month',CURRENT_DATE)

                ) AS compras_mes,

                /* Financeiro */

                (
                    SELECT COALESCE(SUM(valor),0)

                    FROM financeiro

                    WHERE empresa_id=$1

                    AND tipo='RECEBER'

                    AND status='PENDENTE'

                ) AS contas_receber,

                (
                    SELECT COALESCE(SUM(valor),0)

                    FROM financeiro

                    WHERE empresa_id=$1

                    AND tipo='PAGAR'

                    AND status='PENDENTE'

                ) AS contas_pagar,

                (
                    SELECT COUNT(*)

                    FROM estoque

                    WHERE empresa_id=$1

                    AND quantidade <= 5

                ) AS estoque_baixo;

        `;

        const { rows } = await db.query(query, [
            empresaId,
            STATUS_VENDAS_CONFIRMADAS
        ]);

        return rows[0];

    }

    /* ==============================================
       ÚLTIMAS VENDAS
    ============================================== */

    static async ultimasVendas(empresaId, limite = 10) {

        const query = `

            SELECT

                v.id,

                c.nome AS cliente,

                c.telefone AS cliente_telefone,

                c.whatsapp AS cliente_whatsapp,

                c.email AS cliente_email,

                c.endereco AS cliente_endereco,

                c.numero AS cliente_numero,

                c.complemento AS cliente_complemento,

                c.bairro AS cliente_bairro,

                c.cidade AS cliente_cidade,

                c.estado AS cliente_estado,

                v.valor_total,

                v.status,

                v.data_venda

            FROM vendas v

            LEFT JOIN clientes c

            ON c.id = v.cliente_id

            WHERE v.empresa_id=$1

            AND v.status <> 'CANCELADA'

            ORDER BY v.data_venda DESC

            LIMIT $2;

        `;

        const { rows } = await db.query(query, [

            empresaId,

            limite

        ]);

        return rows;

    }

    /* ==============================================
       ÚLTIMAS COMPRAS
    ============================================== */

    static async ultimasCompras(empresaId, limite = 10) {

        const query = `

            SELECT

                c.id,

                f.nome AS fornecedor,

                c.valor_total,

                c.data_compra

            FROM compras c

            LEFT JOIN fornecedores f

            ON f.id = c.fornecedor_id

            WHERE c.empresa_id=$1

            ORDER BY c.data_compra DESC

            LIMIT $2;

        `;

        const { rows } = await db.query(query, [

            empresaId,

            limite

        ]);

        return rows;

    }

    /* ==============================================
       PRODUTOS COM ESTOQUE BAIXO
    ============================================== */

    static async estoqueBaixo(empresaId) {

        const query = `

            SELECT

                p.id,

                p.nome,

                e.quantidade

            FROM estoque e

            INNER JOIN produtos p

                ON p.id = e.produto_id

            WHERE e.empresa_id=$1

            AND e.quantidade <= 5

            ORDER BY e.quantidade ASC;

        `;

        const { rows } = await db.query(query, [

            empresaId

        ]);

        return rows;

    }



    /* ==============================================
       CONTAS VENCIDAS
    ============================================== */

    static async contasVencidas(empresaId) {

        const query = `
            SELECT *
            FROM financeiro
            WHERE empresa_id = $1
              AND status = 'PENDENTE'
              AND data_vencimento < CURRENT_DATE
            ORDER BY data_vencimento ASC;
        `;

        const { rows } = await db.query(query, [empresaId]);

        return rows;

    }

    /* ==============================================
       PRODUTOS MAIS VENDIDOS
    ============================================== */

    static async produtosMaisVendidos(empresaId, limite = 10) {

        const query = `
            SELECT
                p.id,
                p.nome,
                SUM(iv.quantidade) AS quantidade
            FROM itens_venda iv
            INNER JOIN vendas v
                ON v.id = iv.venda_id
            INNER JOIN produtos p
                ON p.id = iv.produto_id
            WHERE v.empresa_id = $1
              AND v.status = ANY($3)
            GROUP BY p.id, p.nome
            ORDER BY quantidade DESC
            LIMIT $2;
        `;

        const { rows } = await db.query(query, [
            empresaId,
            limite,
            STATUS_VENDAS_CONFIRMADAS
        ]);

        return rows;

    }



}

module.exports = DashboardModel;
