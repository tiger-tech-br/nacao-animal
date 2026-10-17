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

                id,

                nome,

                descricao,

                status,

                created_at,

                updated_at

            FROM categorias

            WHERE empresa_id = $1

            ORDER BY nome ASC
        `,

        [empresaId]

    );

    return result.rows;

}

/* ==================================================
   BUSCAR POR ID
================================================== */

async function findById(id, empresaId) {

    const result = await db.query(

        `
            SELECT *

            FROM categorias

            WHERE

                id = $1

            AND

                empresa_id = $2

            LIMIT 1
        `,

        [

            id,

            empresaId

        ]

    );

    return result.rows[0] || null;

}

/* ==================================================
   CADASTRAR
================================================== */

async function create(categoria) {

    const result = await db.query(

        `
            INSERT INTO categorias (

                empresa_id,

                nome,

                descricao,

                status

            )

            VALUES (

                $1,$2,$3,TRUE

            )

            RETURNING *
        `,

        [

            categoria.empresaId,

            categoria.nome,

            categoria.descricao

        ]

    );

    return result.rows[0];

}

/* ==================================================
   ATUALIZAR
================================================== */

async function update(id, categoria, empresaId) {

    const result = await db.query(

        `
            UPDATE categorias

            SET

                nome = $1,

                descricao = $2,

                updated_at = NOW()

            WHERE

                id = $3

            AND

                empresa_id = $4

            RETURNING *
        `,

        [

            categoria.nome,

            categoria.descricao,

            id,

            empresaId

        ]

    );

    return result.rows[0];

}

/* ==================================================
   REMOVER
================================================== */

async function remove(id, empresaId) {

    const result = await db.query(

        `
            UPDATE categorias

            SET status = FALSE,

                ativo = FALSE,

                updated_at = NOW()

            WHERE

                id = $1

            AND

                empresa_id = $2

            RETURNING *
        `,

        [

            id,

            empresaId

        ]

    );

    return result.rows[0] || null;

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    findAll,

    findById,

    create,

    update,

    remove

};
