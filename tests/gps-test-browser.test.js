"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs");
const source = fs.readFileSync("public/js/pages/delivery/gps-test.js", "utf8");
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
function element() {
    return { hidden: false, disabled: false, textContent: "", events: {}, classList: { toggle() {} },
        addEventListener(name, fn) { this.events[name] = fn; } };
}
function harness({ token = "admin-session", role = "ADMIN", routeRequest } = {}) {
    const elements = Object.fromEntries(["gpsStatus", "startGps", "stopGps", "refreshRoute", "routeStatus", "mapStatus", "testLogin", "destinationAddress", "originAddress"].map(id => [id, element()]));
    const calls = [], watches = [], cleared = [], updates = [], navigation = [], documentEvents = {}, events = {}, timers = new Map();
    let mapOptions, nextTimer = 0, clock = Date.now();
    class FakeDate extends Date { static now() { return clock; } }
    const context = { Date: FakeDate, AbortController, AbortSignal,
        sessionStorage: { getItem(key) { assert.equal(key, "token"); return token; }, setItem() { assert.fail("Não deve gravar posição no navegador"); } },
        document: { hidden: false, getElementById(id) { assert.ok(elements[id], id); return elements[id]; }, addEventListener(name, fn) { documentEvents[name] = fn; } },
        navigator: { geolocation: { watchPosition(success, error, options) { watches.push({ success, error, options }); return watches.length; }, clearWatch(id) { cleared.push(id); } } },
        isSecureContext: true,
        addEventListener(name, fn) { events[name] = fn; },
        setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
        PetFlowDeliveryMap(options) { mapOptions = options; return { update(data) { updates.push(JSON.parse(JSON.stringify(data))); }, hide() { navigation.push("hide"); } }; },
        PetFlowDeliveryNavigation() { return { start() { navigation.push("start"); }, update(data) { navigation.push({ update: JSON.parse(JSON.stringify(data)) }); }, stop() { navigation.push("stop"); }, pause() { navigation.push("pause"); } }; },
        fetch: async (url, options) => {
            calls.push({ url, options, localUpdates: updates.length });
            if (url === "/api/auth/me") return { ok: true, json: async () => ({ data: { perfil: role } }) };
            assert.equal(url, "/api/gps-diagnostico/rota");
            return routeRequest ? routeRequest(url, options) : { ok: true, json: async () => ({ data: { tipoOrigem: "GPS_ENTREGADOR", polyline: "route", destino: { latitude: -23.6, longitude: -46.5 } } }) };
        }
    };
    context.window = context; vm.runInNewContext(source, context);
    const fix = (index = watches.length - 1, extras = {}) => watches[index].success({ timestamp: clock, coords: { latitude: -23.66, longitude: -46.55, accuracy: 8, heading: 90, speed: 2, ...extras } });
    return { context, elements, calls, watches, cleared, updates, navigation, documentEvents, events, timers, fix,
        notice(notice) { mapOptions.onStatus(notice); }, advance(ms) { clock += ms; } };
}
test("teste físico exige sessão administrativa e clique antes do GPS", async () => {
    const h = harness(); await settle();
    assert.equal(h.watches.length, 0); assert.equal(h.calls.length, 1);
    assert.equal(h.elements.startGps.disabled, false);
    await h.elements.startGps.events.click(); assert.equal(h.watches.length, 1);
    assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 0);
    h.fix(); await settle();
    const route = h.calls.find(c => c.url.includes("diagnostico"));
    assert.ok(route.localUpdates > 0, "GPS renderizado antes da chamada de rede");
    assert.deepEqual(Object.keys(JSON.parse(route.options.body)).sort(), ["latitude", "longitude", "precisao", "timestamp"]);
    assert.equal(h.updates.at(-1).rota.polyline, "route");
    assert.match(h.elements.gpsStatus.textContent, /GPS obtido.*Precisão: 8 m.*Rota calculada/);
    assert.doesNotMatch(h.elements.gpsStatus.textContent, /-23|-46/);
});
test("sem administrador ou perfil sem permissão não solicita GPS", async () => {
    const missing = harness({ token: "" }); await settle(); await missing.elements.startGps.events.click();
    assert.equal(missing.watches.length, 0); assert.equal(missing.calls.length, 0); assert.equal(missing.elements.testLogin.hidden, false);
    const denied = harness({ role: "VENDEDOR" }); await settle(); await denied.elements.startGps.events.click();
    assert.equal(denied.watches.length, 0); assert.equal(denied.elements.testLogin.hidden, false);
});
test("permissão negada encerra watch e permite tentar novamente", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click();
    h.watches[0].error({ code: 1 });
    assert.deepEqual(h.cleared, [1]); assert.equal(h.elements.startGps.disabled, false);
    assert.match(h.elements.gpsStatus.textContent, /Localização negada/);
    assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 0);
});
test("GPS continua local enquanto rede está lenta e rota inicial só é solicitada uma vez", async () => {
    let finish;
    const h = harness({ routeRequest: () => new Promise(resolve => { finish = resolve; }) });
    await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    h.fix(0, { latitude: -23.661 }); h.fix(0, { latitude: -23.662 }); await settle();
    assert.equal(h.updates.at(-1).latitude, -23.662); assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 1);
    finish({ ok: true, json: async () => ({ data: { polyline: "slow-route" } }) }); await settle();
    assert.equal(h.updates.at(-1).latitude, -23.662); assert.equal(h.updates.at(-1).rota.polyline, "slow-route");
});
test("parar cancela rede e watch, limpa mapa e ignora respostas ou posições tardias", async () => {
    let finish;
    const h = harness({ routeRequest: () => new Promise(resolve => { finish = resolve; }) });
    await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    const request = h.calls.find(c => c.url.includes("diagnostico"));
    h.elements.stopGps.events.click(); const length = h.updates.length;
    assert.equal(request.options.signal.aborted, true); assert.deepEqual(h.cleared, [1]);
    finish({ ok: true, json: async () => ({ data: { polyline: "late" } }) }); h.fix(); await settle();
    assert.equal(h.updates.length, length); assert.equal(h.elements.routeStatus.hidden, true);
    assert.match(h.elements.gpsStatus.textContent, /Teste encerrado/);
});
test("mapa recusado informa erro sem parar GPS e falha da rota permite nova consulta manual após limite", async () => {
    const h = harness({ routeRequest: async () => ({ ok: false, status: 503, json: async () => ({ message: "Rota indisponível" }) }) });
    await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    h.notice({ state: "error", message: "Google recusou o mapa" });
    assert.equal(h.elements.mapStatus.hidden, false); assert.match(h.elements.mapStatus.textContent, /recusou/);
    assert.match(h.elements.routeStatus.textContent, /Rota indisponível/);
    h.fix(0, { latitude: -23.67 }); await settle(); assert.equal(h.updates.at(-1).latitude, -23.67);
    await h.elements.refreshRoute.events.click(); assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 1);
    assert.match(h.elements.routeStatus.textContent, /Aguarde/);
    h.advance(60001); h.fix(); await h.elements.refreshRoute.events.click();
    assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 2);
});
test("ocultar ou voltar do BFCache exige retomada explícita", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click();
    h.context.document.hidden = true; h.documentEvents.visibilitychange();
    assert.deepEqual(h.cleared, [1]); assert.equal(h.elements.startGps.textContent, "Retomar teste");
    h.context.document.hidden = false; h.events.pageshow({ persisted: true }); h.documentEvents.visibilitychange(); await settle();
    assert.equal(h.watches.length, 1); h.fix(0); assert.equal(h.updates.length, 0);
    await h.elements.startGps.events.click(); assert.equal(h.watches.length, 2);
    h.events.pagehide(); assert.deepEqual(h.cleared, [1, 2]);
});
test("posição antiga ou imprecisa não provoca chamadas pagas de rota", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click();
    h.watches[0].success({ timestamp: Date.now() - 40000, coords: { latitude: -23, longitude: -46, accuracy: 10 } });
    assert.equal(h.updates.length, 0);
    h.fix(0, { accuracy: 180 }); await settle();
    assert.equal(h.updates.length, 1); assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 0);
    await h.elements.refreshRoute.events.click(); assert.match(h.elements.routeStatus.textContent, /precisão de até 100 m/);
});
