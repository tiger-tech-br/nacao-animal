"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/pages/auth/public-auth.js", "utf8");
const response = (status, payload) => ({
    ok: status >= 200 && status < 300, status, json: async () => payload
});
const customerKeys = [
    "petflow_customer_token", "petflow_customer_user", "petflow_public_cart",
    "petflow_public_favorites", "petflow_delivery_address", "petflow_cart_coupon"
];

function element(extra = {}) {
    const classes = new Set();
    const listeners = new Map();
    return {
        value: "", textContent: "", dataset: {}, disabled: false, type: "text",
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle(name, force) {
                const include = force === undefined ? !classes.has(name) : force;
                if (include) classes.add(name);
                else classes.delete(name);
            }
        },
        addEventListener(name, callback) {
            const callbacks = listeners.get(name) || [];
            callbacks.push(callback);
            listeners.set(name, callbacks);
        },
        async dispatch(name, event = {}) {
            for (const callback of listeners.get(name) || []) {
                await callback({ preventDefault() {}, target: this, currentTarget: this, ...event });
            }
        },
        click() { return this.dispatch("click"); },
        focus() { this.focused = true; },
        ...extra
    };
}

function entryPage({ search = "", reset = false, fetch = () => assert.fail("API inesperada") } = {}) {
    const elements = new Map();
    const add = (id, extra) => {
        const input = element({ id, ...extra });
        elements.set(id, input);
        return input;
    };
    function form(id, fields) {
        const inputs = Object.entries(fields).map(([name, input]) => Object.assign(input, { name }));
        const target = add(id, {
            elements: Object.assign(inputs, fields), resets: 0,
            reset() {
                this.resets++;
                for (const input of inputs) { input.value = ""; input.checked = false; }
            }
        });
        Object.assign(target, fields);
        return target;
    }
    let login;
    let register;
    let resetForm;
    const tabs = [];
    const forgot = element();
    const oldResend = element();
    if (!reset) {
        login = form("publicLoginForm", {
            email: add("loginEmail", { value: "cliente@example.invalid" }),
            senha: add("loginSenha", { value: "Senha-de-Teste-123" })
        });
        register = form("publicRegisterForm", {
            nome: add("registerNome", { value: "Cliente de Teste" }),
            cpf: add("registerCpf", { value: "52998224725" }),
            email: add("registerEmail", { value: "novo@example.invalid" }),
            senha: add("registerSenha", { value: "Senha-de-Teste-456" }),
            telefone: add("registerTelefone", { value: "11999999999" }),
            aceite_privacidade: add("registerPrivacy", { type: "checkbox", value: "on", checked: true })
        });
        tabs.push(element({ dataset: { authTab: "login" } }), element({ dataset: { authTab: "register" } }));
        tabs[0].classList.add("active");
        login.classList.add("active");
    } else {
        resetForm = form("publicResetPasswordForm", {
            token: add("resetToken"),
            senha: add("resetSenha", { value: "Senha-nova-de-Teste-123" }),
            senhaConfirmacao: add("resetSenhaConfirmacao", { value: "Senha-nova-de-Teste-123" })
        });
        add("resetTitle");
    }
    for (const id of ["loginStatus", "registerStatus", "resetStatus"]) add(id);
    const eyebrow = element();
    const session = new Map([
        ["petflow_public_cart", JSON.stringify({ produto_teste: 2 })],
        ["petflow_public_favorites", JSON.stringify(["produto_teste"])],
        ["token", "admin-token"], ["user", JSON.stringify({ nome: "Equipe" })]
    ]);
    const legacy = new Map([
        ...customerKeys.map(key => [key, `legado-${key}`]),
        ["token", "legacy-admin-token"], ["user", JSON.stringify({ nome: "Equipe antiga" })]
    ]);
    const storage = map => ({
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key)
    });
    const document = element({
        title: "Nação Animal",
        getElementById: id => elements.get(id) || null,
        querySelector(selector) {
            return {
                "[data-auth-tab='login']": tabs[0],
                "[data-auth-tab='register']": tabs[1],
                "[data-public-forgot-password]": reset ? null : forgot,
                "[data-resend-verification]": oldResend,
                ".login-eyebrow": eyebrow
            }[selector] || null;
        },
        querySelectorAll(selector) {
            if (selector === "[data-auth-tab]") return tabs;
            if (selector === ".auth-panel") return [login, register].filter(Boolean);
            return [];
        }
    });
    const requests = [];
    const historyChanges = [];
    const timers = [];
    let headerUpdates = 0;
    const pathname = reset ? "/redefinir-senha" : "/login";
    const window = {
        location: { pathname, search, href: pathname + search, hash: "" },
        history: { replaceState(_state, _title, url) { historyChanges.push(url); } },
        PetFlowPublicHeader: { update() { headerUpdates++; } }
    };
    class FormDataStub {
        constructor(target) { this.target = target; }
        entries() {
            return this.target.elements.filter(input => input.name && !input.disabled &&
                (input.type !== "checkbox" || input.checked)).map(input => [input.name, input.value])[Symbol.iterator]();
        }
    }
    const context = vm.createContext({
        window, document, URLSearchParams, FormData: FormDataStub,
        sessionStorage: storage(session), localStorage: storage(legacy),
        fetch: async (url, options) => { requests.push({ url, ...options }); return fetch(url, options); },
        setTimeout(callback, delay) { timers.push({ callback, delay }); }
    });
    vm.runInContext(source, context);
    return {
        context, login, register, resetForm, tabs, forgot, oldResend, eyebrow, session, legacy, requests,
        window, historyChanges, timers, headerUpdates: () => headerUpdates,
        get: id => elements.get(id),
        init: () => document.dispatch("DOMContentLoaded"),
        runTimers() { for (const timer of timers.splice(0)) timer.callback(); }
    };
}

