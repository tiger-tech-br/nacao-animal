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
        removeItem: key => values.delete(key),
        snapshot: () => new Map(values)
    };
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function customerHeader(kind, logoutResponse = () => Promise.resolve({ ok: true })) {
    const sessionStorage = storage();
    const localStorage = storage();
    const logouts = [];
    const requests = [];
    const emittedEvents = [];
    const confirmationCalls = [];
    let pendingConfirmation;
    const notification = { hidden: true };

    function link(withAvatar = false) {
        const classes = new Set(["menu-link", "menu-login-link"]);
        const events = new Map();
        let label = withAvatar ? { textContent: "Entrar | Cadastrar" } : null;
        if (label) {
            Object.defineProperty(label, "innerHTML", {
                set() { assert.fail("A saudação deve usar texto, sem interpretar HTML"); }
            });
        }
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
            set innerHTML(value) { assert.fail("O nome não deve substituir o avatar ou interpretar HTML"); },
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
            click() { return events.get("click")?.({ preventDefault() {}, currentTarget: this, target: this }); },
            remove() { const index = logouts.indexOf(this); if (index !== -1) logouts.splice(index, 1); }
        };
    }

    const account = link(true);
    const legacy = link();
    const context = {
        console, sessionStorage, localStorage,
        location: { pathname: "/servicos/dog-walker-pet-sitter" },
        CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
        NacaoAnimalLogoutDialog: {
            confirm(trigger) {
                confirmationCalls.push(trigger);
                pendingConfirmation ||= deferred();
                return pendingConfirmation.promise;
            }
        },
        document: {
            addEventListener() {}, dispatchEvent(event) { emittedEvents.push(event.type); },
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
            assert.equal(url, "/api/public/clientes/logout", "O teste não executa outras APIs");
            requests.push({ url, options });
            return logoutResponse();
        }
    };
    context.window = context;
    const source = kind === "home" ? "public/js/pages/home/catalog.js" : "public/js/layout/public-header.js";
    vm.runInNewContext(fs.readFileSync(source, "utf8"), context);
    return {
        account, legacy, notification, logouts, requests, sessionStorage, localStorage,
        emittedEvents, confirmationCalls,
        answerConfirmation(value) {
            assert.ok(pendingConfirmation, "O diálogo precisa estar aberto");
            pendingConfirmation.resolve(value);
            pendingConfirmation = null;
        },
        update: () => kind === "home" ? context.setupCustomerHeader() : context.PetFlowPublicHeader.update()
    };
}

const customerKeys = [
    "petflow_customer_token", "petflow_customer_user", "petflow_public_cart",
    "petflow_public_favorites", "petflow_delivery_address", "petflow_cart_coupon"
];

function seedCustomer(page, { token = "test-customer-token", name = "Marina Silva" } = {}) {
    for (const store of [page.sessionStorage, page.localStorage]) {
        store.setItem("petflow_customer_token", token);
        store.setItem("petflow_customer_user", JSON.stringify({ nome: name }));
        store.setItem("petflow_public_cart", JSON.stringify({ produto_teste: 2 }));
        store.setItem("petflow_public_favorites", JSON.stringify(["produto_teste"]));
        store.setItem("petflow_delivery_address", JSON.stringify({ cep: "00000000" }));
        store.setItem("petflow_cart_coupon", JSON.stringify({ codigo: "TESTE" }));
        store.setItem("token", "staff-token");
        store.setItem("user", JSON.stringify({ nome: "Equipe de Teste", cargo: "ADMIN" }));
        store.setItem("theme", "dark");
        store.setItem("other_cart", "outro-contexto");
    }
}

function preservedKeys(store) {
    return new Map([...store.snapshot()].filter(([key]) => !customerKeys.includes(key)));
}

function assertCustomerCleared(page, preserved) {
    for (const [index, store] of [page.sessionStorage, page.localStorage].entries()) {
        for (const key of customerKeys) assert.equal(store.getItem(key), null, key);
        assert.deepEqual(store.snapshot(), preserved[index], "Mantém sessão administrativa e dados de outros contextos");
    }
}

