"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { simulate } = require("../services/redeSandboxService");

const env = { NODE_ENV: "development", PAYMENT_ENVIRONMENT: "sandbox", REDE_CLIENT_ID: "sandbox-client", REDE_CLIENT_SECRET: "private-sandbox-fixture" };
const card = { scenario: "approved", cardNumber: "5448 2800 0000 0007", expirationMonth: "01", expirationYear: "2035", securityCode: "123" };
function mockFetch(replies) {
    const calls = [];
    return {
        calls,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            assert.equal(options.redirect, "error");
            assert.ok(options.signal instanceof AbortSignal);
            assert.ok(replies.length, "Nenhuma chamada extra é permitida");
            const reply = replies.shift();
            if (reply instanceof Error) throw reply;
            const [status, payload] = reply;
            return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
        }
    };
}

function approvalReplies() {
    return [
        [200, { access_token: "private-access-token-fixture" }],
        [200, { returnCode: "00", tid: "sandbox123" }],
        [200, { authorization: { tid: "sandbox123", amount: 2000, returnCode: "00" } }],
        [200, { returnCode: "359" }],
        [200, { refunds: [{ status: "Done" }] }]
    ];
}

test("Sandbox aprova, consulta e confirma estorno sem vazar cartão/token ou aceitar URL de produção", async () => {
    const fixture = mockFetch(approvalReplies());
    const result = await simulate({ ...card, amount: 999999, url: "https://api.userede.com.br/production", capture: false }, { env, ...fixture });
    assert.deepEqual(result, { status: "approved", amount: 2000, returnCode: "00", tid: "sandbox123", consulted: true, refundStatus: "Done" });
    assert.equal(fixture.calls.length, 5);
    const [oauth, sale, query, refund, refundQuery] = fixture.calls;
    assert.equal(oauth.url, "https://rl7-sandbox-api.useredecloud.com.br/oauth2/token");
    assert.equal(String(oauth.options.body), "grant_type=client_credentials");
    for (const call of fixture.calls.slice(1)) {
        assert.equal(new URL(call.url).origin, "https://sandbox-erede.useredecloud.com.br");
        assert.equal(call.options.headers.Authorization, "Bearer private-access-token-fixture");
    }
    const body = JSON.parse(sale.options.body);
    assert.equal(body.amount, 2000);
    assert.equal(body.capture, true);
    assert.equal(body.cardNumber, "5448280000000007");
    assert.match(body.reference, /^NA-TEST-/);
    assert.equal(query.url, sale.url + "/sandbox123");
    assert.equal(refund.url, query.url + "/refunds");
    assert.equal(refundQuery.url, refund.url);
    assert.doesNotMatch(JSON.stringify(result), /private-|544828|securityCode|clientSecret|access_token/);
});

test("recusa de cartão é um resultado esperado, sem consulta ou estorno", async () => {
    const fixture = mockFetch([[200, { access_token: "fixture-token" }], [400, { returnCode: "80", returnMessage: "Do not honor" }]]);
    const result = await simulate({ ...card, scenario: "declined" }, { env, ...fixture });
    assert.equal(result.status, "declined");
    assert.equal(result.amount, 80);
    assert.equal(result.returnCode, "80");
    assert.equal(result.refundStatus, null);
    assert.equal(fixture.calls.length, 2);
});

test("ambiente de produção, credenciais ausentes e cartões diferentes bloqueiam antes da rede", async () => {
    const fetchImpl = () => assert.fail("Não pode abrir conexão");
    for (const change of [{ NODE_ENV: "production" }, { NODE_ENV: "test" }, { PAYMENT_ENVIRONMENT: "production" }]) {
        await assert.rejects(simulate(card, { env: { ...env, ...change }, fetchImpl }), error => error.status === 404);
    }
    await assert.rejects(simulate(card, { env: { ...env, REDE_CLIENT_SECRET: "" }, fetchImpl }), error => error.status === 503);
    for (const input of [null, {}, { ...card, cardNumber: "4111111111111111" }, { ...card, securityCode: "999" }, { ...card, expirationYear: 2036 }, { ...card, scenario: "other" }]) {
        await assert.rejects(simulate(input, { env, fetchImpl }), error => error.status === 400);
    }
});

test("falhas bancárias e de conexão não expõem a resposta, credenciais ou causa original", async () => {
    for (const replies of [[new Error("private-access-token-fixture private-sandbox-fixture")], [[401, { access_token: "private-access-token-fixture", error: "private-sandbox-fixture" }]]]) {
        await assert.rejects(simulate(card, { env, ...mockFetch(replies) }), error => {
            assert.equal(error.status, 502);
            assert.doesNotMatch(error.stack, /private-|Authorization|544828/);
            assert.equal(error.cause, undefined);
            return true;
        });
    }
});

