"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

const company = "11111111-1111-4111-8111-111111111111";
const otherCompany = "22222222-2222-4222-8222-222222222222";
const driverId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const secret = "test-only-entregadores-secret";
let activeDb;
const db = { query: (...args) => activeDb.query(...args), transaction: callback => activeDb.transaction(callback) };
require.cache[require.resolve("../database/connection")] = { exports: db };
require.cache[require.resolve("../config/env")] = { exports: { JWT_SECRET: secret } };
const controller = require("../controllers/entregadorController");
const router = require("../routes/entregadorRoutes");

function harness({ role = "ADMIN", auditFailure = false } = {}) {
    const state = { entries: new Map([
        [driverId, { id: driverId, empresa_id: company, nome: "Entregador de teste", telefone: null, meio_transporte: "CARRO", ativo: true }],
        [otherId, { id: otherId, empresa_id: otherCompany, nome: "Outra loja", telefone: null, meio_transporte: "A_PE", ativo: true }]
    ]), audit: [], role, counter: 0 };
    const queries = [], copy = value => structuredClone(value);
    const result = item => ({ rows: item ? [copy(item)] : [], rowCount: item ? 1 : 0 });
    activeDb = {
        async transaction(callback) {
            const before = copy(state.entries), beforeAudit = copy(state.audit);
            try { return await callback(this); }
            catch (error) { state.entries = before; state.audit = beforeAudit; throw error; }
        },
        async query(sql, values = []) {
            const statement = sql.trim().replace(/\s+/g, " ");
            queries.push({ sql: statement, values });
            if (statement.includes("FROM usuarios")) {
                return result(values[0] === userId && values[1] === company
                    ? { id: userId, empresa_id: company, nome: "Admin de teste", email: "test@example.invalid", perfil: state.role, sessao_versao: 1 } : null);
            }
            if (statement.startsWith("INSERT INTO auditoria_admin")) {
                assert.equal(values[0], company);
                if (auditFailure) throw new Error("Auditoria indisponível");
                state.audit.push({ acao: values[2], entidade: values[3], id: values[4], anterior: values[6], novo: values[7] });
                return { rows: [], rowCount: 1 };
            }
            if (statement.startsWith("SELECT") && statement.includes("FROM entregadores")) {
                if (statement.includes("WHERE empresa_id=$1")) {
                    assert.match(statement, /\$2::boolean IS NULL OR ativo=\$2/);
                    return { rows: copy([...state.entries.values()].filter(item => item.empresa_id === values[0] &&
                        (values[1] === null || item.ativo === values[1])).sort((a, b) => a.nome.localeCompare(b.nome))) };
                }
                assert.match(statement, /WHERE id=\$1 AND empresa_id=\$2/);
                const item = state.entries.get(values[0]);
                return result(item?.empresa_id === values[1] ? item : null);
            }
            if (statement.startsWith("INSERT INTO entregadores")) {
                const id = `66666666-6666-4666-8666-${String(++state.counter).padStart(12, "0")}`;
                const item = { id, empresa_id: values[0], nome: values[1], telefone: values[2], meio_transporte: values[3], ativo: values[4] };
                state.entries.set(id, item); return result(item);
            }
            if (statement.startsWith("UPDATE entregadores SET nome=")) {
                assert.match(statement, /WHERE id=\$5 AND empresa_id=\$6/);
                const item = state.entries.get(values[4]);
                if (item?.empresa_id !== values[5]) return result(null);
                Object.assign(item, { nome: values[0], telefone: values[1], meio_transporte: values[2], ativo: values[3] });
                return result(item);
            }
            if (statement.startsWith("UPDATE entregadores SET ativo=FALSE")) {
                assert.match(statement, /WHERE id=\$1 AND empresa_id=\$2/);
                const item = state.entries.get(values[0]);
                if (item?.empresa_id !== values[1]) return result(null);
                item.ativo = false; return result(item);
            }
            assert.fail("Operação inesperada no cadastro de entregadores");
        }
    };
    return { state, queries };
}

async function invoke(method, { body, id = driverId, query = {}, user = { id: userId, empresaId: company, perfil: "ADMIN" } } = {}) {
    const res = { code: 200, headers: {}, status(code) { this.code = code; return this; },
        set(key, value) { this.headers[key] = value; return this; }, json(body) { this.body = body; return this; } };
    let error;
    await controller[method]({ user, params: { id }, query, body, ip: "127.0.0.1" }, res, caught => { error = caught; });
    return { ...res, error };
}