for (const kind of ["home", "public"]) {
    test(`${kind}: avatar permanece ao entrar, atualizar e confirmar a saída da conta`, async () => {
        const page = customerHeader(kind);
        const label = page.account.querySelector("[data-customer-label]");
        const avatar = page.account.querySelector("svg");

        page.update();
        assert.equal(page.account.textContent, "Entrar | Cadastrar");
        assert.equal(page.account.href, "/login");
        assert.equal(page.legacy.textContent, "Entrar");
        assert.equal(page.notification.hidden, true);
        assert.equal(page.logouts.length, 0);

        seedCustomer(page);
        const preserved = [page.sessionStorage, page.localStorage].map(preservedKeys);
        page.update();
        assert.equal(page.account.textContent, "Olá, Marina!");
        assert.equal(page.account.href, "/conta");
        assert.equal(page.account.title, "Marina Silva");
        assert.equal(page.account.attributes["aria-label"], "Abrir minha conta");
        assert.equal(page.account.classList.contains("is-authenticated"), true);
        assert.equal(page.legacy.textContent, "Olá, Marina!");
        assert.equal(page.notification.hidden, false);
        assert.equal(page.account.querySelector("[data-customer-label]"), label);
        assert.equal(page.account.querySelector("svg"), avatar);

        page.update();
        assert.equal(page.logouts.filter(item => item.account === page.account).length, 1, "Atualizar não duplica Sair");
        const logout = page.logouts.find(item => item.account === page.account);
        assert.equal(logout.attributes["aria-haspopup"], "dialog");
        const leaving = logout.click();
        assert.deepEqual(page.confirmationCalls, [logout]);
        assert.equal(page.requests.length, 0, "Aguarda confirmação antes de revogar a sessão");
        assert.equal(page.sessionStorage.getItem("petflow_customer_token"), "test-customer-token");
        page.answerConfirmation(true);
        await leaving;
        assert.equal(page.requests.length, 1);
        assert.equal(page.requests[0].url, "/api/public/clientes/logout");
        assert.equal(page.requests[0].options.method, "POST");
        assert.equal(page.requests[0].options.headers.Authorization, "Bearer test-customer-token");
        assert.equal(page.requests[0].options.keepalive, true);
        assertCustomerCleared(page, preserved);
        assert.deepEqual(page.emittedEvents, ["petflow:customer-logout"]);
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
        assert.equal(page.account.textContent, "Olá, Cliente!");
        assert.equal(page.account.href, "/conta");
        assert.equal(page.account.querySelector("svg"), avatar);
    });

    for (const [name, firstName] of [["José da Silva", "José"], ["  Maria   de Souza  ", "Maria"]]) {
        test(`${kind}: saudação usa o primeiro nome de ${firstName} e preserva o avatar`, () => {
            const page = customerHeader(kind);
            const avatar = page.account.querySelector("svg");
            const label = page.account.querySelector("[data-customer-label]");
            seedCustomer(page, { name });
            page.update();
            assert.equal(page.account.textContent, `Olá, ${firstName}!`);
            assert.equal(page.legacy.textContent, `Olá, ${firstName}!`);
            assert.equal(page.account.title, name.trim());
            assert.equal(page.account.querySelector("svg"), avatar);
            assert.equal(page.account.querySelector("[data-customer-label]"), label);
        });
    }

    test(`${kind}: nome com marcação permanece texto sem substituir o avatar`, () => {
        const page = customerHeader(kind);
        const avatar = page.account.querySelector("svg");
        const label = page.account.querySelector("[data-customer-label]");
        const name = 'José<img/src=x/onerror="alert(1)">';
        seedCustomer(page, { name });
        page.update();
        assert.equal(page.account.textContent, `Olá, ${name}!`);
        assert.equal(page.legacy.textContent, `Olá, ${name}!`);
        assert.equal(page.account.title, name);
        assert.equal(page.account.querySelector("svg"), avatar);
        assert.equal(page.account.querySelector("[data-customer-label]"), label);
    });

    test(`${kind}: cancelar a saída mantém sessão, dados e cabeçalho`, async () => {
        const page = customerHeader(kind);
        seedCustomer(page);
        page.update();
        const before = [page.sessionStorage, page.localStorage].map(store => store.snapshot());
        const logout = page.logouts.find(item => item.account === page.account);
        const leaving = logout.click();
        assert.equal(page.requests.length, 0);
        page.answerConfirmation(false);
        await leaving;
        assert.deepEqual(page.sessionStorage.snapshot(), before[0]);
        assert.deepEqual(page.localStorage.snapshot(), before[1]);
        assert.equal(page.account.textContent, "Olá, Marina!");
        assert.equal(page.account.href, "/conta");
        assert.equal(page.notification.hidden, false);
        assert.equal(page.logouts.find(item => item.account === page.account), logout);
        assert.equal(page.requests.length, 0);
        assert.deepEqual(page.emittedEvents, []);
    });

    test(`${kind}: confirmar diálogo antigo não encerra uma nova sessão`, async () => {
        const page = customerHeader(kind);
        seedCustomer(page, { token: "primeira-conta", name: "José de Teste" });
        page.update();
        const leaving = page.logouts.find(item => item.account === page.account).click();
        seedCustomer(page, { token: "segunda-conta", name: "Maria de Teste" });
        page.update();
        const before = [page.sessionStorage, page.localStorage].map(store => store.snapshot());
        page.answerConfirmation(true);
        await leaving;
        assert.deepEqual(page.sessionStorage.snapshot(), before[0]);
        assert.deepEqual(page.localStorage.snapshot(), before[1]);
        assert.equal(page.account.textContent, "Olá, Maria!");
        assert.equal(page.account.href, "/conta");
        assert.equal(page.notification.hidden, false);
        assert.equal(page.requests.length, 0);
        assert.deepEqual(page.emittedEvents, []);
    });

    test(`${kind}: dois cliques enquanto o diálogo aguarda fazem somente um logout`, async () => {
        const page = customerHeader(kind);
        seedCustomer(page);
        page.update();
        const logout = page.logouts.find(item => item.account === page.account);
        const first = logout.click();
        const second = logout.click();
        assert.deepEqual(page.confirmationCalls, [logout, logout]);
        assert.equal(page.requests.length, 0);
        page.answerConfirmation(true);
        await Promise.all([first, second]);
        assert.equal(page.requests.length, 1);
        assert.deepEqual(page.emittedEvents, ["petflow:customer-logout"]);
        assert.equal(page.account.textContent, "Entrar | Cadastrar");
    });

    test(`${kind}: falha de rede após confirmar ainda limpa somente os dados locais do cliente`, async () => {
        const page = customerHeader(kind, () => Promise.reject(new Error("Rede indisponível")));
        seedCustomer(page);
        const preserved = [page.sessionStorage, page.localStorage].map(preservedKeys);
        page.update();
        const leaving = page.logouts.find(item => item.account === page.account).click();
        page.answerConfirmation(true);
        await leaving;
        assert.equal(page.requests.length, 1);
        assertCustomerCleared(page, preserved);
        assert.equal(page.account.href, "/login");
        assert.equal(page.account.textContent, "Entrar | Cadastrar");
        assert.equal(page.notification.hidden, true);
        assert.deepEqual(page.emittedEvents, ["petflow:customer-logout"]);
    });
}
