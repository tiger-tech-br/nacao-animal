"use strict";

const db = require("../database/connection");
const FIELDS = "id,empresa_id,nome,telefone,meio_transporte,ativo,created_at,updated_at";

async function listar(empresaId, ativo = null, client = db) {
    const { rows } = await client.query(`SELECT ${FIELDS} FROM entregadores
        WHERE empresa_id=$1 AND ($2::boolean IS NULL OR ativo=$2)
        ORDER BY nome ASC,id ASC`, [empresaId, ativo]);
    return rows;
}

async function buscarPorId(id, empresaId, client = db, lock = false) {
    const { rows } = await client.query(`SELECT ${FIELDS} FROM entregadores
        WHERE id=$1 AND empresa_id=$2${lock ? " FOR UPDATE" : ""}`, [id, empresaId]);
    return rows[0];
}

async function criar(dados, client = db) {
    const { rows } = await client.query(`INSERT INTO entregadores
        (empresa_id,nome,telefone,meio_transporte,ativo) VALUES ($1,$2,$3,$4,$5)
        RETURNING ${FIELDS}`, [dados.empresa_id, dados.nome, dados.telefone, dados.meio_transporte, dados.ativo]);
    return rows[0];
}

async function atualizar(id, empresaId, dados, client = db) {
    const { rows } = await client.query(`UPDATE entregadores SET nome=$1,telefone=$2,
        meio_transporte=$3,ativo=$4,updated_at=NOW() WHERE id=$5 AND empresa_id=$6
        RETURNING ${FIELDS}`, [dados.nome, dados.telefone, dados.meio_transporte, dados.ativo, id, empresaId]);
    return rows[0];
}

async function desativar(id, empresaId, client = db) {
    const { rows } = await client.query(`UPDATE entregadores SET ativo=FALSE,updated_at=NOW()
        WHERE id=$1 AND empresa_id=$2 RETURNING ${FIELDS}`, [id, empresaId]);
    return rows[0];
}

module.exports = { listar, buscarPorId, criar, atualizar, desativar };