test("cadastro de entregadores exige administração e empresa válida antes de consultar dados", async () => {
    const h = harness();
    for (const [user, status] of [[null, 401], [{ empresaId: company, perfil: "CLIENTE" }, 403],
        [{ empresaId: "invalid", cargo: "ADMIN" }, 403]]) {
        for (const method of ["listar", "buscarPorId", "criar", "atualizar", "desativar"])
            assert.equal((await invoke(method, { user, body: { nome: "Teste", meio_transporte: "CARRO" } })).error.status, status);
    }
    assert.equal(h.queries.length, 0);
});

test("cadastro aceita os quatro transportes sem criar conta, senha ou permissões de acesso", async () => {
    const h = harness();
    for (const mode of ["CARRO", "MOTO", "BICICLETA", "A_PE"]) {
        const response = await invoke("criar", { body: { nome: "  Entregador de teste  ", meio_transporte: mode } });
        assert.equal(response.error, undefined); assert.equal(response.code, 201);
        assert.equal(response.body.data.nome, "Entregador de teste");
        assert.equal(response.body.data.empresa_id, company);
        assert.equal(response.body.data.meio_transporte, mode);
        assert.equal(response.body.data.telefone, null); assert.equal(response.body.data.ativo, true);
        assert.equal(response.headers["Cache-Control"], "no-store");
    }
    assert.equal(h.state.audit.length, 4);
    assert.ok(h.state.audit.every(item => item.acao === "CRIAR" && item.entidade === "ENTREGADOR"));
    assert.ok(!h.queries.some(item => /INSERT INTO usuarios|entrega_rastreamento/i.test(item.sql)));
});

test("dados extras, transporte desconhecido e campos inválidos não chegam ao banco", async () => {
    const h = harness(), valid = { nome: "Teste", meio_transporte: "CARRO" };
    const bodies = [null, [], {}, { ...valid, empresa_id: otherCompany }, { ...valid, senha: "not-a-password" },
        { ...valid, id: otherId }, { ...valid, perfil: "ADMIN" }, { ...valid, meio_transporte: "AUTOMATICO" },
        { ...valid, meio_transporte: "WALK" }, { ...valid, nome: "x" }, { ...valid, nome: "x".repeat(151) },
        { ...valid, nome: "Nome\nextra" }, { ...valid, telefone: "email@example.invalid" },
        { ...valid, telefone: "1".repeat(21) }, { ...valid, telefone: 11999999999 }, { ...valid, ativo: 0 }];
    for (const body of bodies) assert.equal((await invoke("criar", { body })).error.status, 400);
    assert.equal(h.queries.length, 0);
});

test("nome e telefone são valores parametrizados e o status textual do formulário é convertido", async () => {
    const h = harness();
    const nome = "Nome ' com aspas", telefone = "+55 (11) 99999-9999";
    const response = await invoke("criar", { body: { nome, telefone, meio_transporte: "MOTO", ativo: "false" } });
    assert.equal(response.error, undefined); assert.equal(response.body.data.ativo, false);
    assert.equal(response.body.data.telefone, telefone);
    const inserted = h.queries.find(item => item.sql.startsWith("INSERT INTO entregadores"));
    assert.ok(!inserted.sql.includes(nome)); assert.deepEqual(inserted.values, [company, nome, telefone, "MOTO", false]);
});

test("listagem e busca isolam empresas e incluem inativos para permitir reativação", async () => {
    const h = harness(); h.state.entries.get(driverId).ativo = false;
    const all = await invoke("listar");
    assert.equal(all.body.data.length, 1); assert.equal(all.body.data[0].id, driverId);
    assert.equal(all.body.data[0].ativo, false);
    assert.deepEqual((await invoke("listar", { query: { ativos: "true" } })).body.data, []);
    assert.equal((await invoke("listar", { query: { ativos: "false" } })).body.data[0].id, driverId);
    assert.equal((await invoke("buscarPorId", { id: otherId })).error.status, 404);
    assert.equal((await invoke("buscarPorId")).body.data.id, driverId);
});

