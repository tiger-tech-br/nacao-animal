"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const html = fs.readFileSync("views/delivery/driver.html", "utf8");
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const response = (data, status = 200, message) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ data, message }) });
const trip = { status: "SAIU_PARA_ENTREGA", endereco_entrega: { endereco: "Rua de teste", numero: "123", cidade: "Santo André", estado: "SP" } };
const receipt = { id: "pedido-teste", status: "ENTREGUE", entregueEm: "2026-10-25T18:00:00.000Z", changed: true, emailStatus: "sent" };

function harness({ responder, data = trip } = {}) {
    const elements = {}, documentEvents = {}, windowEvents = {}, calls = [];
    const document = { hidden: false, activeElement: null, getElementById: id => elements[id], addEventListener: (name, callback) => { documentEvents[name] = callback; } };
    for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const id = match[1];
        elements[id] = { id, hidden: /\bhidden\b/.test(match[0]), disabled: false, textContent: "", value: "", events: {},
            addEventListener(name, callback) { this.events[name] = callback; },
            removeAttribute(name) { delete this[name]; },
            focus() { document.activeElement = this; },
            contains(value) { return value === this || (id === "completeDeliveryDialog" && ["completionCancel", "completionConfirm", "completionDialogError"].includes(value?.id)); },
            set innerHTML(_) { assert.fail("A conclusão deve ser renderizada como texto, sem HTML do servidor"); }
        };
    }
    let currentData = data;
    const context = { document, location: { hash: "#" + "a".repeat(64) }, URL, URLSearchParams, Date, AbortSignal, AbortController,
        setInterval() {}, addEventListener: (name, callback) => { windowEvents[name] = callback; },
        confirm() { assert.fail("A confirmação deve usar o modal da página"); },
        navigator: { geolocation: { watchPosition() { assert.fail("Não detectar conclusão pelo GPS"); }, getCurrentPosition() { assert.fail("Não detectar conclusão pelo GPS"); } } },
        fetch: async (url, options) => { calls.push({ url, options }); return responder ? responder(url, options) : response(currentData); }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/location-share-link.js", "utf8"), context);
    vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/driver.js", "utf8"), context);
    return { context, elements, documentEvents, windowEvents, calls, data(value) { currentData = value; } };
}
const open = h => h.elements.completeDelivery.events.click();
const confirm = async h => { h.elements.completionConfirm.events.click(); await settle(); };
function key(h, key, shiftKey = false) {
    let prevented = false;
    h.elements.completeDeliveryDialog.events.keydown({ key, shiftKey, preventDefault() { prevented = true; } });
    return prevented;
}

test("página oferece conclusão explícita e mantém os links de navegação e compartilhamento", async () => {
    const h = harness(); await settle();
    assert.equal(h.elements.completeDeliverySection.hidden, false);
    assert.equal(h.elements.completeDelivery.disabled, false);
    assert.equal(h.elements.navigateGoogleMaps.hidden, false);
    assert.equal(h.elements.shareLocationSection.hidden, false);
    assert.equal(h.elements.completionSummary.hidden, true);
    assert.equal(h.calls.length, 1);
    assert.equal(new URL(h.elements.navigateGoogleMaps.href).searchParams.get("dir_action"), "navigate");
    h.context.document.hidden = true; h.documentEvents.visibilitychange();
    h.context.document.hidden = false; h.documentEvents.visibilitychange(); await settle();
    h.windowEvents.pagehide(); h.windowEvents.pageshow(); await settle();
    assert.ok(h.calls.every(call => call.url.endsWith("/viagem") && !call.options.method));
    assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="completeDeliveryDialogTitle" aria-describedby="completeDeliveryDialogDescription"/);
    assert.match(html, /não confirma automaticamente[^<]*chegou ao destino/);
});

