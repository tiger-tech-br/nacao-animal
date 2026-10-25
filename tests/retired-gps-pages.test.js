"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const express = require("express");
const securityMiddleware = require("../middlewares/securityMiddleware");

test("páginas e API de testes de GPS foram retiradas sem remover as entregas do Maps", () => {
    const source = fs.readFileSync("app.js", "utf8");
    assert.doesNotMatch(source, /app\.get\("\/admin\/(?:simular-navegacao|testar-gps)"/);
    assert.doesNotMatch(source, /gpsDiagnosticRoutes|\/api\/gps-diagnostico/);
    for (const page of ["/entregador", "/acompanhar-entrega", "/admin/acompanhar-entrega"])
        assert.ok(source.includes(`app.get("${page}"`), `Página ativa preservada: ${page}`);
    for (const file of ["views/delivery/simulation.html", "views/delivery/gps-test.html", "public/js/pages/delivery/gps-test.js", "public/js/pages/delivery/simulation.js"])
        assert.equal(fs.existsSync(file), false, `Arquivo antigo não fica acessível: ${file}`);
});

test("endereços antigos de GPS não recebem mais exceções de CSP ou referrer de mapas", async () => {
    const app = express();
    securityMiddleware(app);
    app.get("/admin/pages/dashboard/dashboard.html", (_request, response) => response.status(200).end());
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const page of ["/admin/simular-navegacao", "/admin/testar-gps"]) {
            const response = await fetch(base + page);
            assert.equal(response.status, 404);
            const csp = response.headers.get("content-security-policy");
            assert.ok(!csp.includes("'unsafe-eval'"));
            assert.notEqual(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
        }
        const dashboard = await fetch(base + "/admin/pages/dashboard/dashboard.html");
        assert.ok(!dashboard.headers.get("content-security-policy").includes("'unsafe-eval'"));
    } finally { await new Promise(resolve => server.close(resolve)); }
});
