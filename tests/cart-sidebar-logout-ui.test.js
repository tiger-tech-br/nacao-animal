"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/layout/cart-sidebar.js", "utf8");

function target() {
    const listeners = new Map();
    return {
        addEventListener(type, callback) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(callback);
        },
        emit(type, values = {}) {
            const event = {
                type, target: this, defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; },
                ...values
            };
            for (const callback of listeners.get(type) || []) callback(event);
            return event;
        },
        dispatchEvent(event) { this.emit(event.type, event); return true; }
    };
}

function page({ frameDocument = "available", embedded = false } = {}) {
    const order = [];
    const navigations = [];
    const children = [];
    const classes = new Set();
    let headerUpdates = 0;
    const frameEvents = [];
    const button = Object.assign(target(), { disabled: false });
    const frame = { contentWindow: {}, currentSource: "" };
    const childDocument = {
        dispatchEvent(event) { frameEvents.push(event); order.push("child-logout"); return true; }
    };
    Object.defineProperty(frame, "contentDocument", {
        get() {
            if (frameDocument === "inaccessible") throw new Error("Cross-origin document");
            return frameDocument === "missing" ? null : childDocument;
        }
    });
    Object.defineProperty(frame, "src", {
        get() { return this.currentSource; },
        set(value) {
            this.currentSource = value;
            navigations.push(value);
            order.push(value);
        }
    });
    const dialog = Object.assign(target(), {
        open: false, closeCount: 0, showCount: 0,
        setAttribute() {},
        querySelector: selector => selector === "iframe" ? frame : selector === "button" ? button : null,
        showModal() { this.open = true; ++this.showCount; },
        close() { ++this.closeCount; this.open = false; order.push("close"); this.emit("close"); },
        getBoundingClientRect: () => ({ left: 10, right: 300 })
    });
    const document = Object.assign(target(), {
        body: { append(element) { children.push(element); } },
        documentElement: {
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name)
            }
        },
        createElement(tag) { assert.equal(tag, "dialog"); return dialog; }
    });
    const window = Object.assign(target(), {
        PetFlowPublicHeader: { update() { ++headerUpdates; } }
    });
    window.parent = embedded ? {} : window;
    const origin = "https://nacao.example.invalid";
    const context = {
        window, document, location: { origin },
        CustomEvent: class CustomEvent {
            constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
        }
    };
    vm.runInNewContext(source, context);
    return {
        window, document, dialog, frame, button, children, classes, order, navigations, frameEvents,
        headerUpdates: () => headerUpdates,
        logout: detail => document.emit("petflow:customer-logout", { detail }),
        message(type, values = {}) {
            window.emit("message", { origin, source: frame.contentWindow, data: { type, ...values } });
        }
    };
}

test("logout antes de abrir a sacola não cria diálogo nem iframe", () => {
    const h = page();
    h.logout();
    assert.equal(h.children.length, 0);
    assert.equal(h.dialog.closeCount, 0);
    assert.deepEqual(h.navigations, []);
    h.window.PetFlowCart.open();
    assert.equal(h.dialog.open, true);
    assert.equal(h.frame.src, "/sacola?sidebar=1");
    assert.equal(h.children.length, 1);
});

test("logout com sacola fechada descarta o documento e reabre uma navegação nova", () => {
    const h = page();
    h.window.PetFlowCart.open();
    h.window.PetFlowCart.close();
    const closes = h.dialog.closeCount;
    const detail = { reason: "customer-logout" };
    h.logout(detail);
    assert.equal(h.frameEvents.length, 1);
    assert.equal(h.frameEvents[0].type, "petflow:customer-logout");
    assert.equal(h.frameEvents[0].detail, detail);
    assert.equal(h.frame.src, "about:blank");
    assert.equal(h.dialog.closeCount, closes, "Não chama close novamente em diálogo fechado");
    assert.equal(h.classes.has("cart-sidebar-open"), false);
    assert.equal(h.button.disabled, false);
    h.window.PetFlowCart.open();
    assert.equal(h.dialog.open, true);
    assert.equal(h.frame.src, "/sacola?sidebar=1");
    assert.deepEqual(h.navigations, ["/sacola?sidebar=1", "about:blank", "/sacola?sidebar=1"]);
    assert.equal(h.children.length, 1, "Reutiliza o contêiner sem preservar o documento anterior");
});

