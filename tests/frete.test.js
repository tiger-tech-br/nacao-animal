"use strict";
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
require.cache[require.resolve("../config/env")] = { exports: { JWT_SECRET: "shipping-unit-test" } };
const shipping = require("../services/freteService");
const customer = { id: "customer-1", endereco: "Rua Exemplo", numero: "10", bairro: "Centro", cidade: "Santo André", estado: "SP", cep: "09000000" };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; delete process.env.GOOGLE_MAPS_API_KEY; delete process.env.GOOGLE_API_KEY; });
test("tarifa inclui 1 km grátis e cobra frações do km adicional", () => {
    for (const [meters, value] of [[0,0],[999,0],[1000,0],[1001,3],[1500,3],[2000,3],[2001,6],[2500,6],[3000,6]]) {
        assert.equal(shipping.priceForDistance(meters), value);
    }
    for (const meters of [-1,NaN,Infinity,"1000",1.5]) assert.throws(() => shipping.priceForDistance(meters));
});
test("cotação usa endereço salvo e Routes API; assinatura vincula cliente e endereço", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    global.fetch = async (url, options) => {
        assert.equal(url, "https://routes.googleapis.com/directions/v2:computeRoutes");
        assert.equal(options.headers["X-Goog-Api-Key"], "test-key");
        assert.equal(options.headers["X-Goog-FieldMask"], "routes.distanceMeters");
        assert.match(JSON.parse(options.body).origin.address, /Novo Horizonte, 123/);
        assert.match(JSON.parse(options.body).destination.address, /Rua Exemplo, 10/);
        return { ok: true, json: async () => ({ routes: [{ distanceMeters: 1500 }] }) };
    };
    const quote = await shipping.quote(customer);
    assert.equal(quote.valor,3);
    assert.equal(shipping.verifyQuote(quote.token,customer).valor,3);
    assert.throws(() => shipping.verifyQuote(quote.token,{ ...customer, id: "other" }), { status: 409 });
    assert.throws(() => shipping.verifyQuote(quote.token,{ ...customer, numero: "11" }), { status: 409 });
    assert.throws(() => shipping.verifyQuote(`${quote.token}bad`,customer), { status: 409 });
    assert.throws(() => jwt.verify(quote.token,"shipping-unit-test"), "Cotação não pode ser usada como sessão de login");
    const { iat, exp, ...claims } = jwt.decode(quote.token);
    const key = crypto.createHmac("sha256","shipping-unit-test").update("petflow/frete/v1").digest();
    const expired = jwt.sign(claims,key,{ expiresIn:-1 });
    assert.throws(() => shipping.verifyQuote(expired,customer), { status: 409 });
});
test("falhas de configuração e Google Maps não viram frete grátis", async () => {
    await assert.rejects(shipping.quote(customer), { status: 503 });
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    await assert.rejects(shipping.quote({ ...customer, cep: "" }), { status: 400 });
    global.fetch = async () => { throw new Error("timeout"); };
    await assert.rejects(shipping.quote(customer), { status: 503 });
    global.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await assert.rejects(shipping.quote(customer), { status: 503 });
    global.fetch = async () => ({ ok: true, json: async () => ({ routes: [] }) });
    await assert.rejects(shipping.quote(customer), { status: 422 });
});

test("visitante cota sem conta; cotação só vale para o endereço informado", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    global.fetch = async () => ({ ok: true, json: async () => ({ routes: [{ distanceMeters: 2500 }] }) });
    const { id, ...address } = customer;
    const quote = await shipping.quote({ ...address, cep: "09000-000", complemento: null });
    assert.equal(quote.valor, 6);
    assert.equal(jwt.decode(quote.token).sub, undefined);
    assert.equal(shipping.verifyQuote(quote.token, customer).valor, 6);
    assert.throws(() => shipping.verifyQuote(quote.token, { ...customer, endereco: "Outra rua" }), { status: 409 });
    assert.throws(() => shipping.validateAddress({ ...address, cep: "123" }), { status: 400 });
});

test("CEP preenche endereço; CEP inexistente e falha do provedor têm mensagens próprias", async () => {
    global.fetch = async url => {
        assert.equal(url, "https://viacep.com.br/ws/09000000/json/");
        return { ok: true, json: async () => ({ cep: "09000-000", logradouro: "Rua Exemplo", bairro: "Centro", localidade: "Santo André", uf: "SP" }) };
    };
    assert.deepEqual(await shipping.consultarCep("09000-000"), { cep: "09000000", endereco: "Rua Exemplo", bairro: "Centro", cidade: "Santo André", estado: "SP" });
    await assert.rejects(shipping.consultarCep("123"), { status: 400 });
    global.fetch = async () => ({ ok: true, json: async () => ({ erro: "true" }) });
    await assert.rejects(shipping.consultarCep("09000000"), { status: 404 });
    global.fetch = async () => { throw new Error("timeout"); };
    await assert.rejects(shipping.consultarCep("09000000"), { status: 503 });
});

test("CEP usa BrasilAPI quando o ViaCEP está indisponível", async () => {
    const requested = [];
    global.fetch = async url => {
        requested.push(url);
        if (url.includes("viacep.com.br")) throw new Error("timeout");
        assert.equal(url, "https://brasilapi.com.br/api/cep/v2/09060700");
        return { ok: true, status: 200, json: async () => ({
            cep: "09060700", street: "Rua Brasílio Machado", neighborhood: "Vila Príncipe de Gales",
            city: "Santo André", state: "SP"
        }) };
    };
    assert.deepEqual(await shipping.consultarCep("09060-700"), {
        cep: "09060700", endereco: "Rua Brasílio Machado", bairro: "Vila Príncipe de Gales",
        cidade: "Santo André", estado: "SP"
    });
    assert.equal(requested.length, 2);
});

test("aceita GOOGLE_API_KEY configurada no Railway quando a variável principal está vazia", async () => {
    process.env.GOOGLE_MAPS_API_KEY = " ";
    process.env.GOOGLE_API_KEY = "alias-test-key";
    global.fetch = async (url, options) => {
        assert.equal(options.headers["X-Goog-Api-Key"], "alias-test-key");
        return { ok: true, json: async () => ({ routes: [{ distanceMeters: 1500 }] }) };
    };
    assert.equal((await shipping.quote(customer)).valor, 3);
});
