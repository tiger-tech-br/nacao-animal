"use strict";
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
require.cache[require.resolve("../config/env")] = { exports: { JWT_SECRET: "isolated-route-contract-fixture" } };
const { calcularRota } = require("../services/entregaRotaService");
const engineApi = require("../public/js/pages/delivery/navigation-engine");
const originalFetch = global.fetch, originalKey = process.env.GOOGLE_MAPS_API_KEY;
afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = originalKey;
});

function encode(points) {
    let lat = 0, lng = 0, result = "";
    const part = input => {
        let value = input < 0 ? ~(input << 1) : input << 1, encoded = "";
        while (value >= 32) { encoded += String.fromCharCode((32 | value & 31) + 63); value >>= 5; }
        return encoded + String.fromCharCode(value + 63);
    };
    for (const point of points) {
        const nextLat = Math.round(point.latitude * 1e5), nextLng = Math.round(point.longitude * 1e5);
        result += part(nextLat - lat) + part(nextLng - lng); lat = nextLat; lng = nextLng;
    }
    return result;
}
const p = (latitude, longitude) => ({ latitude, longitude });
const a = p(-23.6600, -46.5500), curve = p(-23.6602, -46.5496), b = p(-23.6600, -46.5492),
    c = p(-23.6592, -46.5492), destination = p(-23.6592, -46.5484);
const frozenAddress = Object.freeze({ endereco: "Rua congelada do pedido", numero: "20", bairro: "Centro", cidade: "Santo André", estado: "SP", cep: "09060700" });
function googleStep(points, meters, duration, instruction, maneuver = "STRAIGHT") {
    return { distanceMeters: meters, staticDuration: duration, polyline: { encodedPolyline: encode(points) },
        startLocation: { latLng: points[0] }, endLocation: { latLng: points.at(-1) },
        navigationInstruction: { maneuver, instructions: instruction } };
}
function googleRoute({ terminal = false } = {}) {
    const steps = [googleStep([a, curve, b], 100, "40s", "Siga pela curva"),
        googleStep([b, c], 90, "30s", "Vire à esquerda", "TURN_LEFT"),
        googleStep([c, destination], 80, "30s", "Vire à direita", "TURN_RIGHT")];
    if (terminal) steps.push(googleStep([destination], 0, "0s", "Você chegou ao destino"));
    return { distanceMeters: 270, duration: "100s", polyline: { encodedPolyline: encode([a, curve, b, c, destination]) },
        legs: [{ startLocation: { latLng: a }, endLocation: { latLng: destination }, steps }] };
}
function fix(point, time, precision = 5) { return { ...point, precisao_m: precision, velocidade_mps: 10, atualizado_em: new Date(time).toISOString() }; }
function mockGoogle(payload, inspect = () => {}) {
    process.env.GOOGLE_MAPS_API_KEY = "isolated-route-key";
    global.fetch = async (url, options) => {
        assert.equal(url, "https://routes.googleapis.com/directions/v2:computeRoutes");
        const request = JSON.parse(options.body); inspect(request, options);
        return { ok: true, json: async () => ({ routes: [payload] }) };
    };
}

test("Google Routes convertido alimenta curva, ordem das manobras, progresso e chegada sem animacao", async () => {
    mockGoogle(googleRoute(), request => {
        assert.deepEqual(request.origin.location.latLng, a);
        assert.equal(request.origin.address, undefined);
        assert.match(request.destination.address, /Rua congelada do pedido, 20/);
        assert.equal(request.travelMode, "DRIVE");
    });
    const converted = await calcularRota(Object.freeze({ ...a }), frozenAddress);
    assert.deepEqual(converted.etapas.map(step => step.instrucao), ["Siga pela curva", "Vire à esquerda", "Vire à direita"]);
    assert.deepEqual(converted.destino, destination);
    const engine = engineApi.create(converted), now = Date.now();
    assert.ok(engine);
    const first = engine.update(fix(a, now), now);
    const curved = engine.update(fix(curve, now + 3000), now + 3000);
    assert.equal(curved.state, "navigating", "Ponto real da curva pertence ao trajeto, sem falso desvio");
    assert.equal(curved.current.instrucao, "Siga pela curva");
    assert.ok(curved.remainingMeters < first.remainingMeters);
    const second = engine.update(fix(b, now + 6000), now + 6000);
    assert.equal(second.current.instrucao, "Vire à esquerda");
    const third = engine.update(fix(c, now + 12000), now + 12000);
    assert.equal(third.current.instrucao, "Vire à direita");
    assert.ok(third.remainingSeconds < second.remainingSeconds);
    const arrival = engine.update(fix(destination, now + 18000), now + 18000);
    assert.equal(arrival.state, "arrived");
    assert.equal(arrival.remainingMeters, 0);
});

