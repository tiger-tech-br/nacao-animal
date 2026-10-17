"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { buildDbOptions } = require("../config/dbOptions");

test("migracoes e consultas nao dependem das tabelas clinicas removidas", () => {
    const path = require("node:path");
    function walk(dir) {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
            const file = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(file) : [file];
        });
    }
    const legacy = /\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(?:pets|servicos|agendamentos|consultas|prontuarios|vacinas|historico_vacinas|funcionarios)\b/i;
    for (const dir of ["database/sql", "models", "controllers", "services", "scripts"]) {
        for (const file of walk(dir).filter(file => /\.(sql|js)$/.test(file) && !file.endsWith("105_remover_funcionarios.sql"))) {
            assert.doesNotMatch(fs.readFileSync(file, "utf8"), legacy, file);
        }
    }
});

test("conexoes e URLs nunca podem apontar para o banco original", () => {
    const keys = ["DB_NAME", "DB_EXPECTED_NAME", "DATABASE_URL", "POSTGRES_URL", "DATABASE_PUBLIC_URL"];
    const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    try {
        keys.forEach(key => delete process.env[key]);
        process.env.DB_NAME = "petflow";
        assert.throws(buildDbOptions, /nao corresponde/);
        process.env.DB_NAME = "petflow_v2";
        assert.equal(buildDbOptions().database, "petflow_v2");
        process.env.DB_EXPECTED_NAME = "railway";
        assert.throws(buildDbOptions, /nao corresponde/);
        process.env.DATABASE_URL = "postgresql://postgres:senha@postgres.railway.internal:5432/railway";
        assert.equal(buildDbOptions().connectionString, process.env.DATABASE_URL);
        delete process.env.DATABASE_URL;
        delete process.env.DB_EXPECTED_NAME;
        for (const key of ["DATABASE_URL", "POSTGRES_URL", "DATABASE_PUBLIC_URL"]) {
            process.env[key] = "postgresql://localhost/petflow";
            assert.throws(buildDbOptions, /nao corresponde/);
            process.env[key] = "postgresql://localhost/petflow_v2";
            assert.equal(buildDbOptions().connectionString, process.env[key]);
            delete process.env[key];
        }
    } finally {
        for (const key of keys) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    }
});

test("painel consulta apenas os dados comerciais", async () => {
    const modelPath = require.resolve("../models/dashboardModel");
    const servicePath = require.resolve("../services/dashboardService");
    const previous = require.cache[modelPath];
    const names = ["resumo", "ultimasVendas", "ultimasCompras", "estoqueBaixo", "contasVencidas", "produtosMaisVendidos"];
    const called = [];
    require.cache[modelPath] = { exports: Object.fromEntries(names.map(name => [name, async id => { assert.equal(id, "loja"); called.push(name); return name; }])) };
    try {
        delete require.cache[servicePath];
        const result = await require(servicePath).obterDashboard("loja");
        assert.deepEqual(Object.keys(result), names);
        assert.deepEqual(called, names);
    } finally {
        delete require.cache[servicePath];
        if (previous) require.cache[modelPath] = previous;
        else delete require.cache[modelPath];
    }
});

test("menus publicos e administrativos nao divulgam modulos removidos", () => {
    const files = ["views/home/index.html", "public/js/layout/public-header.js", "public/js/layout/sidebar.js", "views/auth/account.html", "views/auth/orders.html", "admin/pages/dashboard/dashboard.html"];
    for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        assert.doesNotMatch(source, /href=["'][^"']*(?:#services|\/servicos|\/agendamentos|\/meus-pets|\/pages\/pets)/, file);
    }
});

test("rotas removidas retornam 404 e paginas comerciais continuam acessiveis", async () => {
    require("dotenv").config({ quiet: true });
    process.env.DB_NAME = "petflow_v2";
    process.env.DB_EXPECTED_NAME = "petflow_v2";
    process.env.DB_HOST = "127.0.0.1";
    process.env.DB_PORT = "5432";
    process.env.DB_USER = "test";
    process.env.JWT_SECRET = "test-only-secret";
    process.env.JWT_EXPIRES_IN = "1h";
    process.env.DB_PASSWORD ||= "test-only";
    process.env.DATABASE_URL = "";
    process.env.POSTGRES_URL = "";
    process.env.DATABASE_PUBLIC_URL = "";
    const app = require("../app");
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
    for (const route of ["/servicos/banho", "/meus-pets", "/api/servicos", "/api/agendamentos", "/api/pets", "/api/funcionarios", "/api/public/servicos", "/api/public/clientes/pets", "/admin/pages/servicos/servicos.html", "/admin/pages/agendamentos/agendamentos.html", "/admin/pages/pets/pets.html", "/admin/pages/funcionarios/funcionarios.html"]) {
            const response = await fetch(base + route);
            assert.equal(response.status, 404, route);
        }
        const booking = await fetch(base + "/api/public/agendamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        assert.equal(booking.status, 404);
        for (const route of ["/", "/login", "/conta", "/sacola", "/meus-pedidos", "/politica-de-privacidade", "/produtos/racao",
            "/admin/pages/dashboard/dashboard.html", "/admin/pages/produtos/produtos.html", "/admin/pages/vendas/vendas.html",
            "/admin/pages/cupons/cupons.html", "/admin/pages/usuarios/usuarios.html",
            "/admin/pages/auditoria/auditoria.html", "/admin/pages/atendimento/atendimento.html", "/admin/pages/lgpd/lgpd.html"]) {
            assert.equal((await fetch(base + route)).status, 200, route);
        }
        for (const route of ["/api/cupons", "/api/usuarios-admin", "/api/auditoria", "/api/atendimento", "/api/lgpd"]) {
            assert.equal((await fetch(base + route)).status, 401, route);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
        await require("../config/db").pool.end();
    }
});
