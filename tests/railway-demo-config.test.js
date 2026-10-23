"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildRailwayDemoVariables } = require("../scripts/railway-demo-config");
const { parseArgs } = require("../scripts/configure-railway-demo");
const options = { appUrl: "https://nacao-animal-production.up.railway.app", jwtSecret: "remote-demo-fixture-secret-with-enough-length" };

test("configurador rejeita flags desconhecidas ou ambiguas antes de acessar o Railway", () => {
    assert.deepEqual(parseArgs([]), { apply: false });
    assert.deepEqual(parseArgs(["--dry-run"]), { apply: false });
    assert.deepEqual(parseArgs(["--apply"]), { apply: true });
    for (const args of [["--force"], ["--apply", "--dry-run"], ["--apply", "--apply"]]) {
        assert.throws(() => parseArgs(args), /Use node/);
    }
});

test("copia remota preserva valores locais e troca somente conexoes especificas do ambiente", () => {
    const local = Object.freeze({ NODE_ENV: "development", PORT: "4600", APP_URL: "http://localhost:4600",
        FRONTEND_URL: "http://localhost:4600", DB_HOST: "localhost", DB_NAME: "nacao-animal",
        DB_PASSWORD: "local-fixture-password", JWT_SECRET: "local-fixture-secret", RESEND_API_KEY: "fixture-mail-key", CUSTOM_EMPTY: "" });
    const remote = buildRailwayDemoVariables(local, options);
    assert.equal(local.APP_URL, "http://localhost:4600");
    assert.equal(local.DB_HOST, "localhost");
    assert.equal(local.JWT_SECRET, "local-fixture-secret");
    assert.equal(remote.NODE_ENV, "production");
    assert.equal(remote.APP_URL, options.appUrl);
    assert.equal(remote.FRONTEND_URL, options.appUrl);
    assert.equal(remote.JWT_SECRET, options.jwtSecret);
    assert.equal(remote.RESEND_API_KEY, local.RESEND_API_KEY);
    assert.equal(remote.CUSTOM_EMPTY, "");
    assert.ok(Object.keys(local).every(key => key in remote));
    assert.equal(remote.DATABASE_URL, "${{Postgres.DATABASE_URL}}");
    assert.equal(remote.DB_EXPECTED_NAME, "${{Postgres.PGDATABASE}}");
    assert.equal(remote.DB_PASSWORD, "${{Postgres.PGPASSWORD}}");
    assert.equal(remote.DATABASE_PUBLIC_URL, "");
});

test("endereco publico do banco e opcional e nao exige expor PostgreSQL para demonstrar a loja", () => {
    const remote = buildRailwayDemoVariables({}, { ...options, hasPublicDatabaseUrl: true });
    assert.equal(remote.DATABASE_PUBLIC_URL, "${{Postgres.DATABASE_PUBLIC_URL}}");
});

test("demonstracao nao habilita cobrancas mesmo se configuracao local as habilitasse", () => {
    const remote = buildRailwayDemoVariables({ PAYMENTS_ENABLED: "true", PAYMENT_ENVIRONMENT: "production", PAYMENT_PROVIDER: "pagbank" }, options);
    assert.equal(remote.PAYMENTS_ENABLED, "false");
    assert.equal(remote.PAYMENT_ENVIRONMENT, "sandbox");
    assert.equal(remote.PAYMENT_PROVIDER, "pending");
});

for (const appUrl of ["http://localhost:4600", "https://example.com", "https://demo.up.railway.app/path", "https://user:password@demo.up.railway.app", "https://demo.up.railway.app/?token=fixture"]) {
    test(`origem fora da demonstracao e recusada: ${new URL(appUrl).hostname}`, () => {
        assert.throws(() => buildRailwayDemoVariables({}, { ...options, appUrl }), /origem HTTPS/);
    });
}

test("segredo remoto ausente ou curto impede configurar demonstracao", () => {
    assert.throws(() => buildRailwayDemoVariables({}, { ...options, jwtSecret: "" }), /Segredo exclusivo/);
    assert.throws(() => buildRailwayDemoVariables({}, { ...options, jwtSecret: "curto" }), /Segredo exclusivo/);
});
