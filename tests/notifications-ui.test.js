"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const id = "11111111-1111-4111-8111-111111111111";
const order = "22222222-2222-4222-8222-222222222222";
const welcome = { id, titulo: "Bem-vindo à Nação Animal!", mensagem: "Sua conta está pronta.", tipo: "BOAS_VINDAS", lida: false, enviada_em: "2026-10-21T12:00:00Z" };
const response = data => ({ ok: true, json: async () => ({ success: true, data }) });
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };

function page({ token = "session-a", admin = false, iframe = false, fetcher = () => response([welcome]) } = {}) {
    let document;
    function element(tagName = "DIV") {
        const events = new Map(), names = new Set();
        const node = {
            tagName: tagName.toUpperCase(), children: [], parent: null, attributes: {}, dataset: {}, hidden: false, disabled: false,
            _text: "", _html: "", className: "",
            classList: { add: name => names.add(name), contains: name => names.has(name) },
            addEventListener(type, callback) { if (!events.has(type)) events.set(type, []); events.get(type).push(callback); },
            emit(type, event = {}) { for (const callback of events.get(type) || []) callback({ target: this, preventDefault() {}, ...event }); },
            setAttribute(name, value) { this.attributes[name] = value; },
            appendChild(child) { if (child.parent) child.remove(); child.parent = this; this.children.push(child); return child; },
            append(...children) { children.forEach(child => this.appendChild(child)); },
            before(sibling) { const parent = this.parent; sibling.parent = parent; parent.children.splice(parent.children.indexOf(this), 0, sibling); },
            remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
            replaceChildren(...children) { this.children.forEach(child => { child.parent = null; }); this.children = []; this.append(...children); },
            contains(target) { for (let current = target; current; current = current.parent) if (current === this) return true; return false; },
            focus() { document.activeElement = this; this.focused = true; },
            matches(selector) {
                if (selector.startsWith(".")) return names.has(selector.slice(1)) || this.className.split(" ").includes(selector.slice(1));
                if (selector.startsWith("#")) return this.id === selector.slice(1);
                const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
                if (attr) return Object.hasOwn(this.attributes, attr[1]) && (attr[2] === undefined || this.attributes[attr[1]] === attr[2]);
                return this.tagName.toLowerCase() === selector;
            },
            querySelector(selector) { for (const child of this.children) { if (child.matches(selector)) return child; const nested = child.querySelector(selector); if (nested) return nested; } return null; },
            closest(selector) { for (let current = this; current; current = current.parent) if (current.matches(selector)) return current; return null; }
        };
        Object.defineProperty(node, "textContent", { get() { return this._text; }, set(value) { this._text = String(value); } });
        Object.defineProperty(node, "innerHTML", {
            get() { return this._html; },
            set(value) {
                this._html = value;
                if (!value.includes("pf-notifications-list")) return;
                for (const attr of ["data-close", "data-read", "data-refresh"]) { const button = element("button"); button.attributes[attr] = ""; this.appendChild(button); }
                const status = element("p"); status.attributes.role = "status"; this.appendChild(status);
                const list = element("div"); list.className = "pf-notifications-list"; this.appendChild(list);
            }
        });
        return node;
    }
    document = element();
    document.body = element("body");
    document.readyState = "loading";
    document.hidden = false;
    document.activeElement = null;
    document.createElement = element;
    const menu = element("div"); menu.className = "notification-menu"; document.body.appendChild(menu);
    const bell = element("button"); bell.className = "customer-notification-button"; bell.id = "notificationButton"; menu.appendChild(bell);
    document.querySelector = selector => selector === ".customer-notification-button" || selector === "#notificationButton" ? bell : document.body.querySelector(selector);
    const storage = new Map(token ? [[admin ? "token" : "petflow_customer_token", token]] : []);
    const requests = [], intervals = [];
    let handler = fetcher;
    const context = {
        document, location: { pathname: admin ? "/admin/index.html" : "/" }, AbortSignal, console, Date,
        sessionStorage: { getItem: key => storage.get(key) || null },
        fetch(url, options) { requests.push({ url, options }); return Promise.resolve().then(() => handler(url, options)); },
        setInterval(callback, delay) { intervals.push({ callback, delay }); return intervals.length; }
    };
    context.window = context;
    context.parent = iframe ? {} : context;
    vm.runInNewContext(fs.readFileSync("public/js/layout/notifications.js", "utf8"), context);
    document.emit("DOMContentLoaded");
    return {
        context, document, bell, requests, intervals, storage, handler(fn) { handler = fn; },
        panel: () => document.body.querySelector("#pfNotificationsPanel"),
        badge: () => bell.querySelector(".pf-notifications-badge"),
        list: () => document.body.querySelector(".pf-notifications-list"),
        status: () => document.body.querySelector('[role="status"]')
    };
}

