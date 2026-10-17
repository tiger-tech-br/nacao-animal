"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

// Carrega somente os fontes sob teste: não lê .env nem abre banco ou rede.
function isolatedModule(relativePath, dependencies = {}, env = {}) {
    const filename = path.resolve(__dirname, "..", relativePath);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module,
        exports: module.exports,
        process: { env },
        Buffer,
        URL,
        require: name => {
            assert.ok(Object.hasOwn(dependencies, name), `Dependência não isolada: ${name}`);
            return dependencies[name];
        }
    }, { filename });
    return module.exports;
}

const legacyCredentials = {
    APP_URL: "https://loja.example.invalid",
    PAGSEGURO_BASE_URL: "https://sandbox.api.pagseguro.com",
    PAGSEGURO_TOKEN: "legacy-private-payment-fixture"
};

function paymentFixture(env) {
    const settings = isolatedModule("config/payment.js", {}, env);
    let networkCalls = 0;
    const service = isolatedModule("services/pagseguroService.js", {
        axios: { create: () => { networkCalls++; assert.fail("Provedor inativo não pode abrir cliente HTTP"); } },
        crypto,
        "../config/env": { ...legacyCredentials, ...env },
        "../config/payment": settings
    }, env);
    return { settings, service, networkCalls: () => networkCalls };
}

function assertUnavailable(error) {
    assert.equal(error?.status, 503);
    assert.equal(error?.code, "PAYMENTS_NOT_READY");
    assert.doesNotMatch(error.message, /legacy-private|client.?secret|pagbank|pagseguro|itau|itaú|rede/i);
    return true;
}

test("pagamento fica pendente por padrão e credenciais futuras não ativam adaptadores inexistentes", () => {
    const settings = isolatedModule("config/payment.js");
    const defaults = settings.getPaymentSettings({});
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.provider, "pending");
    assert.equal(defaults.environment, "sandbox");
    assert.equal(settings.isPaymentProviderActive("pagbank", {}), false);

    for (const provider of ["pending", "rede", "itau_pix", "outro-provedor"]) {
        const env = {
            PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: provider, PAYMENT_ENVIRONMENT: "production",
            REDE_CLIENT_ID: "future-client", REDE_CLIENT_SECRET: "future-secret",
            ITAU_PIX_CLIENT_ID: "future-client", ITAU_PIX_CLIENT_SECRET: "future-secret",
            ...legacyCredentials
        };
        assert.equal(settings.isPaymentProviderActive(provider, env), false, provider);
        assert.equal(settings.isPaymentProviderActive("pagbank", env), false, provider);
        assert.throws(() => settings.assertPaymentProviderActive("pagbank", env), assertUnavailable);
    }
    const active = { PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "pagbank", PAYMENT_ENVIRONMENT: "sandbox" };
    assert.equal(settings.isPaymentProviderActive("pagbank", active), true);
    assert.equal(settings.isPaymentProviderActive("pagbank", { ...active, PAYMENTS_ENABLED: "false" }), false);
});

test("credencial PagBank herdada não permite cobrança, consulta, estorno ou assinatura com pagamento inativo", async () => {
    const event = { id: "ORDE_LEGACY", reference_id: "sale", charges: [{ id: "CHAR_LEGACY", status: "PAID" }] };
    const rawBody = JSON.stringify(event);
    const signature = crypto.createHash("sha256")
        .update(`${legacyCredentials.PAGSEGURO_TOKEN}-${rawBody}`).digest("hex");
    const active = paymentFixture({ PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "pagbank" });
    assert.equal(active.service.validarAssinaturaWebhook(rawBody, signature), true,
        "A assinatura é válida para o provedor legado quando habilitado explicitamente");

    for (const env of [
        {},
        { PAYMENTS_ENABLED: "false", PAYMENT_PROVIDER: "pagbank" },
        { PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "pending" },
        { PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "rede" },
        { PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "itau_pix" }
    ]) {
        const { service, networkCalls } = paymentFixture(env);
        assert.throws(() => service.assertConfigured(), assertUnavailable);
        await assert.rejects(service.criarCheckout({ id: "sale", itens: [{ quantidade: 1, preco_unitario: 10 }] }), assertUnavailable);
        await assert.rejects(service.consultarCheckout("CHEC_LEGACY"), assertUnavailable);
        await assert.rejects(service.cancelarCobranca("CHAR_LEGACY", 10, "cancel-sale"), assertUnavailable);
        assert.equal(service.validarAssinaturaWebhook(rawBody, signature), false);
        assert.equal(networkCalls(), 0);
    }
});

test("rotas de pedido, pagamento e webhook bloqueiam antes de banco, reserva e alteração do pedido", async () => {
    const event = { id: "ORDE_LEGACY", reference_id: "sale", charges: [{ status: "PAID" }] };
    const rawBody = JSON.stringify(event);
    const signature = crypto.createHash("sha256")
        .update(`${legacyCredentials.PAGSEGURO_TOKEN}-${rawBody}`).digest("hex");
    for (const env of [
        { PAYMENTS_ENABLED: "false", PAYMENT_PROVIDER: "pagbank" },
        { PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "rede" }
    ]) {
        const { service } = paymentFixture(env);
        let sideEffects = 0;
        const untouched = new Proxy({}, { get: () => () => { sideEffects++; assert.fail("Pagamento bloqueado não pode acessar banco ou alterar pedidos"); } });
        const dependencies = {
            "../database/connection": untouched,
            "../models/vendaModel": untouched,
            "../services/vendaService": untouched,
            "../services/pagseguroService": service,
            "../services/freteService": untouched,
            "../services/emailService": untouched
        };
        const orders = isolatedModule("controllers/publicOrderController.js", dependencies, env);
        const payments = isolatedModule("controllers/publicPaymentController.js", dependencies, env);
        const customer = { id: "customer", empresaId: "store" };
        const requests = [
            [orders.criarPedido, { customer, body: { itens: [{ produtoId: "product", quantidade: 1 }], formaPagamento: "PIX" } }],
            [payments.criarPagamento, { customer, body: { vendaId: "sale" } }],
            [payments.consultarPagamento, { customer, params: { id: "sale" } }],
            [payments.receberWebhook, { body: event, rawBody, get: () => signature }]
        ];
        for (const [handler, request] of requests) {
            let nextError;
            const response = { status: () => { assert.fail("Pagamento indisponível deve seguir o tratamento de erro"); } };
            await handler(request, response, error => { nextError = error; });
            assertUnavailable(nextError);
        }
        assert.equal(sideEffects, 0, "Não cria venda/reserva, consulta link antigo ou confirma webhook");
    }
});
