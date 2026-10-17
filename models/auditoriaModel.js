"use strict";

const db = require("../database/connection");

async function listar(empresaId, { busca = "", acao = "", entidade = "", pagina = 1, limite = 50 } = {}) {
    pagina = Math.max(1, Number(pagina) || 1);
    limite = Math.min(100, Math.max(1, Number(limite) || 50));
    const termo = `%${String(busca || "").trim()}%`;
    const values = [empresaId, termo, acao || null, entidade || null, limite, (pagina - 1) * limite];
    const where = `a.empresa_id=$1
        AND ($2='%%' OR a.descricao ILIKE $2 OR COALESCE(u.nome,'') ILIKE $2 OR COALESCE(a.entidade_id,'') ILIKE $2)
        AND ($3::text IS NULL OR a.acao=$3)
        AND ($4::text IS NULL OR a.entidade=$4)`;
    const [{ rows }, count] = await Promise.all([
        db.query(`SELECT a.*, u.nome AS usuario
                  FROM auditoria_admin a LEFT JOIN usuarios u ON u.id=a.usuario_id
                  WHERE ${where} ORDER BY a.created_at DESC LIMIT $5 OFFSET $6`, values),
        db.query(`SELECT COUNT(*)::int AS total FROM auditoria_admin a
                  LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE ${where}`, values.slice(0, 4))
    ]);
    return { registros: rows, total: count.rows[0].total, pagina, limite };
}

module.exports = { listar };
