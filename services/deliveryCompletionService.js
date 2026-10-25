"use strict";
const crypto = require("node:crypto");
const db = require("../database/connection");
const email = require("./emailService");
const audit = require("./auditService");
const fail = (message, status) => Object.assign(new Error(message), { status });

async function findReceipt(client, tokenHash, lock = false) {
    const { rows } = await client.query(`SELECT ec.*,v.empresa_id,v.cliente_id,c.nome,c.email
        FROM vendas v JOIN entrega_conclusoes ec ON ec.venda_id=v.id
        LEFT JOIN clientes c ON c.id=v.cliente_id AND c.empresa_id=v.empresa_id
        WHERE ec.token_hash=$1 AND ec.expira_em>NOW() AND v.status IN ('ENTREGUE','FINALIZADA')
        ${lock ? "FOR UPDATE OF v,ec" : ""}`, [tokenHash]);
    return rows[0];
}
async function receipt(tokenHash) {
    const row = await findReceipt(db, tokenHash);
    if (!row) return null;
    // O link encerrado só comprova sua própria conclusão; não revela mais o destino.
    const emailStatus = !row.email ? "not_applicable" : row.email_enviado_em ? "unchanged"
        : row.email_reservado_em && Date.now() - new Date(row.email_reservado_em).getTime() < 30000 ? "pending" : "failed";
    return { id: row.venda_id, status: "ENTREGUE", entregue_em: row.confirmado_em,
        concluida_pelo_entregador: true, emailStatus };
}
async function concluir(tokenHash) {
    const claim = crypto.randomUUID();
    const result = await db.transaction(async client => {
        let row = await findReceipt(client, tokenHash, true), changed = false;
        if (!row) {
            // Mesma ordem de bloqueios da alteração administrativa e da troca do link.
            const { rows } = await client.query(`SELECT v.id AS venda_id,v.empresa_id,v.cliente_id,c.nome,c.email,r.expira_em
                FROM vendas v JOIN entrega_rastreamento r ON r.venda_id=v.id
                LEFT JOIN clientes c ON c.id=v.cliente_id AND c.empresa_id=v.empresa_id
                WHERE r.token_hash=$1 AND r.expira_em>NOW() AND v.status='SAIU_PARA_ENTREGA'
                FOR UPDATE OF v,r`, [tokenHash]);
            const order = rows[0];
            if (order) {
                const updated = await client.query(`UPDATE vendas SET status='ENTREGUE'
                    WHERE id=$1 AND empresa_id=$2 AND status='SAIU_PARA_ENTREGA' RETURNING entregue_em`,
                [order.venda_id, order.empresa_id]);
                if (!updated.rows[0]) throw fail("A entrega já foi alterada. Atualize a página.", 409);
                const saved = await client.query(`INSERT INTO entrega_conclusoes (venda_id,token_hash,confirmado_em,expira_em)
                    VALUES ($1,$2,$3,$4) RETURNING *`,
                [order.venda_id, tokenHash, updated.rows[0].entregue_em, order.expira_em]);
                row = { ...order, ...saved.rows[0] };
                changed = true;
                await client.query(`INSERT INTO notificacoes_admin (empresa_id,venda_id,titulo,mensagem)
                    VALUES ($1,$2,$3,$4)`, [order.empresa_id, order.venda_id,
                    "Entrega concluída pelo entregador",
                    `O entregador confirmou a entrega do pedido #${order.venda_id.slice(0, 8).toUpperCase()}.`]);
                // O trigger de status já cria o aviso do cliente e encerra GPS/compartilhamento.
                await audit.registrar({ empresaId: order.empresa_id, acao: "CONCLUIR_ENTREGA", entidade: "VENDA",
                    entidadeId: order.venda_id, descricao: "Entrega confirmada pelo entregador pelo link privado.",
                    anterior: { status: "SAIU_PARA_ENTREGA" }, novo: { status: "ENTREGUE" } }, client);
            } else {
                // Uma confirmação concorrente pode ter encerrado o rastreamento enquanto aguardávamos.
                row = await findReceipt(client, tokenHash, true);
                if (!row) throw fail("Link expirado ou entrega encerrada.", 410);
            }
        }
        const response = { id: row.venda_id, status: "ENTREGUE", entregueEm: row.confirmado_em, changed };
        if (!row.email) return { ...response, emailStatus: "not_applicable" };
        if (row.email_enviado_em) return { ...response, emailStatus: "unchanged" };
        if (row.email_reservado_em && Date.now() - new Date(row.email_reservado_em).getTime() < 30000)
            return { ...response, emailStatus: "pending" };
        await client.query(`UPDATE entrega_conclusoes SET email_reservado_em=NOW(),email_reservado_id=$2
            WHERE venda_id=$1`, [row.venda_id, claim]);
        return { ...response, order: row };
    });
    if (!result.order) return result;
    const { order, ...response } = result;
    let sent = null;
    try {
        sent = await email.sendOptionalEmail({ to: order.email,
            ...email.orderDeliveredTemplate({ name: order.nome, orderId: order.venda_id }),
            idempotencyKey: `delivery-completed/${order.venda_id}` });
    } catch { /* A conclusão permanece salva; repetir a confirmação tenta somente o e-mail. */ }
    try {
        await db.query(`UPDATE entrega_conclusoes
            SET email_enviado_em=CASE WHEN $3 THEN NOW() ELSE email_enviado_em END,
            email_reservado_em=NULL,email_reservado_id=NULL WHERE venda_id=$1 AND email_reservado_id=$2`,
        [order.venda_id, claim, Boolean(sent)]);
    } catch { /* A reserva vence; o provedor recebe a mesma chave para evitar duplicação. */ }
    return { ...response, emailStatus: sent ? "sent" : "failed" };
}
module.exports = { concluir, receipt };