test("não confunde estorno aceito/pendente ou consulta divergente com confirmação", async () => {
    const replies = approvalReplies();
    replies[2] = [200, { authorization: { tid: "another-tid", amount: 2000 } }];
    replies[4] = [200, { refunds: [{ status: "Pending" }] }];
    const result = await simulate(card, { env, ...mockFetch(replies) });
    assert.equal(result.status, "approved");
    assert.equal(result.consulted, false);
    assert.equal(result.refundStatus, "Pending");
});

test("mantém aprovação e tenta estorno mesmo quando a consulta falha", async () => {
    const replies = approvalReplies();
    replies[2] = new Error("private-query-error");
    const result = await simulate(card, { env, ...mockFetch(replies) });
    assert.equal(result.status, "approved");
    assert.equal(result.consulted, false);
    assert.equal(result.refundStatus, "Done");
});

test("falha de estorno preserva resultado aprovado e não informa estorno concluído", async () => {
    const replies = approvalReplies().slice(0, 4);
    replies[3] = [500, { returnCode: "999" }];
    const result = await simulate(card, { env, ...mockFetch(replies) });
    assert.equal(result.status, "approved");
    assert.equal(result.refundStatus, "Failed");
});

function isolated(relative, dependencies, variables) {
    const filename = path.join(__dirname, "..", relative);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module, exports: module.exports, process: { env: variables }, URL,
        require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; }
    }, { filename });
    return module.exports;
}

test("gate local ignora IP de proxy e bloqueia produção ou Sandbox desligado", () => {
    for (const variables of [env, { ...env, NODE_ENV: "production" }, { ...env, PAYMENT_ENVIRONMENT: "production" }]) {
        const gate = isolated("middlewares/redeSandboxMiddleware.js", {}, variables);
        for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "192.168.1.1"]) {
            let passed = false, status;
            const response = { set(key, value) { assert.equal(key, "Cache-Control"); assert.equal(value, "no-store"); }, status(value) { status = value; return this; }, json() {} };
            gate({ socket: { remoteAddress: address }, ip: "127.0.0.1", headers: { "x-forwarded-for": "127.0.0.1" } }, response, () => { passed = true; });
            const allowed = variables.NODE_ENV === "development" && variables.PAYMENT_ENVIRONMENT === "sandbox" && address !== "192.168.1.1";
            assert.equal(passed, allowed);
            if (!allowed) assert.equal(status, 404);
        }
    }
});

test("API da sacola dispensa login local, bloqueia origem externa e não devolve dados privados", async () => {
    const express = require("express");
    let calls = 0;
    const gate = isolated("middlewares/redeSandboxMiddleware.js", {}, env);
    const router = isolated("routes/redeSandboxRoutes.js", {
        express,
        "express-rate-limit": require("express-rate-limit"),
        "../middlewares/redeSandboxMiddleware": gate,
        "../services/redeSandboxService": {
            configured: () => true,
            async simulate(input) { calls++; assert.equal(input.scenario, "approved"); return { status: "approved", amount: 2000, returnCode: "00", tid: "fixture", consulted: true, refundStatus: "Done" }; }
        }
    }, env);
    const app = express();
    app.use(express.json());
    app.use("/api/public/rede-sandbox", router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const url = `http://127.0.0.1:${server.address().port}/api/public/rede-sandbox`;
        const status = await fetch(url);
        assert.equal(status.status, 200);
        assert.equal(status.headers.get("cache-control"), "no-store");
        assert.equal((await status.json()).data.configured, true);
        const external = await fetch(url + "/transactions", { method: "POST", headers: { Origin: "https://example.invalid", "Content-Type": "application/json" }, body: JSON.stringify(card) });
        assert.equal(external.status, 403);
        const foreignHost = await new Promise((resolve, reject) => {
            // fetch normaliza Host; http.request permite exercitar o cabeçalho recebido.
            const request = require("node:http").request(url, { headers: { Host: "external.example.invalid" } }, response => {
                response.resume();
                resolve(response.statusCode);
            });
            request.on("error", reject);
            request.end();
        });
        assert.equal(foreignHost, 403);
        const plainBody = await fetch(url + "/transactions", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
        assert.equal(plainBody.status, 415);
        assert.equal(calls, 0);
        const response = await fetch(url + "/transactions", { method: "POST", headers: { Origin: new URL(url).origin, "Content-Type": "application/json" }, body: JSON.stringify({ scenario: "approved" }) });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.refundStatus, "Done");
        assert.equal(calls, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
