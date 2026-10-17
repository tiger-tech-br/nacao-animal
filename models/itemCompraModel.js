"use strict";

const db = require("../database/connection");

const ItemCompraModel = {

    async listar(compraId, empresaId) {

        const query = `
            SELECT

                ic.*,

                p.nome AS produto

            FROM itens_compra ic

            INNER JOIN produtos p
                ON p.id = ic.produto_id

            WHERE ic.compra_id = $1
            AND ic.empresa_id = $2

            ORDER BY ic.id ASC;
        `;

        const { rows } = await db.query(query, [

            compraId,
            empresaId

        ]);

        return rows;

    },

    async buscarPorId(id, empresaId) {

        const query = `
            SELECT *
            FROM itens_compra
            WHERE id = $1
            AND empresa_id = $2
            LIMIT 1;
        `;

        const { rows } = await db.query(query, [

            id,
            empresaId

        ]);

        return rows[0];

    },

    async criar(dados, client = db) {

        const query = `
            INSERT INTO itens_compra (

                compra_id,
                empresa_id,
                produto_id,
                quantidade,
                valor_unitario,
                subtotal

            )

            VALUES ($1, $2, $3, $4, $5, $6)

            RETURNING *;
        `;

        const valores = [

            dados.compra_id || dados.compraId,
            dados.empresa_id || dados.empresaId,
            dados.produto_id || dados.produtoId,
            dados.quantidade,
            dados.valor_unitario || dados.valorUnitario,
            dados.subtotal

        ];

        const { rows } = await client.query(query, valores);

        return rows[0];

    },

    async atualizar(id, empresaId, dados, client = db) {

        const query = `
            UPDATE itens_compra
            SET

                produto_id = $1,
                quantidade = $2,
                valor_unitario = $3,
                subtotal = $4

            WHERE id = $5
            AND empresa_id = $6

            RETURNING *;
        `;

        const valores = [

            dados.produto_id || dados.produtoId,
            dados.quantidade,
            dados.valor_unitario || dados.valorUnitario,
            dados.subtotal,
            id,
            empresaId

        ];

        const { rows } = await client.query(query, valores);

        return rows[0];

    },

    async excluir(id, empresaId, client = db) {

        const query = `
            DELETE FROM itens_compra
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

module.exports = ItemCompraModel;
