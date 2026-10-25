"use strict";
const crypto = require("node:crypto");
const db = require("../database/connection");
const links = require("../public/js/pages/delivery/location-share-link");
const email = require("./emailService");
const fail = (message, status) => Object.assign(new Error(message), { status });

async function authorize(client, tokenHash) {
    // Usa a mesma ordem de locks da alteração de status e da geração do link.
    const { rows } = await client.query(`SELECT v.id AS venda_id,v.empresa_id,v.cliente_id,c.nome,c.email
        FROM vendas v JOIN entrega_rastreamento r ON r.venda_id=v.id
        LEFT JOIN clientes c ON c.id=v.cliente_id AND c.empresa_id=v.empresa_id
        WHERE r.token_hash=$1 AND r.expira_em>NOW() AND v.status='SAIU_PARA_ENTREGA'
        FOR UPDATE OF v,r`, [tokenHash]);
    if (!rows[0]) throw fail("Link expirado ou entrega encerrada.", 410);
    return rows[0];
}
function publicShare(row) {
    if (!row || !row.url || new Date(row.expira_em).getTime() <= Date.now()) return null;
    try {
        const url = links.parse(row.url);
        const updated = new Date(row.atualizado_em), expires = new Date(row.expira_em);
        if (!Number.isFinite(updated.getTime()) || !Number.isFinite(expires.getTime())) return null;
        return { url, atualizado_em: updated.toISOString(), expira_em: expires.toISOString() };
    } catch { return null; }
}
async function notify(client, order, title, message) {
    await client.query(`INSERT INTO notificacoes_admin (empresa_id,venda_id,titulo,mensagem)
        VALUES ($1,$2,$3,$4)`, [order.empresa_id, order.venda_id, title, message]);
    if (order.cliente_id) await client.query(`INSERT INTO notificacoes (cliente_id,venda_id,status_pedido,titulo,mensagem,tipo)
        VALUES ($1,$2,'SAIU_PARA_ENTREGA',$3,$4,'SISTEMA')`, [order.cliente_id, order.venda_id, title, message]);
}
async function compartilhar(tokenHash, value) {
    let url;
    try { url = links.parse(value); } catch (error) { throw fail(error.message, 400); }
    const claim = crypto.randomUUID();
    const result = await db.transaction(async client => {
        const order = await authorize(client, tokenHash);
        const { rows } = await client.query("SELECT * FROM entrega_localizacao_compartilhada WHERE venda_id=$1 FOR UPDATE", [order.venda_id]);
        let row = rows[0];
        const changed = !publicShare(row) || row.url !== url;
        if (changed) {
            const saved = await client.query(`INSERT INTO entrega_localizacao_compartilhada
                (venda_id,url,atualizado_em,expira_em,email_enviado_em,email_reservado_em,email_reservado_id)
                VALUES ($1,$2,NOW(),NOW()+INTERVAL '24 hours',NULL,NULL,NULL)
                ON CONFLICT (venda_id) DO UPDATE SET url=EXCLUDED.url,atualizado_em=EXCLUDED.atualizado_em,
                expira_em=EXCLUDED.expira_em,email_enviado_em=NULL,email_reservado_em=NULL,email_reservado_id=NULL
                RETURNING *`, [order.venda_id, url]);
            row = saved.rows[0];
            await notify(client, order, "Localização da entrega disponível", "O entregador compartilhou um link do Google Maps para esta entrega. Abra o pedido para acompanhar.");
        }
        const compartilhamento = publicShare(row);
        if (!order.email) return { compartilhamento, changed, emailStatus: "not_applicable" };
        if (row.email_enviado_em) return { compartilhamento, changed, emailStatus: "unchanged" };
        if (row.email_reservado_em && Date.now() - new Date(row.email_reservado_em).getTime() < 30000)
            return { compartilhamento, changed, emailStatus: "pending" };
        await client.query(`UPDATE entrega_localizacao_compartilhada
            SET email_reservado_em=NOW(),email_reservado_id=$2 WHERE venda_id=$1`, [order.venda_id, claim]);
        return { compartilhamento, changed, order, claim };
    });
    if (!result.order) return result;
    const { order, compartilhamento } = result;
    const key = crypto.createHash("sha256").update(`${order.venda_id}\n${url}\n${compartilhamento.atualizado_em}`).digest("hex");
    let sent = null;
    try {
        sent = await email.sendOptionalEmail({ to: order.email,
            ...email.deliveryLocationSharedTemplate({ name: order.nome, orderId: order.venda_id }),
            idempotencyKey: `delivery-location/${key}` });
    } catch { /* O link e os avisos persistidos continuam disponíveis para nova tentativa. */ }
    try {
        await db.query(`UPDATE entrega_localizacao_compartilhada
            SET email_enviado_em=CASE WHEN $3 THEN NOW() ELSE email_enviado_em END,
            email_reservado_em=NULL,email_reservado_id=NULL WHERE venda_id=$1 AND email_reservado_id=$2`,
        [order.venda_id, claim, Boolean(sent)]);
    } catch { /* Uma reserva vencida permite repetir com a mesma chave de idempotência. */ }
    return { compartilhamento, changed: result.changed, emailStatus: sent ? "sent" : "failed" };
}
async function remover(tokenHash) {
    return db.transaction(async client => {
        const order = await authorize(client, tokenHash);
        const removed = await client.query("DELETE FROM entrega_localizacao_compartilhada WHERE venda_id=$1 RETURNING venda_id", [order.venda_id]);
        const changed = Boolean(removed.rowCount);
        if (changed) await notify(client, order, "Link de localização removido", "O link de localização foi removido do site. Continue acompanhando os status do pedido.");
        return { changed };
    });
}
module.exports = { compartilhar, remover, publicShare };