test("IDs e filtros inválidos são recusados sem consulta", async () => {
    const h = harness();
    for (const method of ["buscarPorId", "atualizar", "desativar"])
        assert.equal((await invoke(method, { id: "not-uuid", body: { ativo: false } })).error.status, 400);
    for (const query of [{ ativos: "any" }, { ativos: ["true", "false"] }, { empresa_id: otherCompany }])
        assert.equal((await invoke("listar", { query })).error.status, 400);
    assert.equal(h.queries.length, 0);
});

test("editar ou desativar entregador de outra loja responde 404 e preserva os dados", async () => {
    const h = harness(), before = structuredClone(h.state.entries.get(otherId));
    assert.equal((await invoke("atualizar", { id: otherId, body: { nome: "Alterado", ativo: false } })).error.status, 404);
    assert.equal((await invoke("desativar", { id: otherId })).error.status, 404);
    assert.deepEqual(h.state.entries.get(otherId), before); assert.equal(h.state.audit.length, 0);
    assert.ok(!h.queries.some(item => item.sql.startsWith("UPDATE")));
});

test("edição parcial preserva dados omitidos, aceita limpar telefone e não altera uma viagem", async () => {
    const h = harness(); h.state.entries.get(driverId).telefone = "(11) 99999-9999";
    const response = await invoke("atualizar", { body: { meio_transporte: "BICICLETA" } });
    assert.equal(response.error, undefined); assert.equal(response.body.data.meio_transporte, "BICICLETA");
    assert.equal(response.body.data.nome, "Entregador de teste"); assert.equal(response.body.data.telefone, "(11) 99999-9999");
    assert.equal((await invoke("atualizar", { body: { telefone: "" } })).body.data.telefone, null);
    assert.match(h.queries.find(item => item.sql.startsWith("SELECT")).sql, /FOR UPDATE$/);
    assert.ok(!h.queries.some(item => /entrega_rastreamento|vendas/.test(item.sql)));
    assert.equal(h.state.audit[0].acao, "EDITAR");
});

test("desativação é recuperável, idempotente e reativação não troca dados do entregador", async () => {
    const h = harness();
    const response = await invoke("desativar");
    assert.equal(response.error, undefined); assert.equal(response.body.data.ativo, false);
    assert.ok(h.state.entries.has(driverId)); assert.equal(h.state.audit.length, 1);
    assert.equal(h.state.audit[0].acao, "DESATIVAR");
    assert.equal((await invoke("desativar")).body.data.ativo, false);
    assert.equal(h.state.audit.length, 1);
    const restored = await invoke("atualizar", { body: { ativo: "true" } });
    assert.equal(restored.body.data.ativo, true); assert.equal(restored.body.data.nome, "Entregador de teste");
    assert.equal(restored.body.data.meio_transporte, "CARRO");
    assert.ok(!h.queries.some(item => /DELETE FROM|entrega_rastreamento/.test(item.sql)));
});

test("falha de auditoria desfaz criação, edição e desativação na mesma transação", async () => {
    for (const [method, body] of [["criar", { nome: "Novo teste", meio_transporte: "A_PE" }],
        ["atualizar", { nome: "Alterado" }], ["desativar", undefined]]) {
        const h = harness({ auditFailure: true }), before = structuredClone(h.state.entries);
        const response = await invoke(method, { body });
        assert.equal(response.error.message, "Auditoria indisponível");
        assert.deepEqual(h.state.entries, before); assert.equal(h.state.audit.length, 0);
    }
});

test("rotas HTTP exigem autenticação e perfil administrativo inclusive na listagem", async () => {
    const h = harness(), app = express();
    app.use(express.json()); app.use("/entregadores", router);
    app.use((error, req, res, next) => res.status(error.status || 500).json({ success: false }));
    const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
    const base = `http://127.0.0.1:${server.address().port}/entregadores`;
    const token = () => jwt.sign({ id: userId, empresaId: company, sv: 1 }, secret, { expiresIn: "1m" });
    try {
        assert.equal((await fetch(base)).status, 401);
        h.state.role = "CLIENTE";
        assert.equal((await fetch(base, { headers: { Authorization: `Bearer ${token()}` } })).status, 403);
        h.state.role = "GERENTE";
        const allowed = await fetch(base, { headers: { Authorization: `Bearer ${token()}` } });
        assert.equal(allowed.status, 200); assert.equal((await allowed.json()).data.length, 1);
        const forged = await fetch(base, { method: "POST", headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
            body: JSON.stringify({ nome: "Teste", meio_transporte: "CARRO", empresa_id: otherCompany }) });
        assert.equal(forged.status, 400);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
