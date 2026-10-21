"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "admin/pages/clientes/cadastrar.html"), "utf8");
const inline = [...page.matchAll(/<script\s*>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function element() {
    const classes = new Set();
    const events = new Map();
    return {
        value: "",
        validationMessage: "",
        attributes: {},
        classList: {
            add(value) { classes.add(value); },
            remove(value) { classes.delete(value); },
            contains(value) { return classes.has(value); },
            toggle(value, force) {
                const add = force === undefined ? !classes.has(value) : force;
                if (add) classes.add(value);
                else classes.delete(value);
                return add;
            }
        },
        setCustomValidity(message) { this.validationMessage = message; },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, callback) {
            const callbacks = events.get(name) || [];
            callbacks.push(callback);
            events.set(name, callbacks);
        },
        async dispatch(name, event = {}) {
            await Promise.all((events.get(name) || []).map(callback => callback(event)));
        }
    };
}

function storage(values) {
    const items = new Map(Object.entries(values));
    return {
        getItem(key) { return items.get(key) ?? null; },
        setItem(key, value) { items.set(key, String(value)); },
        removeItem(key) { items.delete(key); },
        clear() { items.clear(); }
    };
}

async function loadPage(fetch) {
    const body = element();
    const sidebar = element();
    const toggle = element();
    const logoutLink = element();
    const windowEvents = element();
    const documentEvents = element();
    const inputs = Object.fromEntries([
        "nome", "cpf", "email", "celularWhatsapp", "telefone", "cep", "logradouro",
        "numero", "complemento", "bairro", "cidade", "estado", "observacoes"
    ].map(name => [name, element()]));
    const requiredNames = [...page.matchAll(/<input\b([^>]+)>/g)]
        .filter(([, attributes]) => /\brequired\b/.test(attributes))
        .map(([, attributes]) => attributes.match(/\bname="([^"]+)"/)?.[1])
        .filter(Boolean);
    const form = Object.assign(element(), {
        elements: inputs,
        resetCount: 0,
        checkValidity() {
            return requiredNames.every(name => inputs[name]?.value.trim()) &&
                Object.values(inputs).every(input => !input.validationMessage);
        },
        reportValidity() { this.validityReported = true; return this.checkValidity(); },
        reset() {
            this.resetCount++;
            Object.values(inputs).forEach(input => { input.value = ""; });
        }
    });
    const elements = { ...inputs, clientCreateForm: form, statusLine: element() };
    let overlay;
    body.appendChild = child => { overlay = child; };

    const context = {
        console: { error() {} },
        sessionStorage: storage({
            token: "staff-token",
            user: JSON.stringify({ nome: "Equipe" }),
            customerToken: "customer-token"
        }),
        localStorage: storage({
            token: "legacy-staff-token",
            user: JSON.stringify({ nome: "Equipe antiga" }),
            customerUser: JSON.stringify({ nome: "Cliente" })
        }),
        FormData: class {
            constructor(target) { this.target = target; }
            entries() {
                return Object.entries(this.target.elements)
                    .map(([name, input]) => [name, input.value])[Symbol.iterator]();
            }
        },
        fetch,
        innerWidth: 900,
        location: { href: "/admin/pages/clientes/cadastrar.html" },
        addEventListener: windowEvents.addEventListener,
        document: {
            body,
            getElementById(id) { return elements[id]; },
            querySelector(selector) {
                return {
                    ".sidebar": sidebar,
                    ".admin-menu-toggle": toggle,
                    ".admin-menu-overlay": overlay,
                    'a[href="/admin/index.html"]': logoutLink
                }[selector] || null;
            },
            createElement() { return element(); },
            addEventListener: documentEvents.addEventListener
        }
    };
    context.window = context;
    vm.createContext(context);

    for (const match of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        const src = match[1].match(/\bsrc="([^"]+)"/);
        const source = src
            ? fs.readFileSync(path.join(root, "public", src[1].split("?")[0]), "utf8")
            : match[2];
        vm.runInContext(source, context);
    }
    await documentEvents.dispatch("DOMContentLoaded");
    return { context, body, sidebar, toggle, logoutLink, overlay, windowEvents, form, inputs, status: elements.statusLine };
}

function fillCustomer(ui, fixedPhone = "") {
    const values = {
        nome: "João da Silva", cpf: "529.982.247-25", email: "cliente@example.invalid",
        celularWhatsapp: "(11) 99999-9999", telefone: fixedPhone,
        cep: "09060-820", logradouro: "Rua de Teste", numero: "123", complemento: "Casa 2",
        bairro: "Centro", cidade: "Santo André", estado: "sp", observacoes: "Entrega à tarde"
    };
    for (const [name, value] of Object.entries(values)) ui.inputs[name].value = value;
    return values;
}

test("scripts inline do cadastro de clientes têm sintaxe válida", () => {
    assert.ok(inline.length > 0);
    for (const source of inline) new vm.Script(source);
});

test("cadastro exige CPF e e-mail antes de enviar à API", async () => {
    for (const name of ["cpf", "email"]) {
        const attributes = [...page.matchAll(/<input\b([^>]+)>/g)]
            .find(([, value]) => value.includes(`name="${name}"`))?.[1] || "";
        assert.match(attributes, /\brequired\b/, name);
        let requests = 0;
        const ui = await loadPage(async () => { requests++; throw new Error("Requisição inesperada"); });
        fillCustomer(ui);
        ui.inputs[name].value = "";
        await ui.form.dispatch("submit", { preventDefault() {} });
        assert.equal(requests, 0, `${name} vazio não deve chegar à API`);
        assert.equal(ui.form.validityReported, true);
        assert.equal(ui.form.resetCount, 0);
        assert.match(ui.status.textContent, /Revise os campos/);
    }
});

