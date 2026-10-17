"use strict";

/* ==================================================
   DEPENDÊNCIAS
================================================== */

const db = require("../database/connection");

/* ==================================================
   MODEL
================================================== */

class FinanceiroModel {

    /* ==========================
       LISTAR LANÇAMENTOS
    ========================== */

    static async listar(empresaId) {

        const query = `
            SELECT *

            FROM financeiro

            WHERE empresa_id = $1

            ORDER BY data_vencimento ASC, id DESC;
        `;

        const { rows } = await db.query(query, [

            empresaId

        ]);

        return rows;

    }

    /* ==========================
       BUSCAR POR ID
    ========================== */

    static async buscarPorId(id, empresaId, client = db) {

        const query = `
            SELECT *

            FROM financeiro

            WHERE id = $1
              AND empresa_id = $2

            LIMIT 1;
        `;

        const { rows } = await client.query(query, [

            id,
            empresaId

        ]);

        return rows[0];

    }

    /* ==========================
       CADASTRAR
    ========================== */

    static async criar(dados, client = db) {

        const query = `
            INSERT INTO financeiro (

                empresa_id,
                tipo,
                origem,
                referencia_id,
                descricao,
                valor,
                valor_pago,
                data_vencimento,
                data_pagamento,
                status,
                observacoes,
                criado_por

            )

            VALUES (

                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12

            )

            RETURNING *;
        `;

        const values = [

            dados.empresa_id,
            dados.tipo,
            dados.origem,
            dados.referencia_id,
            dados.descricao,
            dados.valor,
            dados.valor_pago || 0,
            dados.data_vencimento,
            dados.data_pagamento || null,
            dados.status || "PENDENTE",
            dados.observacoes || null,
            dados.criado_por || null

        ];

        const { rows } = await client.query(query, values);

        return rows[0];

    }

    /* ==========================
       ATUALIZAR
    ========================== */

    static async atualizar(id, empresaId, dados, client = db) {

        const query = `
            UPDATE financeiro

            SET

                descricao = $1,
                tipo = $2,
                origem = $3,
                referencia_id = $4,
                valor = $5,
                valor_pago = $6,
                data_vencimento = $7,
                data_pagamento = $8,
                status = $9,
                observacoes = $10,
                updated_at = CURRENT_TIMESTAMP

            WHERE id = $11
              AND empresa_id = $12

            RETURNING *;
        `;

        const values = [

            dados.descricao,
            dados.tipo,
            dados.origem || null,
            dados.referencia_id || null,
            dados.valor,
            dados.valor_pago || 0,
            dados.data_vencimento,
            dados.data_pagamento || null,
            dados.status || "PENDENTE",
            dados.observacoes || null,
            id,
            empresaId

        ];

        const { rows } = await client.query(query, values);

        return rows[0];

    }

    /* ==========================
       EXCLUIR
    ========================== */

    static async excluir(id, empresaId, client = db) {

        const query = `
            DELETE

            FROM financeiro

            WHERE id = $1
              AND empresa_id = $2

            RETURNING *;
        `;

        const { rows } = await client.query(query, [

            id,
            empresaId

        ]);

        return rows[0];

    }

    static async buscarPorReferencia(empresaId, origem, referenciaId, client = db) {
        const { rows } = await client.query(
            `SELECT * FROM financeiro
             WHERE empresa_id=$1 AND origem=$2 AND referencia_id=$3
             ORDER BY created_at DESC LIMIT 1`,
            [empresaId, origem, referenciaId]
        );
        return rows[0] || null;
    }

    static async cancelarPorReferencia(empresaId, origem, referenciaId, client = db) {
        const { rows } = await client.query(
            `UPDATE financeiro SET status='CANCELADO', updated_at=NOW(),
             observacoes=CONCAT_WS(E'\n', observacoes, 'Cancelado automaticamente pela operação de origem.')
             WHERE empresa_id=$1 AND origem=$2 AND referencia_id=$3 AND status <> 'CANCELADO'
             RETURNING *`,
            [empresaId, origem, referenciaId]
        );
        return rows[0] || null;
    }

    /* ==========================
       CONTAS A RECEBER
    ========================== */

    static async listarReceber(empresaId) {

        const query = `
            SELECT *

            FROM financeiro

            WHERE empresa_id = $1
              AND tipo = 'RECEBER'

            ORDER BY data_vencimento;
        `;

        const { rows } = await db.query(query, [

            empresaId

        ]);

        return rows;

    }

    /* ==========================
       CONTAS A PAGAR
    ========================== */

    static async listarPagar(empresaId) {

        const query = `
            SELECT *

            FROM financeiro

            WHERE empresa_id = $1
              AND tipo = 'PAGAR'

            ORDER BY data_vencimento;
        `;

        const { rows } = await db.query(query, [

            empresaId

        ]);

        return rows;

    }

    /* ==========================
       TOTAL RECEBER
    ========================== */

    static async totalReceber(empresaId) {

        const query = `
            SELECT

                COALESCE(SUM(valor),0) AS total

            FROM financeiro

            WHERE empresa_id = $1
              AND tipo = 'RECEBER'
              AND status = 'PENDENTE';
        `;

        const { rows } = await db.query(query, [

            empresaId

        ]);

        return rows[0];

    }

    /* ==========================
       TOTAL PAGAR
    ========================== */

    static async totalPagar(empresaId) {

        const query = `
            SELECT

                COALESCE(SUM(valor),0) AS total

            FROM financeiro

            WHERE empresa_id = $1
              AND tipo = 'PAGAR'
              AND status = 'PENDENTE';
        `;

        const { rows } = await db.query(query, [

            empresaId

        ]);

        return rows[0];

    }

}

module.exports = FinanceiroModel;
