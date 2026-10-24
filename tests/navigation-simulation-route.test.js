"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const securityMiddleware = require("../middlewares/securityMiddleware");

test("rota do simulador entrega somente documento fixo e impede cache sem usar dados da requisicao", () => {
    const source = fs.readFileSync("app.js", "utf8");
    const registration = source.match(/app\.get\("\/admin\/simular-navegacao",[\s\S]*?\n\}\);/)?.[0];
    assert.ok(registration, "Simulator GET route is registered");
    let handler;
    vm.runInNewContext(registration, {
        app: { get(route, callback) { assert.equal(route, "/admin/simular-navegacao"); handler = callback; } },
        path, __dirname: path.resolve(".")
    });
    const sent = [], headers = {};
    handler({ query: { file: "../../.env", next: "https://external.invalid" } }, {
        set(name, value) { headers[name] = value; }, sendFile(file) { sent.push(file); }
    });
    assert.equal(headers["Cache-Control"], "no-store");
    assert.deepEqual(sent, [path.resolve("views", "delivery", "simulation.html")]);
});

test("CSP e referrer liberam Maps no simulador sem expandir a excecao a outras paginas", async () => {
    const app = express();
    securityMiddleware(app);
    app.get(["/admin/simular-navegacao", "/admin/testar-gps", "/admin/pages/dashboard/dashboard.html"], (_request, response) => response.status(200).end());
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const page of ["/admin/simular-navegacao", "/admin/testar-gps"]) {
            const response = await fetch(base + page);
            assert.equal(response.status, 200);
            const csp = response.headers.get("content-security-policy");
            assert.ok(csp.includes("https://maps.googleapis.com"));
            assert.ok(csp.includes("https://maps.gstatic.com"));
            assert.ok(csp.includes("'unsafe-eval'"));
            assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
        }
        const dashboard = await fetch(base + "/admin/pages/dashboard/dashboard.html");
        assert.ok(!dashboard.headers.get("content-security-policy").includes("'unsafe-eval'"));
    } finally { await new Promise(resolve => server.close(resolve)); }
});
