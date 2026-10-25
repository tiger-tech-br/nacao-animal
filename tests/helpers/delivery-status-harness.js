"use strict";
const fs = require("node:fs"), vm = require("node:vm"), assert = require("node:assert/strict");
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const response = (data, status = 200, message) => ({ ok: status < 400, status, json: async () => ({ data, message }) });
const address = { endereco: "Rua de teste & referência", numero: "123", complemento: "Casa 2", bairro: "Bairro de teste", cidade: "Santo André", estado: "SP", cep: "09000000" };
function element() {
    return { hidden: true, disabled: false, textContent: "", events: {},
        addEventListener(name, callback) { this.events[name] = callback; },
        removeAttribute(name) { delete this[name]; },
        set innerHTML(_) { assert.fail("Dados do pedido devem ser escritos como texto"); }
    };
}
function harness(kind, { admin = false, hash = "#" + "a".repeat(64), responder, token = "session", data } = {}) {
    const ids = kind === "driver" ? ["driverStatus", "driverDetails", "destinationAddress", "navigateGoogleMaps", "reloadDelivery"]
        : ["trackingStatus", "trackingLogin", "trackingDetails", "trackingHeadline", "destinationAddress", "trackingUpdated", "refreshTracking", "trackingBack", "trackingTitle", "trackingDescription"];
    const elements = Object.fromEntries(ids.map(id => [id, element()])), calls = [], documentEvents = {}, events = {};
    let tick, delay, currentToken = token;
    let currentData = data || { status: "SAIU_PARA_ENTREGA", endereco_entrega: address };
    const context = { URL, URLSearchParams, AbortSignal, AbortController, Date,
        location: { hash, pathname: kind === "driver" ? "/entregador" : admin ? "/admin/acompanhar-entrega" : "/acompanhar-entrega", search: "?pedido=pedido-teste" },
        document: { hidden: false, getElementById: id => elements[id], addEventListener(name, callback) { documentEvents[name] = callback; } },
        addEventListener(name, callback) { events[name] = callback; },
        setInterval(callback, interval) { tick = callback; delay = interval; },
        sessionStorage: { getItem(key) { return key === (admin ? "token" : "petflow_customer_token") ? currentToken : null; } },
        navigator: { geolocation: { watchPosition() { assert.fail("Não deve capturar GPS"); }, getCurrentPosition() { assert.fail("Não deve capturar GPS"); } } },
        PetFlowDeliveryMap() { assert.fail("Não deve carregar mapa próprio"); },
        PetFlowDeliveryNavigation() { assert.fail("Não deve iniciar navegação própria"); },
        fetch: async (url, options) => { calls.push({ url, options }); return responder ? responder(url, options) : response(currentData); }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(`public/js/pages/delivery/${kind === "driver" ? "driver" : "tracking"}.js`, "utf8"), context);
    return { context, elements, calls, documentEvents, events, tick: () => tick(), delay: () => delay,
        token(value) { currentToken = value; }, data(value) { currentData = value; } };
}
module.exports = { harness, response, address, settle };
