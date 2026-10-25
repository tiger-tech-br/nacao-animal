"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const db = require("../database/connection");
const { JWT_SECRET } = require("../config/env");

function responseStub() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        set(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test("sessão administrativa usa o perfil atual e revoga versão antiga", async () => {
    const originalQuery = db.query;
    const authMiddleware = require("../middlewares/authMiddleware");
    try {
        db.query = async () => ({ rows: [{
            id: "11111111-1111-4111-8111-111111111111",
            empresa_id: "22222222-2222-4222-8222-222222222222",
            nome: "Gerente atual",
            email: "gerente@example.invalid",
            perfil: "GERENTE",
            sessao_versao: 2
        }] });
        const token = jwt.sign({
            id: "11111111-1111-4111-8111-111111111111",
            empresaId: "22222222-2222-4222-8222-222222222222",
            cargo: "ADMIN",
            sv: 2
        }, JWT_SECRET);
        const request = { headers: { authorization: `Bearer ${token}` } };
        const response = responseStub();
        let nextCalled = false;
        await authMiddleware(request, response, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(request.user.perfil, "GERENTE");

        const oldToken = jwt.sign({
            id: request.user.id,
            empresaId: request.user.empresaId,
            cargo: "ADMIN",
            sv: 1
        }, JWT_SECRET);
        const revokedResponse = responseStub();
        await authMiddleware({ headers: { authorization: `Bearer ${oldToken}` } }, revokedResponse, () => {});
        assert.equal(revokedResponse.statusCode, 401);
    } finally {
        db.query = originalQuery;
    }
});

test("sessão do cliente exige conta ativa e versão atual", async () => {
    const originalQuery = db.query;
    const customerAuthMiddleware = require("../middlewares/customerAuthMiddleware");
    try {
        db.query = async () => ({ rows: [{
            id: "33333333-3333-4333-8333-333333333333",
            empresa_id: "22222222-2222-4222-8222-222222222222",
            nome: "Cliente",
            email: "cliente@example.invalid",
            sessao_versao: 4
        }] });
        const token = jwt.sign({
            type: "customer",
            id: "33333333-3333-4333-8333-333333333333",
            empresaId: "22222222-2222-4222-8222-222222222222",
            sv: 3
        }, JWT_SECRET);
        const response = responseStub();
        await customerAuthMiddleware({ headers: { authorization: `Bearer ${token}` } }, response, () => {});
        assert.equal(response.statusCode, 401);
    } finally {
        db.query = originalQuery;
    }
});

test("sessão do cliente é renovável por 30 minutos usando o cadastro atual", async () => {
    const originalQuery = db.query;
    const middleware = require("../middlewares/customerAuthMiddleware");
    const controller = require("../controllers/publicCustomerController");
    const { createCustomerToken, CUSTOMER_SESSION_SECONDS } = require("../services/customerSessionService");
    try {
        db.query = async () => ({ rows: [{ id: "customer-a", empresa_id: "store-a",
            nome: "Nome atual", email: "customer@example.invalid", sessao_versao: 4 }] });
        const old = jwt.sign({ type: "customer", id: "customer-a", empresaId: "store-a", nome: "Nome anterior", sv: 4,
            iat: Math.floor(Date.now() / 1000) - 120 }, JWT_SECRET, { expiresIn: CUSTOMER_SESSION_SECONDS });
        const request = { headers: { authorization: `Bearer ${old}` } };
        const response = responseStub();
        await middleware(request, response, () => controller.renewSession(request, response));
        assert.equal(response.statusCode, 200);
        assert.equal(response.headers["Cache-Control"], "no-store");
        const claims = jwt.verify(response.body.data.token, JWT_SECRET);
        assert.equal(response.body.data.expiresInSeconds, 1800);
        assert.equal(claims.exp - claims.iat, 1800);
        assert.ok(claims.iat > jwt.decode(old).iat);
        assert.equal(claims.nome, "Nome atual");
        assert.equal(claims.sv, 4);
        assert.equal(jwt.decode(createCustomerToken(request.customer)).exp - claims.iat, 1800);
    } finally { db.query = originalQuery; }
});

test("renovação não aceita token vencido, revogado, administrativo ou conta removida", async () => {
    const originalQuery = db.query;
    const middleware = require("../middlewares/customerAuthMiddleware");
    const controller = require("../controllers/publicCustomerController");
    try {
        for (const scenario of ["expired", "revoked", "admin", "removed"]) {
            db.query = async () => ({ rows: scenario === "removed" ? [] : [{
                id: "customer-a", empresa_id: "store-a", sessao_versao: scenario === "revoked" ? 2 : 1
            }] });
            const token = jwt.sign({ type: scenario === "admin" ? "admin" : "customer", id: "customer-a",
                empresaId: "store-a", sv: 1, iat: Math.floor(Date.now() / 1000) - (scenario === "expired" ? 1801 : 0)
            }, JWT_SECRET, { expiresIn: 1800 });
            const request = { headers: { authorization: `Bearer ${token}` } };
            const response = responseStub();
            let renewed = false;
            await middleware(request, response, () => { renewed = true; controller.renewSession(request, response); });
            assert.equal(renewed, false, scenario);
            assert.equal(response.statusCode, scenario === "admin" ? 403 : 401, scenario);
            assert.equal(response.body?.data?.token, undefined, scenario);
        }
    } finally { db.query = originalQuery; }
});

test("falha temporária no banco retorna 503 sem renovar ou invalidar a conta", async () => {
    const originalQuery = db.query;
    const middleware = require("../middlewares/customerAuthMiddleware");
    try {
        db.query = async () => { throw Object.assign(new Error("fixture database unavailable"), { code: "ECONNREFUSED" }); };
        const { createCustomerToken } = require("../services/customerSessionService");
        const token = createCustomerToken({ id: "customer-a", empresaId: "store-a", sv: 1 });
        const response = responseStub();
        await middleware({ headers: { authorization: `Bearer ${token}` } }, response, () => assert.fail("Não deve renovar"));
        assert.equal(response.statusCode, 503);
    } finally { db.query = originalQuery; }
});