test("duas leituras de desvio, rota nova e GPS contemporaneo mantem destino congelado e retomam manobras", async () => {
    const calls = [], rerouteStart = p(-23.6604, -46.5484), e = p(-23.6604, -46.5480), n = p(-23.6592, -46.5480);
    const rerouted = { distanceMeters: 213, duration: "75s", polyline: { encodedPolyline: encode([rerouteStart, e, n, destination]) },
        legs: [{ startLocation: { latLng: rerouteStart }, endLocation: { latLng: destination }, steps: [
            googleStep([rerouteStart, e], 40, "15s", "Siga para leste"), googleStep([e, n], 133, "45s", "Vire à esquerda", "TURN_LEFT"),
            googleStep([n, destination], 40, "15s", "Vire à esquerda novamente", "TURN_LEFT")
        ] }] };
    mockGoogle(googleRoute(), request => calls.push(request));
    const first = await calcularRota(a, frozenAddress), engine = engineApi.create(first), now = Date.now();
    engine.update(fix(a, now), now);
    assert.equal(engine.update(fix(rerouteStart, now + 2000), now + 2000).recalculate, false);
    assert.equal(engine.update(fix(rerouteStart, now + 4000), now + 4000).recalculate, true);
    let release, entered;
    const pendingProvider = new Promise(resolve => { entered = resolve; });
    global.fetch = async (_url, options) => {
        calls.push(JSON.parse(options.body)); entered();
        await new Promise(resolve => { release = resolve; });
        return { ok: true, json: async () => ({ routes: [rerouted] }) };
    };
    const pendingRoute = calcularRota(Object.freeze({ ...rerouteStart }), frozenAddress);
    await pendingProvider;
    // O GPS continua ate E enquanto a consulta esta em andamento.
    const latestFix = fix(e, now + 7000);
    release();
    const next = await pendingRoute, nextEngine = engineApi.create(next);
    assert.ok(nextEngine);
    const resumed = nextEngine.update(latestFix, now + 7000);
    assert.equal(resumed.state, "navigating");
    assert.equal(resumed.current.instrucao, "Vire à esquerda");
    assert.ok(resumed.remainingMeters < next.distanciaMetros, "Retoma no GPS atual, sem voltar a origem do calculo");
    assert.deepEqual(calls[1].origin.location.latLng, rerouteStart);
    assert.equal(calls[1].destination.address, calls[0].destination.address);
    assert.deepEqual(next.destino, destination);
    nextEngine.update(fix(n, now + 14000), now + 14000);
    assert.equal(nextEngine.update(fix(destination, now + 20000), now + 20000).state, "arrived");
    assert.equal(calls.length, 2, "Leituras do sensor nao disparam chamadas Google neste contrato");
});

test("etapa terminal sem deslocamento nao inutiliza navegacao das etapas anteriores", async () => {
    for (const omitDefault of [false, true]) {
        const payload = googleRoute({ terminal: true });
        if (omitDefault) delete payload.legs[0].steps.at(-1).distanceMeters;
        mockGoogle(payload);
        const converted = await calcularRota(a, frozenAddress);
        assert.equal(converted.etapas.at(-1).instrucao, "Você chegou ao destino");
        const engine = engineApi.create(converted), now = Date.now();
        assert.ok(engine, "Etapa terminal zero nao deve transformar trajeto navegavel em rota ausente");
        assert.equal(engine.update(fix(a, now), now).state, "navigating");
    }
});

test("metricas opcionais de etapa podem faltar sem perder curva, manobra ou estimativa total", async () => {
    const payload = googleRoute();
    for (const step of payload.legs[0].steps) { delete step.distanceMeters; delete step.staticDuration; }
    mockGoogle(payload);
    const converted = await calcularRota(a, frozenAddress), engine = engineApi.create(converted), now = Date.now();
    assert.ok(engine);
    const start = engine.update(fix(a, now), now);
    assert.equal(start.remainingSeconds, 100);
    const current = engine.update(fix(c, now + 10000), now + 10000);
    assert.equal(current.current.instrucao, "Vire à direita");
    assert.ok(current.remainingSeconds > 0 && current.remainingSeconds < start.remainingSeconds);
});

test("falha ao recalcular nao inventa nova rota nem transforma desvio em orientacao valida", async () => {
    mockGoogle(googleRoute());
    const converted = await calcularRota(a, frozenAddress), engine = engineApi.create(converted), now = Date.now();
    engine.update(fix(a, now), now);
    const outside = p(-23.6604, -46.5484);
    engine.update(fix(outside, now + 3000), now + 3000);
    assert.equal(engine.update(fix(outside, now + 4000), now + 4000).recalculate, true);
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { message: "provider diagnostic must not be published" } }) });
    await assert.rejects(calcularRota(outside, frozenAddress), error => error.status === 503 && !error.message.includes("provider diagnostic"));
    assert.equal(engine.update(fix(outside, now + 5000), now + 5000).state, "off-route");
    assert.equal(converted.polyline, googleRoute().polyline.encodedPolyline, "Resposta com falha nao altera a rota anterior");
});

test("normalizacao nao aceita distancia invalida, rota ausente ou polylines de outro tipo", async () => {
    for (const change of [payload => { payload.distanceMeters = -1; }, payload => { payload.distanceMeters = "270"; },
        payload => { payload.distanceMeters = null; }, payload => { payload.polyline.encodedPolyline = {}; }, payload => { payload.legs = {}; }]) {
        const payload = googleRoute(); change(payload); mockGoogle(payload);
        await assert.rejects(calcularRota(a, frozenAddress), error => error.status === 503);
    }
    mockGoogle(undefined);
    await assert.rejects(calcularRota(a, frozenAddress), error => error.status === 503);
});

test("rota de distancia zero omitida pelo proto permanece zero sem inventar trajeto", async () => {
    const payload = { duration: "0s", polyline: { encodedPolyline: encode([destination]) },
        legs: [{ startLocation: { latLng: destination }, endLocation: { latLng: destination }, steps: [] }] };
    mockGoogle(payload);
    const converted = await calcularRota(destination, frozenAddress);
    assert.equal(converted.distanciaMetros, 0);
    assert.deepEqual(converted.origem, converted.destino);
    assert.deepEqual(converted.etapas, []);
});