test("sino mostra boas-vindas não lida, polling fechado não marca leitura e abrir remove o contador após confirmação", async () => {
    const ui = page({ fetcher: (url, options) => options.method === "PATCH" ? response(null) : response([welcome]) });
    await settle();
    assert.equal(ui.badge().textContent, "1");
    assert.equal(ui.badge().hidden, false);
    assert.equal(ui.requests.filter(request => request.options.method === "PATCH").length, 0);
    assert.equal(ui.intervals.length, 1);
    assert.equal(ui.intervals[0].delay, 15000);
    ui.bell.emit("click");
    await settle();
    assert.equal(ui.panel().hidden, false);
    assert.equal(ui.bell.attributes["aria-expanded"], "true");
    assert.equal(ui.badge().hidden, true);
    const read = ui.requests.find(request => request.options.method === "PATCH");
    assert.equal(read.url, "/api/public/clientes/notificacoes/lidas");
    assert.deepEqual(JSON.parse(read.options.body), { ids: [id] });
    assert.equal(read.options.headers.Authorization, "Bearer session-a");
    ui.context.PetFlowNotifications.close();
    await ui.context.PetFlowNotifications.refresh();
    await settle();
    assert.equal(ui.badge().hidden, true, "GET atrasado não devolve aviso lido ao badge");
    assert.equal(ui.requests.filter(request => request.options.method === "PATCH").length, 1);
});

test("notificações exibem status e link de rastreamento, textos sem HTML, foco e Escape", async () => {
    const notice = { ...welcome, venda_id: order, status_pedido: "SAIU_PARA_ENTREGA", titulo: "<img src=x onerror=bad()>",
        mensagem: "Pedido saiu para entrega. Acompanhe o entregador e prepare-se para receber a entrega." };
    const ui = page({ fetcher: (url, options) => options.method === "PATCH" ? response(null) : response([notice]) });
    await settle();
    const card = ui.list().children[0];
    assert.equal(card.children[0].textContent, notice.titulo);
    assert.ok(card.children.some(child => child.textContent === "Saiu para entrega"));
    assert.equal(card.querySelector("a").href, "/acompanhar-entrega?pedido=" + order);
    assert.equal(card.querySelector("a").textContent, "Acompanhar pedido");
    assert.ok(card.children.some(child => child.textContent === "Pedido saiu para entrega. Acompanhe o status do pedido e prepare-se para receber a entrega."));
    ui.bell.emit("click"); await settle();
    assert.equal(ui.document.activeElement, ui.panel().querySelector("[data-close]"));
    ui.document.emit("keydown", { key: "Escape" });
    assert.equal(ui.panel().hidden, true);
    assert.equal(ui.document.activeElement, ui.bell);
});

test("troca de cliente e logout descartam GET antigo sem revelar avisos ou erros da sessão anterior", async () => {
    let release;
    const ui = page({ fetcher: () => new Promise(resolve => { release = resolve; }) });
    await settle();
    ui.storage.set("petflow_customer_token", "session-b");
    ui.handler(() => response([]));
    await ui.context.PetFlowNotifications.refresh();
    release(response([welcome])); await settle();
    assert.equal(ui.list().children.length, 0);
    assert.equal(ui.badge().hidden, true);
    assert.match(ui.status().textContent, /Nenhuma/);
    ui.storage.clear();
    await ui.context.PetFlowNotifications.refresh();
    assert.equal(ui.bell.hidden, true);
    assert.equal(ui.panel().hidden, true);
});

test("PATCH de leitura antigo não limpa contador da nova sessão", async () => {
    let finishRead;
    const ui = page({ fetcher: (url, options) => options.method === "PATCH" ? new Promise(resolve => { finishRead = resolve; }) : response([welcome]) });
    await settle(); ui.bell.emit("click"); await settle();
    ui.storage.set("petflow_customer_token", "session-b");
    ui.handler(() => response([{ ...welcome, id: "33333333-3333-4333-8333-333333333333" }]));
    await ui.context.PetFlowNotifications.refresh();
    finishRead(response(null)); await settle();
    assert.equal(ui.badge().hidden, false);
    assert.equal(ui.badge().textContent, "1");
    assert.equal(ui.panel().hidden, true);
    assert.equal(ui.requests.filter(request => request.options.method === "PATCH").length, 1);
});

test("falha de leitura conserva badge e permite tentar novamente; falha de consulta tem estado útil", async () => {
    let fail = true;
    const ui = page({ fetcher: (url, options) => options.method === "PATCH" ? { ok: !fail } : response([welcome]) });
    await settle(); ui.bell.emit("click"); await settle();
    assert.equal(ui.badge().hidden, false);
    assert.match(ui.status().textContent, /salvar a leitura/);
    fail = false;
    ui.panel().querySelector("[data-read]").emit("click"); await settle();
    assert.equal(ui.badge().hidden, true);
    ui.handler(() => Promise.reject(new Error("offline")));
    await ui.context.PetFlowNotifications.refresh();
    assert.match(ui.status().textContent, /Use Atualizar/);
});

test("visitante não consulta API, iframe não duplica sino e inicialização repetida não duplica polling", async () => {
    const visitor = page({ token: "" }); await settle();
    assert.equal(visitor.bell.hidden, true); assert.equal(visitor.requests.length, 0);
    const iframe = page({ iframe: true }); await settle();
    assert.equal(iframe.requests.length, 0); assert.equal(iframe.intervals.length, 0);
    const ui = page(); await settle();
    ui.document.emit("DOMContentLoaded"); await settle();
    assert.equal(ui.intervals.length, 1);
});

test("painel administrativo mantém endpoint e não marca automaticamente avisos com painel fechado", async () => {
    const ui = page({ admin: true }); await settle();
    assert.equal(ui.requests[0].url, "/api/dashboard/notificacoes");
    assert.equal(ui.requests[0].options.headers.Authorization, "Bearer session-a");
    assert.equal(ui.requests.length, 1);
    ui.bell.emit("click"); await settle();
    assert.equal(ui.requests.filter(request => request.options.method === "PATCH").length, 0, "Admin mantém leitura manual");
});
