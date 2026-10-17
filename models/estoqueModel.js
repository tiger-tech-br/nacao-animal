"use strict";

/* ==================================================
   DATABASE
================================================== */

const db = require("../database/connection");

/* ==================================================
   LISTAR
================================================== */

async function findAll(empresaId) {

    const result = await db.query(

        `
            SELECT

                e.id,

                p.id AS produto_id,

                p.nome,

                p.sku,

                p.codigo_barras,

                e.quantidade,

                e.estoque_minimo,

                e.estoque_maximo,

                e.localizacao,

                p.preco,

                p.status

            FROM estoque e

            INNER JOIN produtos p

                ON p.id = e.produto_id

            WHERE e.empresa_id = $1

            ORDER BY p.nome ASC
        `,

        [empresaId]

    );

    return result.rows;

}

/* ==================================================
   BUSCAR POR PRODUTO
================================================== */

async function findByProduct(produtoId, empresaId) {

    const result = await db.query(

        `
            SELECT *

            FROM estoque

            WHERE

                produto_id = $1

            AND

                empresa_id = $2

            LIMIT 1
        `,

        [

            produtoId,

            empresaId

        ]

    );

    return result.rows[0] || null;

}

/* ==================================================
   CADASTRAR
================================================== */

async function create(estoque) {

    const result = await db.query(

        `
            INSERT INTO estoque (

                empresa_id,

                produto_id,

                quantidade,

                estoque_minimo,

                estoque_maximo,

                localizacao

            )

            VALUES (

                $1,$2,$3,$4,$5,$6

            )

            RETURNING *
        `,

        [

            estoque.empresaId,

            estoque.produtoId,

            estoque.quantidade,

            estoque.estoqueMinimo,

            estoque.estoqueMaximo,

            estoque.localizacao

        ]

    );

    return result.rows[0];

}

/* ==================================================
   ATUALIZAR
================================================== */

async function update(produtoId, estoque, empresaId) {

    const result = await db.query(

        `
            UPDATE estoque

            SET

                quantidade = $1,

                estoque_minimo = $2,

                estoque_maximo = $3,

                localizacao = $4,

                updated_at = NOW()

            WHERE

                produto_id = $5

            AND

                empresa_id = $6

            RETURNING *
        `,

        [

            estoque.quantidade,

            estoque.estoqueMinimo,

            estoque.estoqueMaximo,

            estoque.localizacao,

            produtoId,

            empresaId

        ]

    );

    return result.rows[0];

}

/* ==================================================
   REMOVER
================================================== */

async function remove(produtoId, empresaId) {

    await db.query(

        `
            DELETE FROM estoque

            WHERE

                produto_id = $1

            AND

                empresa_id = $2
        `,

        [

            produtoId,

            empresaId

        ]

    );

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    findAll,

    findByProduct,

    create,

    update,

    remove

};