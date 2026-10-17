"use strict";

const db = require("../database/connection");
const audit = require("../services/auditService");
const VendaService = require("../services/vendaService");
const { sendOptionalEmail } = require("../services/emailService");

async function listar(req, res, next) {
    try {
        const { rows } = await db.query(
            `SELECT s.*,c.nome AS cliente,c.email,v.status AS pedido_status,v.valor_final
             FROM solicitacoes_consumidor s
             LEFT JOIN clientes c ON c.id=s.cliente_id AND c.empresa_id=s.empresa_id
             JOIN vendas v ON v.id=s.venda_id AND v.empresa_id=s.empresa_id
             WHERE s.empresa_id=$1
             ORDER BY CASE s.status WHEN 'RECEBIDA' THEN 0 WHEN 'EM_ANALISE' THEN 1 ELSE 2 END,
                      s.solicitada_em DESC`, [req.user.empresaId]
        );
        res.set("Cache-Control", "no-store").json({ success: true, data: rows });
    } catch (error) { next(error); }
}

async function atualizar(req, res, next) {
    try {
        const status = String(req.body?.status || "").toUpperCase();
        const resposta = String(req.body?.resposta || "").trim().slice(0, 2000);
        if (!["RECEBIDA", "EM_ANALISE", "ATENDIDA", "NEGADA"].includes(status)) {
            return res.status(400).json({ success: false, message: "Status inválido." });
        }
        if (["ATENDIDA", "NEGADA"].includes(status) && resposta.length < 5) {
            return res.status(400).json({ success: false, message: "Informe a resposta enviada ao consumidor." });
        }
        const currentResult = await db.query(
            `SELECT s.*,v.status AS pedido_status,v.data_venda,r.latitude,r.longitude,r.precisao_m,r.atualizado_em,r.rota
             FROM solicitacoes_consumidor s
             JOIN vendas v ON v.id=s.venda_id AND v.empresa_id=s.empresa_id
             LEFT JOIN entrega_rastreamento r ON r.venda_id=v.id AND r.expira_em>NOW()
             WHERE s.id=$1 AND s.empresa_id=$2 LIMIT 1`, [req.params.id, req.user.empresaId]
        );
        const current = currentResult.rows[0];
        if (!current) return res.status(404).json({ success: false, message: "Solicitação não encontrada." });

        if (status === "ATENDIDA" && ["CANCELAMENTO", "ARREPENDIMENTO"].includes(current.tipo) &&
            !["CANCELADA", "ENTREGUE", "FINALIZADA"].includes(current.pedido_status)) {
            await VendaService.cancelarPedido(req.user.empresaId, current.venda_id, {
                usuarioId: req.user.id,
                motivo: `Atendimento ${current.protocolo}: ${current.motivo}`
            });
        }

        const result = await db.transaction(async client => {
            const locked = await client.query(
                "SELECT * FROM solicitacoes_consumidor WHERE id=$1 AND empresa_id=$2 FOR UPDATE",
                [req.params.id, req.user.empresaId]
            );
            if (!locked.rows[0]) return null;
            const { rows } = await client.query(
                `UPDATE solicitacoes_consumidor SET status=$1::varchar,resposta=$2,
                 atendida_em=CASE WHEN $1::varchar IN ('ATENDIDA','NEGADA') THEN NOW() ELSE NULL END,
                 atendida_por=CASE WHEN $1::varchar IN ('ATENDIDA','NEGADA') THEN $3::uuid ELSE NULL END,
                 updated_at=NOW() WHERE id=$4 AND empresa_id=$5 RETURNING *`,
                [status, resposta || null, req.user.id, req.params.id, req.user.empresaId]
            );
            await audit.registrar({ ...audit.requestMeta(req), acao: "ATENDER", entidade: "ATENDIMENTO",
                entidadeId: req.params.id, descricao: `Solicitação ${locked.rows[0].protocolo}: ${status}.`,
                anterior: locked.rows[0], novo: rows[0] }, client);
            const notify = ["ATENDIDA", "NEGADA"].includes(status) &&
                (locked.rows[0].status !== status || locked.rows[0].resposta !== rows[0].resposta);
            if (notify && rows[0].cliente_id) {
                await client.query(
                    `INSERT INTO notificacoes (cliente_id,venda_id,titulo,mensagem,tipo)
                     VALUES ($1,$2,$3,$4,'ATENDIMENTO')`,
                    [rows[0].cliente_id, rows[0].venda_id,
                        `Solicitação ${status === "ATENDIDA" ? "atendida" : "encerrada"}`,
                        `Protocolo ${rows[0].protocolo}: ${resposta}`]
                );
            }
            return { item: rows[0], notify };
        });
        if (!result) return res.status(404).json({ success: false, message: "Solicitação não encontrada." });
        if (result.notify && result.item.email_referencia) {
            await sendOptionalEmail({
                to: result.item.email_referencia,
                subject: `Resposta da loja - ${result.item.protocolo}`,
                text: `Protocolo ${result.item.protocolo}. ${resposta}`,
                html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px"><h1>Resposta da loja</h1><p>Protocolo: <strong>${escapeHtml(result.item.protocolo)}</strong></p><p>${escapeHtml(resposta)}</p></div>`,
                idempotencyKey: `atendimento/${result.item.id}/${result.item.status}/${result.item.updated_at}`
            });
        }
        return res.json({ success: true, message: "Solicitação atualizada.", data: result.item });
    } catch (error) { next(error); }
}

function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

module.exports = { listar, atualizar };
