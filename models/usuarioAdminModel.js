"use strict";

const db = require("../database/connection");

async function listar(empresaId) {
    const { rows } = await db.query(
        `SELECT id,nome,email,perfil,ativo,ultimo_login,created_at,updated_at
         FROM usuarios WHERE empresa_id=$1 ORDER BY ativo DESC,nome`, [empresaId]
    );
    return rows;
}
async function buscar(id, empresaId, client = db) {
    const { rows } = await client.query(
        `SELECT id,nome,email,perfil,ativo,ultimo_login,created_at,updated_at
         FROM usuarios WHERE id=$1 AND empresa_id=$2`, [id, empresaId]
    );
    return rows[0] || null;
}
async function criar(data, empresaId, senhaHash, client = db) {
    const { rows } = await client.query(
        `INSERT INTO usuarios (empresa_id,nome,email,senha_hash,perfil,ativo)
         VALUES ($1,$2,LOWER($3),$4,$5,$6) RETURNING id,nome,email,perfil,ativo,created_at`,
        [empresaId, data.nome.trim(), data.email.trim(), senhaHash, data.perfil, data.ativo !== false]
    );
    return rows[0];
}
async function atualizar(id, data, empresaId, senhaHash, client = db) {
    const { rows } = await client.query(
        `UPDATE usuarios SET nome=$1,email=LOWER($2),perfil=$3,ativo=$4,
         sessao_versao=sessao_versao + CASE
            WHEN perfil IS DISTINCT FROM $3 OR ativo IS DISTINCT FROM $4 OR $5::text IS NOT NULL THEN 1 ELSE 0 END,
         senha_hash=COALESCE($5,senha_hash),updated_at=NOW()
         WHERE id=$6 AND empresa_id=$7
         RETURNING id,nome,email,perfil,ativo,ultimo_login,created_at,updated_at`,
        [data.nome.trim(), data.email.trim(), data.perfil, data.ativo !== false, senhaHash, id, empresaId]
    );
    return rows[0] || null;
}
async function contarAdminsAtivos(empresaId, client = db) {
    const { rows } = await client.query(
        "SELECT COUNT(*)::int AS total FROM usuarios WHERE empresa_id=$1 AND perfil='ADMIN' AND ativo=TRUE",
        [empresaId]
    );
    return rows[0].total;
}
module.exports = { listar, buscar, criar, atualizar, contarAdminsAtivos };
