"use strict";

const db = require("../database/connection");

const CompraModel = {

    async listar(empresaId) {

        const query = `
            SELECT
                c.*,
                f.nome AS fornecedor
            FROM compras c
            INNER JOIN fornecedores f
                ON f.id = c.fornecedor_id
            WHERE c.empresa_id = $1
            ORDER BY c.data_compra DESC, c.id DESC
        `;

        const { rows } = await db.query(query, [empresaId]);

        return rows;

    },

    async buscarPorId(id, empresaId, client = db) {

        const query = `
            SELECT *
            FROM compras
            WHERE id = $1
            AND empresa_id = $2
            LIMIT 1;
        `;

        const { rows } = await client.query(query, [

            id,
            empresaId

        ]);

        return rows[0];

    },

    async criar(dados, client = db) {

        const query = `
            INSERT INTO compras (

                empresa_id,
                fornecedor_id,
                data_compra,
                valor_total,
                observacoes,
                usuario_id,
                status

            )

            VALUES ($1, $2, $3, $4, $5, $6, $7)

            RETURNING *;
        `;

        const valores = [

            dados.empresa_id,
            dados.fornecedor_id,
            dados.data_compra,
            dados.valor_total,
            dados.observacoes,
            dados.usuario_id || null,
            dados.status || "RECEBIDA"

        ];

        const { rows } = await client.query(query, valores);

        return rows[0];

    },

    async atualizar(id, empresaId, dados, client = db) {

        const query = `
            UPDATE compras
            SET

                fornecedor_id = $1,
                data_compra = $2,
                valor_total = $3,
                observacoes = $4

            WHERE id = $5
            AND empresa_id = $6

            RETURNING *;
        `;

        const valores = [

            dados.fornecedor_id,
            dados.data_compra,
            dados.valor_total,
            dados.observacoes,
            id,
            empresaId

        ];

        const { rows } = await client.query(query, valores);

        return rows[0];

    },

    async atualizarValorTotal(id, valorTotal, client = db) {

        const query = `
            UPDATE compras
            SET

                valor_total = $1,
                updated_at = CURRENT_TIMESTAMP

            WHERE id = $2

            RETURNING *;
        `;

        const { rows } = await client.query(query, [

            valorTotal,
            id

        ]);

        return rows[0];

    },

    async excluir(id, empresaId, client = db) {

        const query = `
            DELETE FROM compras
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

};

module.exports = CompraModel;
