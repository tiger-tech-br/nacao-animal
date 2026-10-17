"use strict";
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const envPath = require.resolve("../config/env");
require.cache[envPath] = { exports: { RESEND_API_KEY: "re_test", EMAIL_FROM: "PetFlow <sender@example.com>", APP_URL: "https://example.com" } };
const email = require("../services/emailService");
const originalFetch = global.fetch;
test("e-mail de saída inclui botão e URL de rastreamento do pedido", () => {
    const id = "9c4ecf18-c1b1-45d9-ae3b-7392a2528617";
    const template = email.orderOutForDeliveryTemplate({ name: "Cliente", orderId: id });
    assert.match(template.html, /Rastrear pedido<\/a>/);
    assert.ok(template.html.includes(`https://example.com/acompanhar-entrega?pedido=${id}`));
    assert.ok(template.text.includes(`https://example.com/acompanhar-entrega?pedido=${id}`));
    assert.ok(!template.html.includes("/entregador#"));
});

test("comprovante do pedido conserva itens, valores, entrega, pagamento e links", () => {
    const template = email.orderReceivedTemplate({
        name: "Maria Cliente",
        orderId: "9c4ecf18-c1b1-45d9-ae3b-7392a2528617",
        subtotal: 100,
        discount: 10,
        shipping: 6,
        total: 96,
        paymentMethod: "PIX",
        address: { endereco: "Rua Teste", numero: "10", cidade: "Santo André", estado: "SP", cep: "09000-000" },
        items: [{ nome: "Ração", quantidade: 2, valor_unitario: 50 }]
    });
    assert.match(template.html, /Ração/);
    assert.match(template.html, /Rua Teste/);
    assert.match(template.html, /Pix/);
    assert.match(template.html, /meus-pedidos/);
    assert.match(template.html, /termos-de-uso/);
    assert.match(template.text, /Frete:/);
    assert.match(template.text, /Total:/);
});
afterEach(() => { global.fetch = originalFetch; });

test("Resend recebe remetente, conteúdo e chave de idempotência", async () => {
    global.fetch = async (url, options) => {
        assert.equal(url, "https://api.resend.com/emails");
        assert.equal(options.headers["Idempotency-Key"], "verification/test");
        assert.equal(JSON.parse(options.body).from, "PetFlow <sender@example.com>");
        assert.equal(JSON.parse(options.body).to, "customer@example.com");
        assert.ok(options.signal);
        return { ok: true, json: async () => ({ id: "email-test" }) };
    };
    assert.deepEqual(await email.sendEmail({ to: "customer@example.com", subject: "Teste", text: "Teste", idempotencyKey: "verification/test" }), { id: "email-test" });
});

test("falhas do provedor retornam 503 e diagnóstico sem conteúdo sensível", async () => {
    for (const [status, message, code] of [
        [401, "API key is invalid", "invalid_api_key"],
        [403, "The domain is not verified", "domain_not_verified"],
        [403, "You can only send testing emails to your own email address", "test_sender_restricted"],
        [429, "Too many requests", "rate_or_quota_limit"],
        [500, "Internal error", "http_500"]
    ]) {
        global.fetch = async () => ({ ok: false, status, json: async () => ({ message }) });
        await assert.rejects(email.sendEmail({}), error => error.status === 503 && error.code === code && !error.message.includes(message));
    }
});

test("timeout, rede e respostas inválidas não viram sucesso", async () => {
    for (const name of ["TimeoutError", "TypeError"]) {
        global.fetch = async () => { throw Object.assign(new Error("private data"), { name }); };
        await assert.rejects(email.sendEmail({}), { status: 503, code: name === "TimeoutError" ? "timeout" : "network_error" });
    }
    global.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error("HTML"); } });
    await assert.rejects(email.sendEmail({}), { status: 503, code: "http_502" });
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    await assert.rejects(email.sendEmail({}), { status: 503, code: "invalid_provider_response" });
});

test("email opcional não desfaz pedido quando o provedor falha", async () => {
    global.fetch = async () => { throw new Error("offline"); };
    assert.equal(await email.sendOptionalEmail({}), null);
});

test("middleware respeita statusCode dos erros de validação de pedidos", () => {
    const middleware = require("../middlewares/errorMiddleware");
    let status;
    const response = { status(value) { status = value; return this; }, json(value) { return value; } };
    middleware({ statusCode: 400, message: "Quantidade inválida" }, {}, response);
    assert.equal(status, 400);
    middleware({ statusCode: 999, message: "Erro" }, {}, response);
    assert.equal(status, 500);
});

test("middleware não expõe detalhes internos em produção", () => {
    const middleware = require("../middlewares/errorMiddleware");
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
        let payload;
        const response = { status() { return this; }, json(value) { payload = value; return value; } };
        middleware(new Error("senha=segredo SQL interno"), { method: "GET", originalUrl: "/teste" }, response);
        assert.equal(payload.message, "Erro interno do servidor. Tente novamente em alguns minutos.");
        assert.doesNotMatch(JSON.stringify(payload), /segredo/);
    } finally {
        process.env.NODE_ENV = previous;
    }
});
