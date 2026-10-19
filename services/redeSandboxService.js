"use strict";

const { randomUUID } = require("node:crypto");

// Endpoints fixos: esta ferramenta nunca usa credenciais ou URLs de produção.
const TOKEN_URL = "https://rl7-sandbox-api.useredecloud.com.br/oauth2/token";
const TRANSACTIONS_URL = "https://sandbox-erede.useredecloud.com.br/v2/transactions";
const TEST_CARD = Object.freeze({
    cardNumber: "5448280000000007", expirationMonth: 1, expirationYear: 2035, securityCode: "123"
});

function safeError(status, message) {
    return Object.assign(new Error(message), { status });
}

function configured(env = process.env) {
    return Boolean(env.REDE_CLIENT_ID?.trim() && env.REDE_CLIENT_SECRET?.trim());
}

function validate(input) {
    if (!input || !["approved", "declined"].includes(input.scenario) ||
        typeof input.cardNumber !== "string" ||
        input.cardNumber.replace(/[ -]/g, "") !== TEST_CARD.cardNumber ||
        Number(input.expirationMonth) !== TEST_CARD.expirationMonth ||
        Number(input.expirationYear) !== TEST_CARD.expirationYear ||
        String(input.securityCode) !== TEST_CARD.securityCode) {
        throw safeError(400, "Use somente o cartão fictício indicado nesta página e escolha um cenário de teste.");
    }
}

async function simulate(input, { env = process.env, fetchImpl = global.fetch } = {}) {
    if (env.NODE_ENV !== "development" || env.PAYMENT_ENVIRONMENT !== "sandbox") {
        throw safeError(404, "Teste disponível apenas no ambiente local de desenvolvimento e Sandbox.");
    }
    validate(input);
    if (!configured(env)) throw safeError(503, "Preencha as credenciais de Sandbox da Rede no .env e reinicie o servidor.");

    async function request(url, options) {
        try {
            const response = await fetchImpl(url, {
                ...options, redirect: "error", signal: AbortSignal.timeout(20000)
            });
            const payload = await response.json();
            return { ok: response.ok, status: response.status, payload };
        } catch {
            // Não propaga erros de rede que possam carregar cabeçalhos, cartão ou token.
            throw safeError(502, "Não foi possível confirmar a resposta do Sandbox da Rede. Consulte a operação antes de repetir o teste.");
        }
    }

    const auth = await request(TOKEN_URL, {
        method: "POST",
        headers: {
            Authorization: `Basic ${Buffer.from(`${env.REDE_CLIENT_ID.trim()}:${env.REDE_CLIENT_SECRET.trim()}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ grant_type: "client_credentials" })
    });
    if (!auth.ok || typeof auth.payload?.access_token !== "string" || !auth.payload.access_token) {
        throw safeError(502, "A Rede não autorizou o acesso ao Sandbox. Confira as credenciais de teste no .env.");
    }
    const headers = { Authorization: `Bearer ${auth.payload.access_token}`, "Content-Type": "application/json" };
    const amount = input.scenario === "approved" ? 2000 : 80;
    const sale = await request(TRANSACTIONS_URL, {
        method: "POST", headers,
        body: JSON.stringify({ kind: "credit", capture: true, reference: `NA-TEST-${randomUUID()}`, amount, ...TEST_CARD })
    });
    if (input.scenario === "declined" && sale.status < 500 && String(sale.payload?.returnCode) === "80") {
        return { status: "declined", amount, returnCode: "80", tid: null, consulted: false, refundStatus: null };
    }
    const tid = String(sale.payload?.tid || "");
    if (input.scenario !== "approved" || !sale.ok || String(sale.payload?.returnCode) !== "00" || !/^[a-zA-Z0-9-]{1,64}$/.test(tid)) {
        throw safeError(502, "O Sandbox retornou um resultado diferente do cenário solicitado. Consulte a operação antes de repetir o teste.");
    }

    // Não cria venda, reserva de estoque, financeiro ou dados de cartão na loja.
    const url = `${TRANSACTIONS_URL}/${encodeURIComponent(tid)}`;
    let consulted = false;
    try {
        const query = await request(url, { headers });
        const authorization = query.payload?.authorization || query.payload;
        consulted = query.ok && String(authorization?.tid) === tid && Number(authorization?.amount) === amount;
    } catch { /* A aprovação já aconteceu: apresenta consulta pendente e ainda tenta estornar. */ }

    let refundStatus = "Unavailable";
    try {
        const refund = await request(`${url}/refunds`, { method: "POST", headers, body: JSON.stringify({ amount }) });
        const accepted = refund.ok && ["00", "359"].includes(String(refund.payload?.returnCode));
        refundStatus = accepted ? "Pending" : "Failed";
        if (accepted) {
            const query = await request(`${url}/refunds`, { headers });
            if (query.ok && Array.isArray(query.payload?.refunds)) {
                refundStatus = query.payload.refunds.some(item => item.status === "Done") ? "Done" : "Pending";
            }
        }
    } catch { /* Nunca transforma compra aprovada em falha genérica que incentiva duplicação. */ }

    return { status: "approved", amount, returnCode: "00", tid, consulted, refundStatus };
}

module.exports = { configured, simulate };
