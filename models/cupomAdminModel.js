"use strict";

const db = require("../database/connection");

async function listar(empresaId) {
    const { rows } = await db.query(
        `SELECT c.*,
            (SELECT COUNT(*)::int FROM vendas v
             WHERE v.empresa_id=c.empresa_id AND v.cupom_codigo=c.codigo
               AND v.status <> 'CANCELADA') AS usos
         FROM cupons c WHERE c.empresa_id=$1 ORDER BY c.created_at DESC`,
        [empresaId]
    );
    return rows;
}

async function buscar(id, empresaId, client = db) {
    const { rows } = await client.query("SELECT * FROM cupons WHERE id=$1 AND empresa_id=$2", [id, empresaId]);
    return rows[0] || null;
}

function values(data, empresaId) {
    return [
        empresaId, String(data.codigo || "").trim().toUpperCase(),
        String(data.descricao || "").trim(), data.tipo,
        data.valor, data.minimo_compra || 0, data.desconto_maximo || null,
        data.inicia_em || new Date(), data.expira_em || null,
        data.ativo === true, data.publico === true,
        data.limite_usos || null, data.limite_por_cliente || null
    ];
}

async function criar(data, empresaId, client = db) {
    const { rows } = await client.query(
        `INSERT INTO cupons (empresa_id,codigo,descricao,tipo,valor,minimo_compra,
         desconto_maximo,inicia_em,expira_em,ativo,publico,limite_usos,limite_por_cliente)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        values(data, empresaId)
    );
    return rows[0];
}

async function atualizar(id, data, empresaId, client = db) {
    const params = values(data, empresaId);
    const { rows } = await client.query(
        `UPDATE cupons SET codigo=$2,descricao=$3,tipo=$4,valor=$5,minimo_compra=$6,
         desconto_maximo=$7,inicia_em=$8,expira_em=$9,ativo=$10,publico=$11,
         limite_usos=$12,limite_por_cliente=$13,updated_at=NOW()
         WHERE id=$14 AND empresa_id=$1 RETURNING *`,
        [...params, id]
    );
    return rows[0] || null;
}

async function desativar(id, empresaId, client = db) {
    const { rows } = await client.query(
        "UPDATE cupons SET ativo=FALSE, publico=FALSE, updated_at=NOW() WHERE id=$1 AND empresa_id=$2 RETURNING *",
        [id, empresaId]
    );
    return rows[0] || null;
}

module.exports = { listar, buscar, criar, atualizar, desativar };
