"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function storage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

function customerHeader(kind) {
    const sessionStorage = storage();
    const localStorage = storage();
    const logouts = [];
    const requests = [];
    const notification = { hidden: true };

    function link(withAvatar = false) {
        const classes = new Set(["menu-link", "menu-login-link"]);
        const events = new Map();
        let label = withAvatar ? { textContent: "Entrar | Cadastrar" } : null;
        let avatar = withAvatar ? { tagName: "svg" } : null;
        let text = "Entrar";
        return {
            href: "/login", dataset: {}, attributes: {},
            classList: {
                contains: name => classes.has(name),
                add: name => classes.add(name),
                remove: name => classes.delete(name)
            },
            // Like the browser DOM, assigning textContent replaces child nodes.
            get textContent() { return label ? label.textContent : text; },
            set textContent(value) { text = value; label = null; avatar = null; },
            querySelector(selector) {
                if (selector === "[data-customer-label]") return label;
                if (selector === "svg") return avatar;
                return null;
            },
            setAttribute(name, value) { this.attributes[name] = value; },
            removeAttribute(name) { delete this.attributes[name]; delete this[name]; },
            insertAdjacentElement(position, child) {
                assert.equal(position, "afterend");
                child.account = this;
                logouts.push(child);
            },
            addEventListener(type, callback) { events.set(type, callback); },
            click() { events.get("click")?.({ preventDefault() {} }); },
            remove() { const index = logouts.indexOf(this); if (index !== -1) logouts.splice(index, 1); }
        };
    }

    const account = link(true);
    const legacy = link();
    const context = {
        console, sessionStorage, localStorage,
        location: { pathname: "/servicos/dog-walker-pet-sitter" },
        CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
        document: {
            addEventListener() {}, dispatchEvent() {},
            getElementById: () => null,
            createElement: () => link(),
            querySelector: selector => selector.endsWith(".customer-notification-button") ? notification : null,
            querySelectorAll(selector) {
                if (selector.includes("[data-public-logout]")) return [...logouts];
                if (selector.includes("a[href='/login']")) return [account, legacy];
                return [];
            }
        },
        fetch(url, options) {
            requests.push({ url, options });
            return Promise.resolve({ ok: true });
        }
    };
    context.window = context;
    const source = kind === "home" ? "public/js/pages/home/catalog.js" : "public/js/layout/public-header.js";
    vm.runInNewContext(fs.readFileSync(source, "utf8"), context);
    return {
        account, legacy, notification, logouts, requests, sessionStorage, localStorage,
        update: () => kind === "home" ? context.setupCustomerHeader() : context.PetFlowPublicHeader.update()
    };
}

for (const kind of ["home", "public"]) {
    test(`${kind}: avatar permanece ao entrar, atualizar e sair da conta`, () => {
        const page = customerHeader(kind);
        const label = page.account.querySelector("[data-customer-label]");
        const avatar = page.account.querySelector("svg");

        page.update();
        assert.equal(page.account.textContent, "Entrar | Cadastrar");
        assert.equal(page.account.href, "/login");
        assert.equal(page.legacy.textContent, "Entrar");
        assert.equal(page.notification.hidden, true);
        assert.equal(page.logouts.length, 0);

        page.sessionStorage.setItem("petflow_customer_token", "test-customer-token");
        page.sessionStorage.setItem("petflow_customer_user", JSON.stringify({ nome: "Marina Silva" }));
        page.update();
        assert.equal(page.account.textContent, "Marina");
        assert.equal(page.account.href, "/conta");
        assert.equal(page.account.title, "Marina Silva");
        assert.equal(page.account.attributes["aria-label"], "Abrir minha conta");
        assert.equal(page.account.classList.contains("is-authenticated"), true);
        assert.equal(page.legacy.textContent, "Marina");
        assert.equal(page.notification.hidden, false);
        assert.equal(page.account.querySelector("[data-customer-label]"), label);
        assert.equal(page.account.querySelector("svg"), avatar);

        page.update();
        assert.equal(page.logouts.filter(item => item.account === page.account).length, 1, "Atualizar não duplica Sair");
        page.logouts.find(item => item.account === page.account).click();
        assert.equal(page.requests.length, 1);
        assert.equal(page.requests[0].url, "/api/public/clientes/logout");
        assert.equal(page.requests[0].options.method, "POST");
        assert.equal(page.requests[0].options.headers.Authorization, "Bearer test-customer-token");
        assert.equal(page.sessionStorage.getItem("petflow_customer_token"), null);
        assert.equal(page.sessionStorage.getItem("petflow_customer_user"), null);
        assert.equal(page.account.href, "/login");
        assert.equal(page.account.textContent, "Entrar | Cadastrar");
        assert.equal(page.legacy.textContent, "Entrar");
        assert.equal(page.account.classList.contains("is-authenticated"), false);
        assert.equal(page.account.title, undefined);
        assert.equal(page.notification.hidden, true);
        assert.equal(page.logouts.length, 0);
        assert.equal(page.account.querySelector("[data-customer-label]"), label);
        assert.equal(page.account.querySelector("svg"), avatar);
    });

    test(`${kind}: cache inválido usa Cliente e preserva o avatar`, () => {
        const page = customerHeader(kind);
        const avatar = page.account.querySelector("svg");
        page.sessionStorage.setItem("petflow_customer_token", "test-customer-token");
        page.sessionStorage.setItem("petflow_customer_user", "invalid json");
        page.update();
        assert.equal(page.account.textContent, "Cliente");
        assert.equal(page.account.href, "/conta");
        assert.equal(page.account.querySelector("svg"), avatar);
    });
}
