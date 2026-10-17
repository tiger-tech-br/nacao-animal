"use strict";

const db = require("../database/connection");

function safeJson(value) {
    if (value == null) return null;
    const blocked = new Set([
        "senha", "password", "senha_hash", "token", "token_recuperacao",
        "pagseguro_response", "pagseguro_qr_code_text"
    ]);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)));
}

async function registrar({
    empresaId,
    usuarioId = null,
    acao,
    entidade,
    entidadeId = null,
    descricao,
    anterior = null,
    novo = null,
    ip = null
}, client = db) {
    if (!empresaId || !acao || !entidade || !descricao) return;
    await client.query(
        `INSERT INTO auditoria_admin
         (empresa_id, usuario_id, acao, entidade, entidade_id, descricao,
          dados_anteriores, dados_novos, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
        [
            empresaId, usuarioId, acao, entidade,
            entidadeId == null ? null : String(entidadeId), descricao,
            anterior == null ? null : JSON.stringify(safeJson(anterior)),
            novo == null ? null : JSON.stringify(safeJson(novo)),
            ip
        ]
    );
}

function requestMeta(request) {
    return {
        empresaId: request.user?.empresaId || request.user?.empresa_id,
        usuarioId: request.user?.id || null,
        ip: request.ip || request.socket?.remoteAddress || null
    };
}

module.exports = { registrar, requestMeta };
