"use strict";
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
require.cache[require.resolve("../config/env")] = { exports: { JWT_SECRET: "test-route-secret" } };
const { calcularRota } = require("../services/entregaRotaService");
const initialFetch = global.fetch;
const initialKey = process.env.GOOGLE_MAPS_API_KEY, initialOrigin = process.env.DELIVERY_ORIGIN_ADDRESS;
afterEach(() => {
    global.fetch = initialFetch;
    if (initialKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = initialKey;
    if (initialOrigin === undefined) delete process.env.DELIVERY_ORIGIN_ADDRESS; else process.env.DELIVERY_ORIGIN_ADDRESS = initialOrigin;
});
const address = { endereco: "Rua do Cliente", numero: "20", bairro: "Centro", cidade: "Santo André", estado: "SP", cep: "09060700" };
const responseRoute = { distanceMeters: 1200, duration: "180s", polyline: { encodedPolyline: "test-route" }, legs: [{ startLocation: { latLng: { latitude: -23.66, longitude: -46.55 } }, endLocation: { latLng: { latitude: -23.67, longitude: -46.56 } }, steps: [{ distanceMeters: 500, staticDuration: "60s", polyline: { encodedPolyline: "step-route" }, startLocation: { latLng: { latitude: -23.66, longitude: -46.55 } }, endLocation: { latLng: { latitude: -23.665, longitude: -46.555 } }, navigationInstruction: { maneuver: "TURN_RIGHT", instructions: "Vire à direita" } }] }] };
test("rota usa GPS do entregador e mantém o endereço da loja apenas para o frete", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key"; process.env.DELIVERY_ORIGIN_ADDRESS = "Loja configurada, 100";
    global.fetch = async (url, options) => {
        const request = JSON.parse(options.body);
        assert.deepEqual(request.origin.location.latLng,{latitude:-23.66,longitude:-46.55});
        assert.match(request.destination.address,/Rua do Cliente, 20/);
        assert.equal(request.origin.address,undefined);
        assert.match(options.headers["X-Goog-FieldMask"],/startLocation/);
        assert.match(options.headers["X-Goog-FieldMask"],/navigationInstruction/);
        return { ok: true, json: async () => ({ routes: [responseRoute] }) };
    };
    const route = await calcularRota({latitude:-23.66,longitude:-46.55},address);
    assert.equal(route.tipoOrigem,"GPS_ENTREGADOR");
    assert.deepEqual(route.origem,responseRoute.legs[0].startLocation.latLng);
    assert.deepEqual(route.destino,responseRoute.legs[0].endLocation.latLng);
    assert.equal(route.etapas[0].instrucao,"Vire à direita");
    assert.equal(route.etapas[0].manobra,"TURN_RIGHT");
});
test("rota rejeita GPS inválido e resposta sem ponto de partida", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key"; process.env.DELIVERY_ORIGIN_ADDRESS = "Loja configurada, 100";
    global.fetch = async (url, options) => {
        assert.equal(JSON.parse(options.body).origin.location.latLng.latitude,-23.66);
        return { ok: true, json: async () => ({ routes: [{ ...responseRoute, legs: [{ endLocation: responseRoute.legs[0].endLocation }] }] }) };
    };
    await assert.rejects(calcularRota(null,address),e=>e.status === 409);
    await assert.rejects(calcularRota({latitude:91,longitude:0},address),e=>e.status === 409);
    await assert.rejects(calcularRota({latitude:-23.66,longitude:-46.55},address),e=>e.status === 503);
});
