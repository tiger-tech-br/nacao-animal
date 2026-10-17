"use strict";
const db = require("../database/connection");

exports.listar = async (req, res, next) => {
    try {
        const { rows } = await db.query(`SELECT n.*, (l.usuario_id IS NOT NULL) AS lida
            FROM notificacoes_admin n LEFT JOIN notificacoes_admin_leituras l
                ON l.notificacao_id=n.id AND l.usuario_id=$2
            WHERE n.empresa_id=$1 ORDER BY n.enviada_em DESC, n.id DESC LIMIT 100`, [req.user.empresaId, req.user.id]);
        res.set("Cache-Control", "no-store").json({ success: true, data: rows });
    } catch (e) { next(e); }
};
exports.ler = async (req, res, next) => {
    try {
        // Marca somente os avisos efetivamente apresentados, não os que chegaram durante a leitura.
        const ids = req.body?.ids;
        if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))
            return res.status(400).json({ success: false, message: "Notificações inválidas." });
        await db.query(`INSERT INTO notificacoes_admin_leituras (notificacao_id,usuario_id)
            SELECT id,$2 FROM notificacoes_admin WHERE empresa_id=$1 AND id=ANY($3::uuid[])
            ON CONFLICT DO NOTHING`, [req.user.empresaId, req.user.id, ids]);
        res.json({ success: true });
    } catch (e) { next(e); }
};
