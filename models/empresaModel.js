"use strict";

/* ==================================================
   DATABASE
================================================== */

const db = require("../database/connection");

/* ==================================================
   BUSCAR EMPRESA
================================================== */

async function findById(id) {

    const result = await db.query(

        `
            SELECT *

            FROM empresas

            WHERE id = $1

            LIMIT 1
        `,

        [id]

    );

    return result.rows[0] || null;

}

/* ==================================================
   ATUALIZAR
================================================== */

async function update(id, empresa) {
    const result = await db.query(
        `WITH previous AS (
            SELECT id, logo, logo_public_id FROM empresas WHERE id = $17 FOR UPDATE
        )
        UPDATE empresas e SET
            nome = $1, razao_social = $2, cnpj = $3, telefone = $4, email = $5,
            endereco = $6, numero = $7, complemento = $8, bairro = $9,
            cidade = $10, estado = $11, cep = $12,
            logo = CASE WHEN $18::boolean THEN $13::text ELSE e.logo END,
            horario_abertura = $14, horario_fechamento = $15,
            logo_public_id = CASE WHEN $18::boolean THEN $16::text ELSE e.logo_public_id END,
            updated_at = NOW()
        FROM previous WHERE e.id = previous.id
        RETURNING e.*, previous.logo AS previous_logo,
                  previous.logo_public_id AS previous_logo_public_id`,
        [empresa.nome, empresa.razaoSocial, empresa.cnpj, empresa.telefone, empresa.email,
            empresa.endereco, empresa.numero, empresa.complemento, empresa.bairro,
            empresa.cidade, empresa.estado, empresa.cep, empresa.logo,
            empresa.horarioAbertura, empresa.horarioFechamento, empresa.logoPublicId || null,
            id, Boolean(empresa.replaceImage)]
    );
    const row = result.rows[0];
    if (row) {
        const previousImage = { url: row.previous_logo, publicId: row.previous_logo_public_id };
        delete row.previous_logo;
        delete row.previous_logo_public_id;
        Object.defineProperty(row, "previousImage", { value: previousImage });
    }
    return row || null;
}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    findById,

    update

};