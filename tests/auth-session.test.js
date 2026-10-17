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