test("modal contém foco e cancelar, Escape ou clicar no fundo não conclui o pedido", async () => {
    const h = harness(); await settle(); const e = h.elements;
    open(h);
    assert.equal(e.completeDeliveryDialog.hidden, false);
    assert.equal(e.driverContent.inert, true);
    assert.equal(h.context.document.activeElement, e.completionCancel);
    assert.equal(key(h, "Tab", true), true);
    assert.equal(h.context.document.activeElement, e.completionConfirm);
    assert.equal(key(h, "Tab"), true);
    assert.equal(h.context.document.activeElement, e.completionCancel);
    h.documentEvents.focusin({ target: e.reloadDelivery });
    assert.equal(h.context.document.activeElement, e.completionCancel);
    e.completionCancel.events.click();
    assert.equal(e.completeDeliveryDialog.hidden, true);
    assert.equal(e.driverContent.inert, false);
    assert.equal(h.context.document.activeElement, e.completeDelivery);
    open(h); assert.equal(key(h, "Escape"), true); assert.equal(e.completeDeliveryDialog.hidden, true);
    open(h); e.completeDeliveryDialog.events.click({ target: e.completionConfirm }); assert.equal(e.completeDeliveryDialog.hidden, false);
    e.completeDeliveryDialog.events.click({ target: e.completeDeliveryDialog }); assert.equal(e.completeDeliveryDialog.hidden, true);
    e.completionConfirm.events.click(); await settle();
    assert.equal(h.calls.length, 1);
    assert.equal(e.completionSummary.hidden, true);
});

test("confirmação faz um único POST e só mostra conclusão após resposta do servidor", async () => {
    let finish;
    const h = harness({ responder: url => url.endsWith("/viagem") ? response(trip) : new Promise(resolve => { finish = resolve; }) });
    await settle(); open(h); await confirm(h); await confirm(h);
    const e = h.elements, request = h.calls[1];
    assert.equal(h.calls.length, 2);
    assert.equal(request.url, "/api/public/entregas/concluir");
    assert.equal(request.options.method, "POST");
    assert.deepEqual(JSON.parse(request.options.body), { confirmar: true });
    assert.equal(request.options.headers.Authorization, "Bearer " + "a".repeat(64));
    assert.equal(request.options.cache, "no-store");
    assert.equal(e.completionSummary.hidden, true);
    assert.equal(e.completionConfirm.disabled, true);
    assert.equal(e.completionCancel.disabled, true);
    assert.equal(h.context.document.activeElement, e.completeDeliveryDialog);
    key(h, "Escape"); e.completionCancel.events.click(); e.completeDeliveryDialog.events.click({ target: e.completeDeliveryDialog });
    assert.equal(e.completeDeliveryDialog.hidden, false);
    finish(response(receipt)); await settle();
    assert.equal(e.completeDeliveryDialog.hidden, true);
    assert.equal(e.driverContent.inert, false);
    assert.equal(e.completionSummary.hidden, false);
    assert.equal(e.navigateGoogleMaps.hidden, true);
    assert.equal(e.navigateGoogleMaps.href, undefined);
    assert.equal(e.shareLocationSection.hidden, true);
    assert.equal(e.completeDeliverySection.hidden, true);
    assert.equal(e.reloadDelivery.hidden, true);
    assert.equal(e.destinationAddress.textContent, "");
    assert.equal(h.context.document.activeElement, e.completionHeading);
    assert.match(e.completionTime.textContent, /25\/10\/2026/);
    assert.match(e.completionNotice.textContent, /não encerra o compartilhamento/);
    assert.match(e.driverStatus.textContent, /status do pedido foi atualizado para Entregue/);
    h.context.document.hidden = true; h.documentEvents.visibilitychange();
    h.context.document.hidden = false; h.documentEvents.visibilitychange(); await settle();
    assert.equal(e.completionSummary.hidden, false);
    assert.equal(h.calls.length, 2);
});

for (const [emailStatus, expected] of [["failed", /e-mail não pôde ser enviado/], ["pending", /e-mail está em processamento/], ["unchanged", /Pare o compartilhamento/]]) {
    test(`conclusão já gravada é aceita com changed false e e-mail ${emailStatus}`, async () => {
        const h = harness({ responder: url => response(url.endsWith("/viagem") ? trip : { ...receipt, changed: false, emailStatus }) });
        await settle(); open(h); await confirm(h);
        assert.equal(h.elements.completionSummary.hidden, false);
        assert.match(h.elements.completionNotice.textContent, expected);
        assert.equal(h.elements.retryDeliveryEmail.hidden, emailStatus !== "failed");
    });
}

