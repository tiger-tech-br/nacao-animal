"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

let activeDb, routeProvider;
const db = { query: (...args) => activeDb.query(...args), transaction: callback => activeDb.transaction(callback) };
require.cache[require.resolve("../database/connection")] = { exports: db };
require.cache[require.resolve("../config/env")] = { exports: { APP_URL: "https://demo.example.invalid" } };
require.cache[require.resolve("../services/freteService")] = { exports: {} };
require.cache[require.resolve("../services/entregaRotaService")] = { exports: { calcularRota: (...args) => routeProvider(...args) } };
const controller = require("../controllers/entregaController");
const token = "a".repeat(64), tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const saleId = "11111111-1111-4111-8111-111111111111";
const route = { tipoOrigem: "GPS_ENTREGADOR", polyline: "test-route", origem: { latitude: -23.66, longitude: -46.55 }, destino: { latitude: -23.67, longitude: -46.56 } };

function harness({ tracking = {}, valid = true, recent = false, existingRoute = null } = {}) {
    const state = { valid, recent, latitude: -23.66, longitude: -46.55, precisao_m: 10,
        atualizado_em: new Date(), rota: existingRoute, reservation: null, reservationIndex: 0, ...tracking };
    const queries = [], providerCalls = [];
    activeDb = {
        async transaction(callback) { return callback(this); },
        async query(sql, values) {
            const statement = sql.trim().replace(/\s+/g, " ");
            queries.push({ sql: statement, values });
            if (statement.startsWith("SELECT v.id FROM vendas")) {
                assert.match(statement, /FOR UPDATE OF v$/);
                assert.deepEqual(values, [tokenHash]);
                return { rows: state.valid ? [{ id: saleId }] : [] };
            }
            if (statement.startsWith("UPDATE entrega_rastreamento SET latitude=")) {
                assert.match(statement, /atualizado_em<\$4::timestamptz/);
                const [latitude, longitude, precision, capture, id, hash] = values;
                if (!state.valid || id !== saleId || hash !== tokenHash || capture && state.atualizado_em && new Date(state.atualizado_em) >= new Date(capture)) return { rowCount: 0, rows: [] };
                Object.assign(state, { latitude, longitude, precisao_m: precision, atualizado_em: capture || new Date() });
                return { rowCount: 1, rows: [] };
            }
            if (statement.startsWith("SELECT 1 FROM entrega_rastreamento r JOIN vendas")) {
                assert.deepEqual(values,[tokenHash]);
                return {rows:state.valid?[{exists:1}]:[]};
            }
            if (statement.startsWith("SELECT 1 FROM entrega_rastreamento")) {
                assert.match(statement, /atualizado_em>=\$3::timestamptz/);
                assert.deepEqual(values.slice(0, 2), [saleId, tokenHash]);
                return { rows: state.valid && new Date(state.atualizado_em) >= new Date(values[2]) ? [{ exists: 1 }] : [] };
            }
            if (statement.startsWith("SELECT v.id,v.endereco_entrega,r.*")) {
                assert.match(statement, /INTERVAL '15 seconds'/);
                assert.match(statement, /FOR UPDATE OF v,r$/);
                return { rows: state.valid ? [{ id: saleId, endereco_entrega: { endereco: "Rua do pedido" }, ...state, recente: state.recent }] : [] };
            }
            if (statement.startsWith("UPDATE entrega_rastreamento SET rota_solicitada_em=")) {
                state.reservation = new Date(Date.now() + ++state.reservationIndex);
                state.recent = true;
                return { rows: [{ rota_solicitada_em: state.reservation }] };
            }
            if (statement.startsWith("UPDATE entrega_rastreamento SET rota=")) {
                assert.match(statement, /token_hash=\$3/);
                assert.match(statement, /rota_solicitada_em=\$4/);
                assert.match(statement, /status='SAIU_PARA_ENTREGA'/);
                if (!state.valid || values[2] !== tokenHash || state.reservation !== values[3]) return { rowCount: 0, rows: [] };
                state.rota = values[0];
                return { rowCount: 1, rows: [] };
            }
            assert.fail("Unexpected SQL operation in GPS controller test");
        }
    };
    routeProvider = async (...args) => { providerCalls.push(args); return route; };
    return { state, queries, providerCalls };
}

async function invoke(name, body = {}, authorization = `Bearer ${token}`) {
    let error;
    const response = { headers: {}, set(name, value) { this.headers[name] = value; return this; }, json(value) { this.body = value; return this; } };
    await controller[name]({ method: "POST", body, get: () => authorization }, response, caught => { error = caught; });
    return { ...response, error };
}