for (const fixedPhone of ["", "(11) 3333-4444"]) {
    test(`cadastro envia celular${fixedPhone ? " e fixo em campos distintos" : " como telefone quando não há fixo"}`, async () => {
        const requests = [];
        const ui = await loadPage(async (url, options) => {
            requests.push({ url, options });
            return { ok: true, status: 201, json: async () => ({ success: true }) };
        });
        fillCustomer(ui, fixedPhone);
        let prevented = false;
        await ui.form.dispatch("submit", { preventDefault() { prevented = true; } });

        assert.equal(prevented, true);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].url, "/api/clientes");
        assert.equal(requests[0].options.method, "POST");
        assert.equal(requests[0].options.headers.Authorization, "Bearer staff-token");
        const payload = JSON.parse(requests[0].options.body);
        assert.equal(payload.whatsapp, "11999999999");
        assert.equal(payload.telefone, fixedPhone ? "1133334444" : "11999999999");
        assert.equal(Object.hasOwn(payload, "celularWhatsapp"), false);
        assert.equal(payload.cpf, "529.982.247-25");
        assert.equal(payload.email, "cliente@example.invalid");
        assert.equal(payload.estado, "SP");
        assert.equal(ui.form.resetCount, 1);
        assert.equal(ui.inputs.nome.value, "");
        assert.match(ui.status.textContent, /Cliente salvo com sucesso/);
    });
}

test("falha da API preserva os campos do cliente para corrigir ou tentar novamente", async () => {
    const ui = await loadPage(async () => ({
        ok: false, status: 409,
        json: async () => ({ message: "Esse CPF já está cadastrado." })
    }));
    const values = fillCustomer(ui, "(11) 3333-4444");
    await ui.form.dispatch("submit", { preventDefault() {} });
    assert.equal(ui.form.resetCount, 0);
    assert.match(ui.status.textContent, /Esse CPF já está cadastrado/);
    assert.deepEqual(Object.fromEntries(Object.entries(ui.inputs).map(([name, input]) => [name, input.value])), values);
});

test("menu do cadastro libera a rolagem ao voltar para desktop", async () => {
    const ui = await loadPage(() => { throw new Error("Requisição inesperada"); });
    await ui.toggle.dispatch("click");
    assert.equal(ui.sidebar.classList.contains("active"), true);
    assert.equal(ui.overlay.classList.contains("active"), true);
    assert.equal(ui.body.classList.contains("admin-menu-open"), true);
    assert.equal(ui.toggle.attributes["aria-expanded"], "true");

    ui.context.innerWidth = 1024;
    await ui.windowEvents.dispatch("resize");
    assert.equal(ui.body.classList.contains("admin-menu-open"), true);

    ui.context.innerWidth = 1025;
    await ui.windowEvents.dispatch("resize");
    assert.equal(ui.sidebar.classList.contains("active"), false);
    assert.equal(ui.overlay.classList.contains("active"), false);
    assert.equal(ui.body.classList.contains("admin-menu-open"), false);
    assert.equal(ui.toggle.attributes["aria-expanded"], "false");

    ui.context.innerWidth = 600;
    await ui.toggle.dispatch("click");
    assert.equal(ui.body.classList.contains("admin-menu-open"), true);
    await ui.overlay.dispatch("click");
    assert.equal(ui.body.classList.contains("admin-menu-open"), false);
});

test("Sair aguarda o serviço de logout e remove somente a sessão da equipe", async () => {
    const requests = [];
    let finishLogout;
    const ui = await loadPage((url, options) => {
        requests.push({ url, options });
        return new Promise(resolve => { finishLogout = resolve; });
    });
    let prevented = false;
    const pending = ui.logoutLink.dispatch("click", { preventDefault() { prevented = true; } });

    assert.equal(prevented, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/auth/logout");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.headers.Authorization, "Bearer staff-token");
    assert.equal(ui.context.sessionStorage.getItem("token"), "staff-token");
    assert.equal(ui.context.location.href, "/admin/pages/clientes/cadastrar.html");

    finishLogout({ ok: true, status: 200, json: async () => ({ success: true }) });
    await pending;
    for (const store of [ui.context.sessionStorage, ui.context.localStorage]) {
        assert.equal(store.getItem("token"), null);
        assert.equal(store.getItem("user"), null);
    }
    assert.equal(ui.context.sessionStorage.getItem("customerToken"), "customer-token");
    assert.equal(ui.context.localStorage.getItem("customerUser"), JSON.stringify({ nome: "Cliente" }));
    assert.equal(ui.context.location.href, "/admin/index.html");
});

test("Sair remove o acesso local também quando o serviço está indisponível", async () => {
    let requestCount = 0;
    const ui = await loadPage(async () => {
        requestCount++;
        throw new Error("Servidor indisponível");
    });
    await ui.logoutLink.dispatch("click", { preventDefault() {} });

    assert.equal(requestCount, 1);
    for (const store of [ui.context.sessionStorage, ui.context.localStorage]) {
        assert.equal(store.getItem("token"), null);
        assert.equal(store.getItem("user"), null);
    }
    assert.equal(ui.context.sessionStorage.getItem("customerToken"), "customer-token");
    assert.equal(ui.context.location.href, "/admin/index.html");
});
