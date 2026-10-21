"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const express = require("express");
const securityMiddleware = require("../middlewares/securityMiddleware");

async function withServer(environment, run) {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = environment;
    const app = express();
    securityMiddleware(app);
    app.all("/probe", (_request, response) => response.json({ ok: true }));
    app.use((_error, _request, response, _next) => response.status(403).json({ ok: false }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        await run(server.address().port);
    } finally {
        await new Promise(resolve => server.close(resolve));
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
    }
}

function request(port, { method = "GET", origin, host } = {}) {
    return new Promise((resolve, reject) => {
        const headers = { Host: host || `127.0.0.1:${port}` };
        if (origin) headers.Origin = origin;
        if (method === "OPTIONS") headers["Access-Control-Request-Method"] = "POST";
        const req = http.request({ hostname: "127.0.0.1", port, path: "/probe", method, headers }, response => {
            response.resume();
            response.on("end", () => resolve({ status: response.statusCode, headers: response.headers }));
        });
        req.on("error", reject);
        req.end();
    });
}

test("acesso pelo celular mantém HTTP local e restringe a origem à própria máquina", async t => {
    t.mock.method(os, "networkInterfaces", () => ({
        WiFi: [{ address: "192.168.0.9", internal: false, family: "IPv4" }]
    }));

    await withServer("development", async port => {
        const origin = `http://192.168.0.9:${port}`;
        const host = `192.168.0.9:${port}`;
        const page = await request(port);
        assert.equal(page.status, 200);
        assert.doesNotMatch(page.headers["content-security-policy"], /upgrade-insecure-requests/);

        const preflight = await request(port, { origin, host, method: "OPTIONS" });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers["access-control-allow-origin"], origin);
        assert.equal(preflight.headers["access-control-allow-credentials"], "true");

        const post = await request(port, { origin, host, method: "POST" });
        assert.equal(post.status, 200);
        assert.equal(post.headers["access-control-allow-origin"], origin);

        const localhost = `http://localhost:${port}`;
        const loopback = await request(port, { origin: localhost, host: `localhost:${port}`, method: "POST" });
        assert.equal(loopback.status, 200);

        for (const invalid of [
            { origin: `http://192.168.0.8:${port}`, host: `192.168.0.8:${port}` },
            { origin: `http://other.example:${port}`, host: `other.example:${port}` },
            { origin, host: `127.0.0.1:${port}` },
            { origin: `http://192.168.0.9:${port + 1}`, host: `192.168.0.9:${port + 1}` },
            { origin: `https://192.168.0.9:${port}`, host }
        ]) {
            const blocked = await request(port, { ...invalid, method: "POST" });
            assert.equal(blocked.status, 403);
            assert.equal(blocked.headers["access-control-allow-origin"], undefined);
        }
    });

    await withServer("production", async port => {
        const page = await request(port);
        assert.match(page.headers["content-security-policy"], /upgrade-insecure-requests/);
        const blocked = await request(port, {
            origin: `http://192.168.0.9:${port}`, host: `192.168.0.9:${port}`, method: "POST"
        });
        assert.equal(blocked.status, 403);
        assert.equal(blocked.headers["access-control-allow-origin"], undefined);
    });
});
