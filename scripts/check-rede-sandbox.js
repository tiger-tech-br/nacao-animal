"use strict";

require("dotenv").config({ quiet: true });
const { randomUUID } = require("node:crypto");

const TOKEN_URL = "https://rl7-sandbox-api.useredecloud.com.br/oauth2/token";
const TRANSACTIONS_URL = "https://sandbox-erede.useredecloud.com.br/v2/transactions";

function failure(code) {
    return Object.assign(new Error(code), { diagnosticCode: code });
}

function providerCode(payload) {
    const code = String(payload?.returnCode ?? payload?.authorization?.returnCode ?? payload?.qrCodeResponse?.returnCode ?? payload?.refunds?.[0]?.returnCode ?? "");
    return /^\d{1,8}$/.test(code) ? code : "nao_informado";
}

function report(name, response, payload, passed) {
    console.log(`${passed ? "OK" : "FALHA"} - ${name}: HTTP ${response.status}; codigo ${providerCode(payload)}`);
}

async function request(url, options = {}) {
    const target = new URL(url);
    const allowed = url === TOKEN_URL || (
        target.origin === "https://sandbox-erede.useredecloud.com.br" &&
        /^\/v2\/transactions(?:\/|$)/.test(target.pathname)
    );
    if (!allowed || target.username || target.password) throw failure("URL_FORA_DO_SANDBOX");
    const response = await fetch(url, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(20000)
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
}

async function testPix(headers) {
    const expiration = new Date(Date.now() + 15 * 60 * 1000)
        .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T");
    const create = amount => request(TRANSACTIONS_URL, {
        method: "POST", headers,
        body: JSON.stringify({
            kind: "pix", reference: `NAPX-${randomUUID()}`, amount,
            qrCode: { dateTimeExpiration: expiration }
        })
    });
    const creation = await create(2000);
    const qr = creation.payload?.qrCodeResponse;
    const generated = creation.response.ok && String(creation.payload?.returnCode) === "00" &&
        creation.payload?.tid && Boolean(qr?.qrCodeImage) && Boolean(qr?.qrCodeData || creation.payload?.qrCodeData);
    report("Geracao de Pix ficticio e QR Code", creation.response, creation.payload, generated);
    if (!generated) {
        console.log("Campos do Pix:", JSON.stringify({ raiz: Object.keys(creation.payload || {}), qr: Object.keys(qr || {}) }));
        throw failure("PIX_SANDBOX_NAO_GERADO");
    }
    const pixUrl = `${TRANSACTIONS_URL}/${encodeURIComponent(String(creation.payload.tid))}`;
    const consultation = await request(pixUrl, { headers });
    const pixDetails = consultation.payload?.qrCodeResponse || consultation.payload?.authorization || consultation.payload;
    const consulted = consultation.response.ok && String(pixDetails?.tid) === String(creation.payload.tid);
    report("Consulta do Pix ficticio", consultation.response, consultation.payload, consulted);
    if (!consulted) console.log("Campos da consulta Pix:", JSON.stringify({ raiz: Object.keys(consultation.payload || {}) }));

    const expirationCase = await create(123);
    let expired = false;
    if (expirationCase.response.ok && expirationCase.payload?.tid) {
        const response = await request(`${TRANSACTIONS_URL}/${encodeURIComponent(String(expirationCase.payload.tid))}`, { headers });
        expired = providerCode(response.payload) === "3036";
        report("Pix expirado simulado (cenario 123)", response.response, response.payload, expired);
        if (!expired) console.log("Campos do cenario Pix expirado:", JSON.stringify({ raiz: Object.keys(response.payload || {}) }));
    } else {
        report("Criacao do cenario Pix expirado", expirationCase.response, expirationCase.payload, false);
    }
    console.log("Pix: esta verificacao nao paga QR Codes nem registra webhook; confirmacao de pagamento permanece pendente.");
    if (!consulted || !expired) throw failure("EXISTEM_CENARIOS_PIX_SEM_CONFIRMACAO");
}

async function main() {
    if (process.env.PAYMENT_ENVIRONMENT !== "sandbox") throw failure("SELECIONE_PAYMENT_ENVIRONMENT_SANDBOX");
    const clientId = process.env.REDE_CLIENT_ID?.trim();
    const clientSecret = process.env.REDE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw failure("CREDENCIAIS_SANDBOX_AUSENTES");

    const authentication = await request(TOKEN_URL, {
        method: "POST",
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ grant_type: "client_credentials" })
    });
    const token = authentication.payload?.access_token;
    const authenticated = authentication.response.ok && typeof token === "string" && token.length > 0;
    console.log(`${authenticated ? "OK" : "FALHA"} - Autenticacao OAuth Sandbox: HTTP ${authentication.response.status}`);
    if (!authenticated) {
        const known = ["invalid_client", "invalid_request", "unauthorized_client", "unsupported_grant_type"];
        if (known.includes(authentication.payload?.error)) console.log(`Diagnostico: ${authentication.payload.error}`);
        throw failure("AUTENTICACAO_SANDBOX_RECUSADA");
    }
    const transactions = process.argv.includes("--transactions");
    const pix = process.argv.includes("--pix");
    if (!transactions && !pix) {
        console.log("Use --transactions para credito ficticio ou --pix para QR Code/consulta/expiracao no Sandbox.");
        return;
    }

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    if (pix) await testPix(headers);
    if (!transactions) return;
    const sale = amount => ({
        capture: true,
        kind: "credit",
        reference: `NA-${randomUUID()}`,
        amount,
        // Cartao FICTICIO documentado para o Sandbox; nao pertence a um cliente.
        cardNumber: "5448280000000007",
        expirationMonth: 1,
        expirationYear: 2035,
        securityCode: "123"
    });
    const approval = await request(TRANSACTIONS_URL, {
        method: "POST", headers, body: JSON.stringify(sale(2000))
    });
    const approved = approval.response.ok && String(approval.payload?.returnCode) === "00" && approval.payload?.tid;
    report("Compra ficticia de R$ 20,00", approval.response, approval.payload, approved);
    if (!approved) throw failure("COMPRA_SANDBOX_NAO_APROVADA");

    const transactionUrl = `${TRANSACTIONS_URL}/${encodeURIComponent(String(approval.payload.tid))}`;
    const consultation = await request(transactionUrl, { headers });
    const authorization = consultation.payload?.authorization || consultation.payload;
    const consulted = consultation.response.ok &&
        String(authorization?.tid) === String(approval.payload.tid);
    report("Consulta da compra ficticia", consultation.response, consultation.payload, consulted);
    if (!consulted) console.log("Campos da consulta:", JSON.stringify({
        raiz: Object.keys(consultation.payload || {}),
        autorizacao: Object.keys(consultation.payload?.authorization || {})
    }));

    const decline = await request(TRANSACTIONS_URL, {
        method: "POST", headers, body: JSON.stringify(sale(80))
    });
    const declined = decline.response.status < 500 && String(decline.payload?.returnCode) === "80";
    report("Recusa simulada (cenario 80)", decline.response, decline.payload, declined);

    const refund = await request(`${transactionUrl}/refunds`, {
        method: "POST", headers, body: JSON.stringify({ amount: 2000 })
    });
    const refundAccepted = refund.response.ok && ["00", "359"].includes(String(refund.payload?.returnCode));
    report("Solicitacao de estorno ficticio", refund.response, refund.payload, refundAccepted);
    if (!refundAccepted) throw failure("SOLICITACAO_ESTORNO_SANDBOX_RECUSADA");

    const refundConsultation = await request(`${transactionUrl}/refunds`, { headers });
    const refundDone = refundConsultation.response.ok &&
        (refundConsultation.payload?.refunds || []).some(item => item.status === "Done");
    report("Estorno ficticio finalizado", refundConsultation.response, refundConsultation.payload, refundDone);
    console.log("Estado do estorno:", JSON.stringify({
        raiz: Object.keys(refundConsultation.payload || {}),
        registros: (refundConsultation.payload?.refunds || []).map(item => ({
            status: /^[A-Za-z ]{1,40}$/.test(item.status || "") ? item.status : "nao_informado",
            codigo: providerCode(item)
        }))
    }));
    console.log("A solicitacao de estorno pode ser assincrona; HTTP de sucesso sozinho nao comprova finalizacao.");
    console.log("Nenhum registro da loja foi alterado; todas as chamadas usaram URLs fixas de Sandbox.");
    if (!consulted || !declined || !refundDone) throw failure("EXISTEM_CENARIOS_SEM_CONFIRMACAO");
}

main().catch(error => {
    const code = error.diagnosticCode || (
        /^[A-Z0-9_]+$/.test(error.cause?.code || "") ? error.cause.code :
            error.name === "TimeoutError" ? "TIMEOUT" : "CONEXAO_OU_RESPOSTA_INDISPONIVEL"
    );
    console.error(`FALHA - ${code}. Nenhuma credencial ou token foi exibido.`);
    process.exitCode = 1;
});