for (const payload of [
    { success: true, message: "Cadastro criado com sucesso. Você já pode entrar." },
    { success: true }
]) {
    test(`cadastro retorna ao login com e-mail preenchido e acesso liberado (${payload.message ? "mensagem" : "fallback"})`, async () => {
        const page = entryPage({ fetch: async (url, options) => {
            assert.equal(url, "/api/public/clientes/cadastro");
            assert.equal(options.method, "POST");
            return response(201, payload);
        } });
        await page.init();
        await page.tabs[1].click();
        const before = new Map(page.session);
        const email = page.register.elements.email.value;
        await page.register.dispatch("submit");
        assert.equal(page.requests.length, 1);
        const sent = JSON.parse(page.requests[0].body);
        assert.equal(sent.email, email);
        assert.equal(sent.cpf, "529.982.247-25");
        assert.equal(sent.aceite_privacidade, "on");
        assert.equal(page.get("loginStatus").textContent, "Cadastro criado com sucesso. Você já pode entrar.");
        assert.equal(page.get("registerStatus").textContent, "Cadastro criado com sucesso. Você já pode entrar.");
        assert.equal(page.get("loginEmail").value, email);
        assert.equal(page.login.classList.contains("active"), true);
        assert.equal(page.register.classList.contains("active"), false);
        assert.equal(page.tabs[0].classList.contains("active"), true);
        assert.equal(page.register.resets, 1);
        assert.equal(page.register.elements.email.value, "");
        assert.deepEqual(page.session, before, "Cadastro não cria uma sessão antes do login");
        assert.equal(page.window.location.href, "/login");
    });
}

test("cadastro com falha mantém campos e aba para tentar novamente", async () => {
    const page = entryPage({ fetch: async () => response(503, { message: "Cadastro indisponível. Tente novamente." }) });
    await page.init();
    await page.tabs[1].click();
    await page.register.dispatch("submit");
    assert.equal(page.register.elements.email.value, "novo@example.invalid");
    assert.equal(page.register.elements.senha.value, "Senha-de-Teste-456");
    assert.equal(page.register.resets, 0);
    assert.equal(page.register.classList.contains("active"), true);
    assert.match(page.get("registerStatus").textContent, /Cadastro indisponível/);
    assert.equal(page.session.has("petflow_customer_token"), false);
});

test("cadastro com CPF incompleto não chama API", async () => {
    const page = entryPage();
    await page.init();
    page.register.elements.cpf.value = "123";
    await page.register.dispatch("submit");
    assert.equal(page.requests.length, 0);
    assert.match(page.get("registerStatus").textContent, /CPF válido/);
    assert.equal(page.register.elements.cpf.focused, true);
});

const tracking = "/acompanhar-entrega?pedido=11111111-1111-4111-8111-111111111111";
for (const [next, destination] of [["", "/"], [tracking, tracking], ["https://outside.example.invalid/", "/"], ["//outside.example.invalid/", "/"]]) {
    test(`login salva sessão e respeita destino permitido: ${next || "início"}`, async () => {
        const user = { id: "cliente-teste", nome: "Cliente de Teste" };
        const page = entryPage({
            search: next ? `?${new URLSearchParams({ next })}` : "",
            fetch: async (url, options) => {
                assert.equal(url, "/api/public/clientes/login");
                assert.equal(options.method, "POST");
                return response(200, { data: { token: "customer-session", user } });
            }
        });
        await page.init();
        for (const key of customerKeys) page.legacy.set(key, "cache-legado");
        const before = new Map(page.session);
        await page.login.dispatch("submit");
        assert.equal(page.requests.length, 1);
        assert.deepEqual(JSON.parse(page.requests[0].body), { email: "cliente@example.invalid", senha: "Senha-de-Teste-123" });
        assert.equal(page.session.get("petflow_customer_token"), "customer-session");
        assert.deepEqual(JSON.parse(page.session.get("petflow_customer_user")), user);
        for (const [key, value] of before) assert.equal(page.session.get(key), value);
        assert.equal(page.legacy.get("token"), "legacy-admin-token");
        assert.equal(page.legacy.get("user"), JSON.stringify({ nome: "Equipe antiga" }));
        for (const key of customerKeys) assert.equal(page.legacy.has(key), false, key);
        assert.equal(page.window.location.href, destination);
        assert.equal(page.headerUpdates(), 1);
    });
}