test("logout fecha uma sacola ocupada, encaminha limpeza antes de descartar e libera fechar", () => {
    const h = page();
    h.window.PetFlowCart.open();
    h.message("petflow:cart-busy", { busy: true });
    assert.equal(h.button.disabled, true);
    h.order.length = 0;
    h.logout();
    assert.deepEqual(h.order, ["child-logout", "about:blank", "close"]);
    assert.equal(h.dialog.open, false);
    assert.equal(h.dialog.closeCount, 1);
    assert.equal(h.button.disabled, false);
    assert.equal(h.classes.has("cart-sidebar-open"), false);
    h.window.PetFlowCart.open();
    h.window.PetFlowCart.close();
    assert.equal(h.dialog.open, false, "O busy da sessão encerrada não bloqueia a nova abertura");
    assert.equal(h.dialog.closeCount, 2);
});

test("mensagem antiga após logout não reativa busy nem ações do iframe fechado", () => {
    const h = page();
    h.window.PetFlowCart.open();
    h.logout();
    const updates = h.headerUpdates();
    h.message("petflow:cart-busy", { busy: true });
    h.message("petflow:cart-changed");
    h.message("petflow:close-cart");
    assert.equal(h.button.disabled, false);
    assert.equal(h.dialog.closeCount, 1);
    assert.equal(h.headerUpdates(), updates);
    h.window.PetFlowCart.open();
    h.window.PetFlowCart.close();
    assert.equal(h.dialog.open, false);
});

test("fluxo normal mantém bloqueio de fechar e Escape enquanto a sacola está ocupada", () => {
    const h = page();
    h.window.PetFlowCart.open();
    h.message("petflow:cart-busy", { busy: true });
    h.window.PetFlowCart.close();
    h.button.emit("click");
    assert.equal(h.dialog.open, true);
    assert.equal(h.dialog.closeCount, 0);
    assert.equal(h.dialog.emit("cancel").defaultPrevented, true);
    h.message("petflow:cart-busy", { busy: false });
    assert.equal(h.button.disabled, false);
    assert.equal(h.dialog.emit("cancel").defaultPrevented, false);
    h.message("petflow:cart-changed");
    assert.equal(h.headerUpdates(), 1);
    h.message("petflow:close-cart");
    assert.equal(h.dialog.open, false);
    assert.equal(h.headerUpdates(), 2);
});

test("origem ou janela diferentes continuam sem autorização para alterar a sacola", () => {
    const h = page();
    h.window.PetFlowCart.open();
    h.window.emit("message", {
        origin: "https://other.example.invalid", source: h.frame.contentWindow,
        data: { type: "petflow:cart-busy", busy: true }
    });
    h.window.emit("message", {
        origin: "https://nacao.example.invalid", source: {},
        data: { type: "petflow:cart-busy", busy: true }
    });
    assert.equal(h.button.disabled, false);
    h.window.PetFlowCart.close();
    assert.equal(h.dialog.open, false);
});

for (const frameDocument of ["missing", "inaccessible"]) {
    test(`documento interno ${frameDocument} não impede descarte e fechamento no logout`, () => {
        const h = page({ frameDocument });
        h.window.PetFlowCart.open();
        h.message("petflow:cart-busy", { busy: true });
        assert.doesNotThrow(() => h.logout());
        assert.equal(h.frame.src, "about:blank");
        assert.equal(h.dialog.open, false);
        assert.equal(h.button.disabled, false);
        assert.equal(h.classes.has("cart-sidebar-open"), false);
    });
}

test("o documento da sacola embutida não cria outro controlador lateral", () => {
    const h = page({ embedded: true });
    h.logout();
    assert.equal(h.window.PetFlowCart, undefined);
    assert.equal(h.children.length, 0);
});
