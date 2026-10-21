"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element(...classNames) {
    const classes = new Set(classNames);
    const listeners = new Map();
    return {
        dataset: {},
        attributes: {},
        style: {},
        children: [],
        focusCount: 0,
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value)
        },
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(listener);
        },
        emit(type, event = {}) {
            for (const listener of listeners.get(type) || []) listener(event);
        },
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focusCount++; },
        contains(target) { return target === this || this.children.includes(target); },
        querySelectorAll: () => [],
        appendChild() {}
    };
}

function homePage() {
    const menu = element("menu");
    const menuToggle = element();
    const searchToggle = element();
    const close = element();
    const input = element();
    const form = element();
    const document = element();
    const menuLink = element();
    menu.children.push(menuLink);
    menu.querySelectorAll = () => [menuLink];
    const selectors = {
        ".menu-toggle": menuToggle,
        ".sidebar, .menu": menu,
        "[data-search-toggle]": searchToggle,
        "[data-search-close]": close,
        ".search-form": form
    };
    document.querySelector = selector => selectors[selector] || null;
    document.getElementById = id => ({ menu, search: input })[id] || null;
    document.createElement = () => element();
    document.body = element();
    const context = { document, innerWidth: 390, addEventListener() {} };
    context.window = context;
    for (const file of ["public/js/layout/menu.js", "public/js/pages/home/layout.js"]) {
        vm.runInNewContext(fs.readFileSync(file, "utf8"), context);
    }
    document.emit("DOMContentLoaded");
    return { menu, menuToggle, menuLink, searchToggle, close, input, form, document };
}

test("menu móvel fecha ao tocar fora ou escolher um link e Escape devolve o foco", () => {
    const page = homePage();
    page.menuToggle.emit("click");
    assert.equal(page.menuToggle.attributes["aria-label"], "Fechar menu");
    page.document.emit("click", { target: page.menu });
    assert.equal(page.menu.classList.contains("active"), true);
    page.document.emit("click", { target: page.menuToggle });
    assert.equal(page.menu.classList.contains("active"), true);
    page.document.emit("click", { target: element() });
    assert.equal(page.menu.classList.contains("active"), false);
    assert.equal(page.menuToggle.attributes["aria-expanded"], "false");
    assert.equal(page.menuToggle.attributes["aria-label"], "Abrir menu");
    assert.equal(page.menuToggle.focusCount, 0);

    page.menuToggle.emit("click");
    page.menuLink.emit("click");
    assert.equal(page.menu.classList.contains("active"), false);
    page.menuToggle.emit("click");
    let prevented = false;
    page.document.emit("keydown", { key: "Escape", preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(page.menu.classList.contains("active"), false);
    assert.equal(page.menuToggle.focusCount, 1);
});

test("pesquisa e menu móvel se alternam sem um painel encobrir o outro", () => {
    const page = homePage();
    page.menuToggle.emit("click");
    assert.equal(page.menu.classList.contains("active"), true);

    page.searchToggle.emit("click");
    assert.equal(page.menu.classList.contains("active"), false);
    assert.equal(page.menuToggle.attributes["aria-expanded"], "false");
    assert.equal(page.form.classList.contains("is-open"), true);
    assert.equal(page.input.focusCount, 1);

    page.menuToggle.emit("click");
    assert.equal(page.menu.classList.contains("active"), true);
    assert.equal(page.form.classList.contains("is-open"), false);
    assert.equal(page.searchToggle.attributes["aria-expanded"], "false");
    assert.equal(page.searchToggle.focusCount, 0, "Abrir menu não deve enviar o foco à lupa");
});

test("Escape e botão fechar devolvem o foco à lupa", () => {
    const page = homePage();
    page.searchToggle.emit("click");
    let prevented = false;
    page.form.emit("keydown", { key: "Escape", preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(page.form.classList.contains("is-open"), false);
    assert.equal(page.searchToggle.focusCount, 1);

    page.searchToggle.emit("click");
    page.close.emit("click");
    assert.equal(page.form.classList.contains("is-open"), false);
    assert.equal(page.searchToggle.focusCount, 2);
});

test("enviar busca fecha o campo sem devolver foco e scroll ao cabeçalho", () => {
    const page = homePage();
    page.searchToggle.emit("click");
    page.form.emit("submit");
    assert.equal(page.form.classList.contains("is-open"), false);
    assert.equal(page.searchToggle.attributes["aria-expanded"], "false");
    assert.equal(page.searchToggle.focusCount, 0);
});
