"use strict";

const db = require("../database/connection");
const audit = require("../services/auditService");
const { sendOptionalEmail } = require("../services/emailService");

async function listar(req, res, next) {
    try {
        const { rows } = await db.query(
            `SELECT s.*,c.nome AS cliente,c.email FROM lgpd_solicitacoes s
             LEFT JOIN clientes c ON c.id=s.cliente_id
             WHERE s.empresa_id=$1 ORDER BY
             CASE s.status WHEN 'ABERTA' THEN 0 WHEN 'EM_ANALISE' THEN 1 ELSE 2 END,
             s.solicitada_em DESC`, [req.user.empresaId]
        );
        res.json({ success: true, data: rows });
    } catch (error) { next(error); }
}

async function atualizar(req, res, next) {
    try {
        const status = String(req.body?.status || "").toUpperCase();
        if (!["ABERTA","EM_ANALISE","ATENDIDA","NEGADA"].includes(status)) {
            return res.status(400).json({ success: false, message: "Status inválido." });
        }
        if (["ATENDIDA","NEGADA"].includes(status) && String(req.body?.resposta || "").trim().length < 5) {
            return res.status(400).json({ success: false, message: "Informe a resposta enviada ao titular." });
        }
        const result = await db.transaction(async client => {
            const previous = await client.query(
                "SELECT * FROM lgpd_solicitacoes WHERE id=$1 AND empresa_id=$2 FOR UPDATE",
                [req.params.id, req.user.empresaId]
            );
            if (!previous.rows[0]) return null;
            const { rows } = await client.query(
                `UPDATE lgpd_solicitacoes SET status=$1::varchar,resposta=$2,
                 atendida_em=CASE WHEN $1::varchar IN ('ATENDIDA','NEGADA') THEN NOW() ELSE NULL END,
                 atendida_por=CASE WHEN $1::varchar IN ('ATENDIDA','NEGADA') THEN $3::uuid ELSE NULL END,
                 updated_at=NOW() WHERE id=$4 AND empresa_id=$5 RETURNING *`,
                [status, String(req.body?.resposta || "").trim() || null, req.user.id,
                    req.params.id, req.user.empresaId]
            );
            await audit.registrar({ ...audit.requestMeta(req), acao: "ATENDER", entidade: "LGPD",
                entidadeId: req.params.id, descricao: `Solicitação ${previous.rows[0].protocolo}: ${status}.`,
                anterior: previous.rows[0], novo: rows[0] }, client);
            return {
                item: rows[0],
                shouldNotify: ["ATENDIDA", "NEGADA"].includes(status) &&
                    (previous.rows[0].status !== status || previous.rows[0].resposta !== rows[0].resposta)
            };
        });
        if (!result) return res.status(404).json({ success: false, message: "Solicitação não encontrada." });
        const item = result.item;
        if (result.shouldNotify && item.email_referencia) {
            const safeProtocol = escapeHtml(item.protocolo);
            const safeStatus = escapeHtml(item.status === "ATENDIDA" ? "atendida" : "encerrada");
            const safeAnswer = escapeHtml(item.resposta || "Consulte a loja para mais informações.");
            await sendOptionalEmail({
                to: item.email_referencia,
                subject: `Solicitação LGPD ${item.protocolo} ${item.status === "ATENDIDA" ? "atendida" : "encerrada"}`,
                text: `Sua solicitação ${item.protocolo} foi ${item.status === "ATENDIDA" ? "atendida" : "encerrada"}. Resposta: ${item.resposta || "Consulte a loja."}`,
                html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#10212b">
                    <h1>Solicitação de privacidade ${safeStatus}</h1>
                    <p>Protocolo: <strong>${safeProtocol}</strong></p><p>${safeAnswer}</p>
                    <p>Você também pode consultar o histórico em Minha conta.</p></div>`,
                idempotencyKey: `lgpd/${item.id}/${item.status}/${item.updated_at}`
            });
        }
        res.json({ success: true, message: "Solicitação atualizada.", data: item });
    } catch (error) { next(error); }
}

module.exports = { listar, atualizar };

function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
