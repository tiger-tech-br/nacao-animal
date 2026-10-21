"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element(...names) {
    const classes = new Set(names);
    const events = new Map();
    return {
        dataset: {}, attributes: {}, value: "", hidden: false, focusCount: 0,
        classList: {
            contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name),
            toggle(name, value) { if (value ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
        },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        focus() { this.focusCount++; },
        addEventListener(type, callback) { if (!events.has(type)) events.set(type, []); events.get(type).push(callback); },
        emit(type, event = {}) { for (const callback of events.get(type) || []) callback({ preventDefault() {}, ...event }); },
        querySelectorAll: () => []
    };
}

function page({ storefront = true, category = false } = {}) {
    let inserted = 0;
    let markup = "";
    let requests = 0;
    const header = element();
    const menu = element("menu");
    const menuToggle = element();
    const toggle = element();
    const close = element();
    const input = element();
    const form = element();
    form.hidden = storefront;
    const categorySearch = element();
    const products = { scrollCount: 0, scrollIntoView() { this.scrollCount++; } };
    let inputEvents = 0;
    categorySearch.dispatchEvent = event => { if (event.type === "input") inputEvents++; };
    const children = { ".search-form": form, ".storefront-search-toggle": toggle, ".storefront-search-close": close, ".menu-toggle": menuToggle };
    header.querySelector = selector => children[selector] || null;
    const document = element();
    document.body = element(...(storefront ? ["storefront-page"] : []));
    document.body.insertAdjacentHTML = (position, html) => { inserted++; markup = html; };
    document.querySelector = selector => {
        if (!inserted) return null;
        return {
            ".public-header": header,
            ".storefront-header": storefront ? header : null,
            "[data-public-header-search]": form,
            ".public-header .menu-toggle": menuToggle
        }[selector] || null;
    };
    document.getElementById = id => ({
        menu, publicHeaderSearch: input, categorySearch: category ? categorySearch : null,
        categoryProducts: category ? products : null
    })[id] || null;
    const context = {
        document, URL, Event, console, innerWidth: 390,
        addEventListener() {},
        location: { href: "http://localhost:4600/produtos/1", origin: "http://localhost:4600", pathname: "/produtos/1" },
        sessionStorage: { getItem: () => null },
        async fetch() { requests++; return { ok: true, json: async () => ({ data: {} }) }; }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync("public/js/layout/public-header.js", "utf8"), context);
    return {
        context, header, menu, menuToggle, toggle, close, input, form, categorySearch, products,
        init: () => context.PetFlowPublicHeader.init(),
        markup: () => markup, inserted: () => inserted, requests: () => requests, inputEvents: () => inputEvents
    };
}

test("cabeçalho escolhe o novo menu sem Blog apenas para páginas migradas e evita injeção duplicada", async () => {
    const migrated = page();
    await migrated.init();
    assert.match(migrated.markup(), /class="header public-header storefront-header"/);
    assert.match(migrated.markup(), /href="\/sobre"/);
    assert.match(migrated.markup(), /href="\/contato"/);
    assert.match(migrated.markup(), /href="\/servicos\/dog-walker-pet-sitter" class="menu-link" data-public-nav="services"/);
    assert.match(migrated.markup(), /data-customer-label>Entrar \| Cadastrar<\/span>/);
    assert.doesNotMatch(migrated.markup(), />Blog<|href="[^\"]*blog/);
    assert.match(migrated.markup(), /href="\/\?favoritos=1#products"/);
    await migrated.init();
    assert.equal(migrated.inserted(), 1);
    assert.equal(migrated.requests(), 1);
    migrated.toggle.emit("click");
    assert.equal(migrated.form.hidden, false, "Reinicializar não duplica o evento da lupa");

    const legacy = page({ storefront: false });
    await legacy.init();
    assert.doesNotMatch(legacy.markup(), /public-header storefront-header/);
    assert.match(legacy.markup(), /data-public-nav="categories">Categorias/);
    assert.equal(legacy.form.hidden, false);
});

test("lupa e menu são exclusivos; Escape restaura foco e estado acessível", async () => {
    const ui = page();
    await ui.init();
    ui.menuToggle.emit("click");
    assert.equal(ui.menu.classList.contains("active"), true);
    assert.equal(ui.menuToggle.attributes["aria-expanded"], "true");
    ui.toggle.emit("click");
    assert.equal(ui.menu.classList.contains("active"), false);
    assert.equal(ui.menuToggle.attributes["aria-label"], "Abrir menu");
    assert.equal(ui.form.hidden, false);
    assert.equal(ui.input.focusCount, 1);
    ui.menuToggle.emit("click");
    assert.equal(ui.form.hidden, true);
    assert.equal(ui.menu.classList.contains("active"), true);
    ui.header.emit("keydown", { key: "Escape" });
    assert.equal(ui.menu.classList.contains("active"), false);
    assert.equal(ui.menuToggle.focusCount, 1);
    ui.toggle.emit("click");
    ui.header.emit("keydown", { key: "Escape" });
    assert.equal(ui.form.hidden, true);
    assert.equal(ui.toggle.attributes["aria-expanded"], "false");
    assert.equal(ui.toggle.focusCount, 1);
});

test("busca de produto usa URL canônica na página nova e preserva endereço antigo nas demais", async () => {
    for (const storefront of [true, false]) {
        const ui = page({ storefront });
        await ui.init();
        ui.input.value = " ração & pet ";
        ui.form.emit("submit");
        assert.equal(ui.context.location.href, storefront
            ? "/?busca=ra%C3%A7%C3%A3o%20%26%20pet#products"
            : "/#products?busca=ra%C3%A7%C3%A3o%20%26%20pet");
        if (storefront) assert.equal(ui.form.hidden, true);
    }
});

test("busca no cabeçalho da categoria filtra o catálogo local e fecha sem mover foco de volta ao topo", async () => {
    const ui = page({ category: true });
    await ui.init();
    ui.toggle.emit("click");
    ui.input.value = "coleira";
    ui.form.emit("submit");
    assert.equal(ui.categorySearch.value, "coleira");
    assert.equal(ui.inputEvents(), 1);
    assert.equal(ui.products.scrollCount, 1);
    assert.equal(ui.context.location.href, "http://localhost:4600/produtos/1");
    assert.equal(ui.form.hidden, true);
    assert.equal(ui.toggle.focusCount, 0);
});
