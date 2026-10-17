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

                p.id,

                p.categoria_id,

                p.nome,

                p.descricao,

                p.preco,

                p.custo,

                p.codigo_barras,

                p.sku,

                p.foto,

                p.status,

                c.nome AS categoria,

                f.id AS fornecedor_id,

                f.nome AS fornecedor

            FROM produtos p

            INNER JOIN categorias c

                ON c.id = p.categoria_id

            LEFT JOIN fornecedores f

                ON f.id = p.fornecedor_id

            WHERE p.empresa_id = $1

            ORDER BY p.nome ASC
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

            FROM produtos

            WHERE

                id = $1

            AND empresa_id = $2

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

async function create(produto) {

    const result = await db.query(

        `
            INSERT INTO produtos (

                empresa_id,

                categoria_id,

                fornecedor_id,

                nome,

                descricao,

                sku,

                codigo_barras,

                preco,

                custo,

                foto,

                foto_public_id,

                status

            )

            VALUES (

                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE

            )

            RETURNING *
        `,

        [

            produto.empresaId,

            produto.categoriaId,

            produto.fornecedorId || produto.fornecedor_id || null,

            produto.nome,

            produto.descricao,

            produto.sku,

            produto.codigoBarras,

            produto.preco,

            produto.custo,

            produto.foto,

            produto.fotoPublicId || null

        ]

    );

    return result.rows[0];

}

/* ==================================================
   ATUALIZAR
================================================== */

async function update(id, produto, empresaId) {
    const result = await db.query(
        `WITH previous AS (
            SELECT id, foto, foto_public_id FROM produtos
            WHERE id = $11 AND empresa_id = $12 FOR UPDATE
        )
        UPDATE produtos p SET
            categoria_id = $1, fornecedor_id = $2, nome = $3, descricao = $4,
            sku = $5, codigo_barras = $6, preco = $7, custo = $8,
            foto = CASE WHEN $13::boolean THEN $9::text ELSE p.foto END,
            foto_public_id = CASE WHEN $13::boolean THEN $10::text ELSE p.foto_public_id END,
            updated_at = NOW()
        FROM previous WHERE p.id = previous.id AND p.empresa_id = $12
        RETURNING p.*, previous.foto AS previous_foto,
                  previous.foto_public_id AS previous_foto_public_id`,
        [produto.categoriaId, produto.fornecedorId || produto.fornecedor_id || null,
            produto.nome, produto.descricao, produto.sku, produto.codigoBarras,
            produto.preco, produto.custo, produto.foto, produto.fotoPublicId || null,
            id, empresaId, Boolean(produto.replaceImage)]
    );
    const row = result.rows[0];
    if (row) {
        const previousImage = { url: row.previous_foto, publicId: row.previous_foto_public_id };
        delete row.previous_foto;
        delete row.previous_foto_public_id;
        Object.defineProperty(row, "previousImage", { value: previousImage });
    }
    return row || null;
}

/* ==================================================
   REMOVER
================================================== */

async function remove(id, empresaId) {
    const result = await db.query(

        `
            UPDATE produtos

            SET ativo = FALSE, status = FALSE, updated_at = NOW()

            WHERE

                id = $1

            AND empresa_id = $2
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
