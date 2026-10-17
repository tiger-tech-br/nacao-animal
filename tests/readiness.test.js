"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { REQUIRED_MIGRATIONS } = require("../config/productionReadiness");

test("readiness exige dados da loja e catálogo, sem expor dados ou credenciais", async () => {
    const env = {
        NODE_ENV: "production", JWT_SECRET: "production-readiness-fixture-secret-with-entropy",
        PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "pagbank", PAYMENT_ENVIRONMENT: "production",
        JWT_EXPIRES_IN: "1h", APP_URL: "https://store.petflow.com.br",
        RESEND_API_KEY: "re_fixture_private_key", EMAIL_FROM: "Loja <support@petflow.com.br>",
        PAGSEGURO_BASE_URL: "https://api.pagseguro.com", PAGSEGURO_TOKEN: "fixture-payment-token",
        GOOGLE_MAPS_API_KEY: "fixture-routes-key", GOOGLE_MAPS_BROWSER_API_KEY: "fixture-browser-key",
        CLOUDINARY_CLOUD_NAME: "fixturecloud", CLOUDINARY_API_KEY: "fixture-cloud-key",
        CLOUDINARY_API_SECRET: "fixture-cloud-secret"
    };
    const savedEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    let missing = ["CNPJ", "telefone"];
    let databaseFailure = false;
    let available = 1;
    const db = { query: async sql => {
        if (databaseFailure) throw Object.assign(new Error("postgres://private-password@server"), { code: "ECONNREFUSED" });
        if (sql.includes("to_regclass")) return { rows: [{ migrations: true, auditoria: true, reservas: true, lgpd: true, atendimento: true }] };
        if (sql.includes("SELECT nome FROM schema_migrations")) return { rows: REQUIRED_MIGRATIONS.map(nome => ({ nome })) };
        if (sql.includes("WITH loja AS")) return { rows: [{ empresas: 1, admins: 1, produtos: 1, estoques: 1, vendaveis: available }] };
        if (sql.includes("ARRAY_REMOVE")) return { rows: [{ pendentes: missing }] };
        throw new Error("Consulta inesperada");
    } };
    const dbPath = require.resolve("../database/connection");
    const cloudPath = require.resolve("../config/cloudinary");
    const routePath = require.resolve("../routes/healthRoutes");
    const previous = [dbPath, cloudPath, routePath].map(file => [file, require.cache[file]]);
    require.cache[dbPath] = { exports: db };
    require.cache[cloudPath] = { exports: { isCloudinaryConfigured: () => true } };
    delete require.cache[routePath];
    let server;
    try {
        const app = express();
        app.use("/api", require(routePath));
        server = app.listen(0, "127.0.0.1");
        await new Promise(resolve => server.once("listening", resolve));
        const request = async () => {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/readiness`);
            return { status: response.status, data: await response.json() };
        };
        let response = await request();
        assert.equal(response.status, 503);
        assert.equal(response.data.database, true);
        assert.equal(response.data.store, false);
        assert.equal(response.data.status, "attention_required");
        missing = [];
        response = await request();
        assert.equal(response.status, 200);
        assert.equal(response.data.store, true);
        available = 0;
        assert.equal((await request()).status, 503, "Loja sem produtos vendáveis não está pronta");
        databaseFailure = true;
        response = await request();
        assert.equal(response.status, 503);
        assert.equal(response.data.database, false);
        assert.equal(response.data.store, false);
        assert.doesNotMatch(JSON.stringify(response.data), /password|CNPJ|private_key|payment-token/);
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        for (const [file, value] of previous) { if (value) require.cache[file] = value; else delete require.cache[file]; }
        for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});