test("login recusado mantém a página sem inventar sessão", async () => {
    const page = entryPage({ fetch: async () => response(401, { message: "E-mail ou senha incorretos." }) });
    await page.init();
    const before = new Map(page.session);
    await page.login.dispatch("submit");
    assert.deepEqual(page.session, before);
    assert.equal(page.window.location.href, "/login");
    assert.equal(page.get("loginStatus").textContent, "E-mail ou senha incorretos.");
});

for (const oldToken of ["token-antigo-de-teste", ""]) {
    test(`link legado de confirmação ${oldToken ? "com token" : "vazio"} informa acesso direto sem API`, async () => {
        const page = entryPage({ search: `?${new URLSearchParams({ verificar_email: oldToken, next: tracking, origem: "email" })}` });
        await page.init();
        await page.oldResend.click();
        assert.equal(page.requests.length, 0);
        assert.match(page.get("loginStatus").textContent, /confirmação de e-mail não é necessária/);
        assert.equal(page.historyChanges.length, 1);
        const cleaned = new URL(page.historyChanges[0], "https://store.example.invalid");
        assert.equal(cleaned.pathname, "/login");
        assert.equal(cleaned.searchParams.has("verificar_email"), false);
        assert.equal(cleaned.searchParams.get("next"), tracking);
        assert.equal(cleaned.searchParams.get("origem"), "email");
        assert.equal(page.session.has("petflow_customer_token"), false);
    });
}

test("entrada comum não mostra aviso legado nem altera URL", async () => {
    const page = entryPage();
    await page.init();
    assert.equal(page.get("loginStatus").textContent, "");
    assert.deepEqual(page.historyChanges, []);
    assert.equal(page.requests.length, 0);
});

test("recuperar senha exige e-mail e conserva o envio do pedido de recuperação", async () => {
    const page = entryPage({ fetch: async (url, options) => {
        assert.equal(url, "/api/public/clientes/esqueci-senha");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { email: "cliente@example.invalid" });
        return response(200, { message: "Se houver uma conta, enviaremos o link de recuperação." });
    } });
    await page.init();
    page.get("loginEmail").value = "";
    await page.forgot.click();
    assert.equal(page.requests.length, 0);
    assert.match(page.get("loginStatus").textContent, /Informe seu e-mail/);
    page.get("loginEmail").value = "  cliente@example.invalid  ";
    await page.forgot.click();
    assert.equal(page.requests.length, 1);
    assert.match(page.get("loginStatus").textContent, /link de recuperação/);
    assert.equal(page.window.location.href, "/login");
});

for (const type of ["cliente", "admin"]) {
    test(`redefinir senha ${type} preserva endpoint e destino após sucesso`, async () => {
        const page = entryPage({
            reset: true, search: `?token=reset-ficticio${type === "admin" ? "&tipo=admin" : ""}`,
            fetch: async (url, options) => {
                assert.equal(url, type === "admin" ? "/api/auth/reset-password" : "/api/public/clientes/redefinir-senha");
                assert.equal(options.method, "POST");
                assert.deepEqual(JSON.parse(options.body), { token: "reset-ficticio", senha: "Senha-nova-de-Teste-123" });
                return response(200, { success: true });
            }
        });
        await page.init();
        assert.equal(page.get("resetToken").value, "reset-ficticio");
        await page.resetForm.dispatch("submit");
        assert.equal(page.requests.length, 1);
        assert.equal(page.get("resetStatus").textContent, "Senha redefinida com sucesso. Você já pode entrar.");
        assert.equal(page.timers.length, 1);
        assert.equal(page.timers[0].delay, 1500);
        if (type === "admin") assert.match(page.get("resetTitle").textContent, /administrativa/);
        page.runTimers();
        assert.equal(page.window.location.href, type === "admin" ? "/admin/index.html" : "/login");
    });
}

test("redefinir senha impede envio com confirmação diferente", async () => {
    const page = entryPage({ reset: true, search: "?token=reset-ficticio" });
    await page.init();
    page.resetForm.senhaConfirmacao.value = "outra-senha";
    await page.resetForm.dispatch("submit");
    assert.equal(page.requests.length, 0);
    assert.equal(page.get("resetStatus").textContent, "As senhas não conferem.");
    assert.deepEqual(page.timers, []);
});