test("comprovante reaberto com falha de e-mail oferece retry sem reabrir entrega ou modal", async () => {
    let finish;
    const h = harness({ responder: url => url.endsWith("/viagem")
        ? response({ ...receipt, entregue_em: receipt.entregueEm, concluida_pelo_entregador: true, emailStatus: "failed" })
        : new Promise(resolve => { finish = resolve; }) });
    await settle();
    const e = h.elements;
    assert.equal(e.completionSummary.hidden, false);
    assert.equal(e.retryDeliveryEmail.hidden, false);
    e.retryDeliveryEmail.events.click(); e.retryDeliveryEmail.events.click(); await settle();
    assert.equal(h.calls.length, 2, "Bloqueia clique duplicado enquanto reenvia");
    assert.equal(h.calls[1].url, "/api/public/entregas/concluir");
    assert.equal(h.calls[1].options.method, "POST");
    assert.deepEqual(JSON.parse(h.calls[1].options.body), { confirmar: true });
    assert.equal(h.calls[1].options.headers.Authorization, "Bearer " + "a".repeat(64));
    assert.equal(e.retryDeliveryEmail.disabled, true);
    assert.equal(e.completeDeliveryDialog.hidden, true);
    assert.equal(e.completeDeliverySection.hidden, true);
    assert.equal(e.navigateGoogleMaps.href, undefined);
    finish(response({ ...receipt, changed: false, emailStatus: "sent" })); await settle();
    assert.equal(e.retryDeliveryEmail.hidden, true);
    assert.equal(e.completionSummary.hidden, false);
    assert.match(e.completionNotice.textContent, /e-mail foi enviado ao cliente/);
    assert.equal(h.context.document.activeElement, e.completionHeading);
});

test("falha de rede no reenvio mantém Entregue e permite repetir somente o aviso", async () => {
    let attempts = 0;
    const h = harness({ responder: url => url.endsWith("/viagem") ? response(trip)
        : ++attempts === 1 ? response({ ...receipt, emailStatus: "failed" })
            : attempts === 2 ? Promise.reject(new TypeError("Failed to fetch"))
                : response({ ...receipt, changed: false, emailStatus: "unchanged" }) });
    await settle(); open(h); await confirm(h);
    const e = h.elements;
    e.retryDeliveryEmail.events.click(); await settle();
    assert.equal(e.completionSummary.hidden, false);
    assert.equal(e.retryDeliveryEmail.hidden, false);
    assert.equal(e.retryDeliveryEmail.disabled, false);
    assert.equal(e.completeDeliverySection.hidden, true);
    assert.match(e.completionNotice.textContent, /continua registrada como Entregue/);
    assert.equal(h.context.document.activeElement, e.retryDeliveryEmail);
    e.retryDeliveryEmail.events.click(); await settle();
    assert.equal(attempts, 3);
    assert.equal(e.retryDeliveryEmail.hidden, true);
    assert.equal(e.completeDeliveryDialog.hidden, true);
    assert.equal(e.destinationAddress.textContent, "");
});

for (const emailStatus of ["sent", "unchanged", "pending", "not_applicable"]) test(`e-mail ${emailStatus} não oferece reenvio`, async () => {
    const h = harness({ data: { ...receipt, concluida_pelo_entregador: true, emailStatus } }); await settle();
    assert.equal(h.elements.retryDeliveryEmail.hidden, true);
    h.elements.retryDeliveryEmail.events.click(); await settle();
    assert.equal(h.calls.length, 1);
});

for (const [title, rejected] of [
    ["erro do servidor", () => response(null, 500, "Tente novamente em instantes.")],
    ["status diferente de ENTREGUE", () => response({ status: "SAIU_PARA_ENTREGA" })],
    ["corpo inválido", () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("JSON inválido"); } })],
    ["resposta de rede perdida", () => { throw new TypeError("Failed to fetch"); }]
]) test(`${title} não promete conclusão e permite repetir com segurança`, async () => {
    let attempts = 0;
    const h = harness({ responder: url => url.endsWith("/viagem") ? response(trip) : ++attempts === 1 ? rejected() : response({ ...receipt, changed: false }) });
    await settle(); open(h); await confirm(h);
    assert.equal(h.elements.completionSummary.hidden, true);
    assert.equal(h.elements.completeDeliveryDialog.hidden, false);
    assert.equal(h.elements.completionConfirm.disabled, false);
    assert.ok(h.elements.completionDialogError.textContent);
    assert.equal(h.context.document.activeElement, h.elements.completionConfirm);
    await confirm(h);
    assert.equal(attempts, 2);
    assert.equal(h.elements.completionSummary.hidden, false);
});

