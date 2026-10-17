"use strict";

/* ==================================================
   DATABASE
================================================== */

const db = require("../database/connection");

/* ==================================================
   BUSCAR POR E-MAIL
================================================== */

async function findByEmail(email) {

    const result = await db.query(

        `
            SELECT

                id,

                get_petflow_empresa_id() AS empresa_id,

                nome,

                email,

                senha_hash AS senha,

                perfil AS cargo,

                ativo AS status,

                sessao_versao

            FROM usuarios

            WHERE LOWER(email) = LOWER($1)

            LIMIT 1
        `,

        [email]

    );

    return result.rows[0] || null;

}

/* ==================================================
   BUSCAR POR ID
================================================== */

async function findById(id) {

    const result = await db.query(

        `
            SELECT

                id,

                get_petflow_empresa_id() AS empresa_id,

                nome,

                email,

                perfil AS cargo,

                ativo AS status,

                sessao_versao,

                created_at,

                updated_at

            FROM usuarios

            WHERE id = $1

            LIMIT 1
        `,

        [id]

    );

    return result.rows[0] || null;

}

/* ==================================================
   ATUALIZAR ÚLTIMO LOGIN
================================================== */

async function updateLastLogin(id) {

    await db.query(

        `
            UPDATE usuarios

            SET ultimo_login = NOW()

            WHERE id = $1
        `,

        [id]

    );

}

async function setPasswordResetToken(id, token, expiresAt) {
    await db.query(
        `
            UPDATE usuarios
            SET
                token_recuperacao = $1,
                token_expiracao = $2,
                updated_at = NOW()
            WHERE id = $3
        `,
        [token, expiresAt, id]
    );
}

async function findByPasswordResetToken(token) {
    const result = await db.query(
        `
            SELECT id
            FROM usuarios
            WHERE token_recuperacao = $1
              AND token_expiracao > NOW()
              AND ativo = TRUE
            LIMIT 1
        `,
        [token]
    );

    return result.rows[0] || null;
}

async function updatePassword(id, senhaHash) {
    await db.query(
        `
            UPDATE usuarios
            SET
                senha_hash = $1,
                token_recuperacao = NULL,
                token_expiracao = NULL,
                sessao_versao = sessao_versao + 1,
                updated_at = NOW()
            WHERE id = $2
        `,
        [senhaHash, id]
    );
}

async function revokeSessions(id) {
    await db.query(
        "UPDATE usuarios SET sessao_versao=sessao_versao+1,updated_at=NOW() WHERE id=$1",
        [id]
    );
}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    findByEmail,

    findById,

    updateLastLogin,

    setPasswordResetToken,

    findByPasswordResetToken,

    updatePassword,

    revokeSessions

};