test("publicacao atrasada e duplicada nao retrocede GPS armazenado nem invalida link", async () => {
    const now = Date.now(), newest = new Date(now - 1000).toISOString(), older = new Date(now - 2000).toISOString();
    const h = harness({ tracking: { atualizado_em: null } });
    const current = { latitude: -23.67, longitude: -46.56, precisao: 8, capturadoEm: newest };
    assert.equal((await invoke("localizacao", current)).error, undefined);
    const delayed = await invoke("localizacao", { latitude: -23.68, longitude: -46.57, precisao: 9, capturadoEm: older });
    assert.equal(delayed.error, undefined);
    assert.deepEqual(delayed.body, { success: true });
    assert.equal(delayed.headers["Cache-Control"], "no-store");
    assert.equal(h.state.latitude, current.latitude);
    assert.equal(h.state.longitude, current.longitude);
    assert.equal(h.state.atualizado_em, newest);
    assert.equal((await invoke("localizacao", current)).error, undefined, "Reenvio da mesma leitura e idempotente");
    const divergentDuplicate = await invoke("localizacao", { ...current, latitude: -23.69, longitude: -46.59, precisao: 1 });
    assert.equal(divergentDuplicate.error, undefined, "Timestamp repetido recebe ACK sem substituir o primeiro fix");
    assert.equal(h.state.latitude, current.latitude);
    assert.equal(h.state.longitude, current.longitude);
    assert.equal(h.state.precisao_m, current.precisao);
    assert.equal(h.state.atualizado_em, newest);
    assert.equal(h.providerCalls.length, 0);
});

test("publicacao legada sem timestamp mantem compatibilidade e revogacao nao vira sucesso ignorado", async () => {
    const h = harness();
    assert.equal((await invoke("localizacao", { latitude: -23.65, longitude: -46.54, precisao: 10 })).error, undefined);
    assert.equal(h.state.latitude, -23.65);
    h.state.valid = false;
    const revoked = await invoke("localizacao", { latitude: -23.64, longitude: -46.53, precisao: 10, capturadoEm: new Date().toISOString() });
    assert.equal(revoked.error.status, 410);
    assert.equal(h.state.latitude, -23.65);
});

test("token ou sensor invalidos nao chegam ao banco", async () => {
    const h = harness();
    assert.equal((await invoke("localizacao", {}, "Bearer wrong")).error.status, 401);
    assert.equal((await invoke("localizacao", { latitude: 91, longitude: 0, precisao: 1 })).error.status, 400);
    assert.equal((await invoke("localizacao", { latitude: 0, longitude: 0, precisao: 1, capturadoEm: new Date(Date.now() - 60000).toISOString() })).error.status, 400);
    assert.equal(h.queries.length, 0);
});

test("rota exige GPS preciso e recente mesmo quando uma rota anterior esta em cache", async () => {
    for (const tracking of [{ atualizado_em: new Date(Date.now() - 16000) }, { atualizado_em: new Date(Date.now() + 6000) },
        { atualizado_em: "invalid" }, { atualizado_em: null }, { precisao_m: 51 }, { precisao_m: null },
        { latitude: null }, { longitude: 181 }]) {
        const h = harness({ tracking, recent: true, existingRoute: route });
        const result = await invoke("rota");
        assert.equal(result.error.status, 409);
        assert.equal(h.providerCalls.length, 0);
        assert.ok(!h.queries.some(item => item.sql.startsWith("UPDATE")));
    }
});

test("GPS valido consulta rota, reserva custo e entrega cache sem outra consulta Google", async () => {
    const h = harness();
    const first = await invoke("rota");
    assert.equal(first.error, undefined);
    assert.deepEqual(first.body, { success: true, data: route });
    const cached = await invoke("rota");
    assert.equal(cached.error, undefined);
    assert.deepEqual(cached.body, first.body);
    assert.equal(h.providerCalls.length, 1);
    assert.equal(h.queries.filter(item => item.sql.startsWith("UPDATE entrega_rastreamento SET rota_solicitada_em=")).length, 1);
});

test("consulta concorrente aguarda reserva em vez de chamar Google de novo", async () => {
    const h = harness({ recent: true });
    const result = await invoke("rota");
    assert.equal(result.error.status, 429);
    assert.equal(h.providerCalls.length, 0);
});

test("encerrar ou trocar o link enquanto Google responde impede salvar rota anterior", async () => {
    const h = harness();
    let release, started;
    const providerStarted = new Promise(resolve => { started = resolve; });
    routeProvider = () => { started(); return new Promise(resolve => { release = resolve; }); };
    const pending = invoke("rota");
    await providerStarted;
    h.state.valid = false;
    release(route);
    const result = await pending;
    assert.equal(result.error.status, 410);
    assert.equal(h.state.rota, null);
});

test("resposta de rota antiga nao substitui recalculo posterior ja salvo", async () => {
    const h = harness();
    const releases = [], entered = [];
    routeProvider = () => new Promise(resolve => { releases.push(resolve); entered.shift()?.(); });
    const waitProvider = () => new Promise(resolve => { entered.push(resolve); });
    let ready = waitProvider();
    const first = invoke("rota");
    await ready;
    // Outra reserva apos o cooldown, mantendo uma nova leitura GPS fresca.
    h.state.recent = false;
    ready = waitProvider();
    const second = invoke("rota");
    await ready;
    const latestRoute = { ...route, polyline: "new-route" };
    releases[1](latestRoute);
    assert.equal((await second).error, undefined);
    releases[0](route);
    assert.equal((await first).error.status, 409,"Uma rota substituída não encerra um link que continua válido");
    assert.equal(h.state.rota, latestRoute);
});