for (const code of [401, 403, 410]) test(`erro ${code} encerra controles e não mostra sucesso`, async () => {
    const h = harness({ responder: url => url.endsWith("/viagem") ? response(trip) : response(null, code, "Link encerrado. Consulte a loja.") });
    await settle(); open(h); await confirm(h);
    assert.equal(h.elements.completionSummary.hidden, true);
    assert.equal(h.elements.completeDeliveryDialog.hidden, true);
    assert.equal(h.elements.driverContent.inert, false);
    assert.equal(h.elements.completeDeliverySection.hidden, true);
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.equal(h.elements.shareLocationSection.hidden, true);
    assert.equal(h.elements.reloadDelivery.disabled, true);
    assert.equal(h.context.document.activeElement, h.elements.driverStatus);
    assert.match(h.elements.driverStatus.textContent, /Link encerrado/);
    open(h); await confirm(h); assert.equal(h.calls.length, 2);
});

test("erro terminal com corpo não JSON também fecha o modal e os controles", async () => {
    const h = harness({ responder: url => url.endsWith("/viagem") ? response(trip) : { ok: false, status: 410, json: async () => { throw new SyntaxError("HTML da infraestrutura"); } } });
    await settle(); open(h); await confirm(h);
    assert.equal(h.elements.completeDeliveryDialog.hidden, true);
    assert.equal(h.elements.reloadDelivery.disabled, true);
    assert.equal(h.elements.completionSummary.hidden, true);
});

for (const exit of ["visibilitychange", "pagehide"]) test(`${exit} descarta resposta tardia e retorno consulta comprovante sem endereço`, async () => {
    let finish, reads = 0;
    const h = harness({ responder: url => url.endsWith("/viagem") ? response(++reads === 1 ? trip : { ...receipt, entregue_em: receipt.entregueEm, concluida_pelo_entregador: true }) : new Promise(resolve => { finish = resolve; }) });
    await settle(); open(h); await confirm(h);
    const signal = h.calls[1].options.signal;
    if (exit === "visibilitychange") { h.context.document.hidden = true; h.documentEvents.visibilitychange(); }
    else h.windowEvents.pagehide();
    assert.equal(signal.aborted, true);
    assert.equal(h.elements.completeDeliveryDialog.hidden, true);
    assert.equal(h.elements.driverContent.inert, false);
    finish(response(receipt)); await settle();
    assert.equal(h.elements.completionSummary.hidden, true);
    h.context.document.hidden = false;
    if (exit === "visibilitychange") h.documentEvents.visibilitychange(); else h.windowEvents.pageshow();
    await settle();
    assert.equal(h.elements.completionSummary.hidden, false);
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.equal(h.calls.length, 3);
    assert.equal(h.calls.filter(call => call.options.method === "POST").length, 1);
});

test("link concluído pelo entregador abre comprovante sem expor o endereço", async () => {
    const h = harness({ data: { status: "ENTREGUE", entregue_em: receipt.entregueEm, concluida_pelo_entregador: true } }); await settle();
    assert.equal(h.elements.completionSummary.hidden, false);
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.equal(h.elements.destinationAddress.textContent, "");
    assert.equal(h.elements.completeDeliverySection.hidden, true);
    assert.equal(h.calls.length, 1);
});

test("status ENTREGUE sem comprovante do entregador não é anunciado como nova conclusão", async () => {
    const h = harness({ data: { status: "ENTREGUE" } }); await settle();
    assert.equal(h.elements.completionSummary.hidden, true);
    assert.equal(h.elements.completeDeliverySection.hidden, true);
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.match(h.elements.driverStatus.textContent, /não está em andamento/);
});
