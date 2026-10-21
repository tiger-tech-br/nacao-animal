"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/pages/auth/public-auth.js", "utf8");
const customer = {
    id: "customer", nome: "Cliente Teste", cpf: "52998224725", telefone: "11999999999",
    email: "cliente@example.invalid", data_nascimento: "1990-01-02", cep: "09060820",
    endereco: "Rua de Teste", numero: "123", complemento: "Casa 2", bairro: "Centro",
    cidade: "Santo André", estado: "SP"
};
const response = (status, payload) => ({
    ok: status >= 200 && status < 300, status, json: async () => payload
});
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function accountPage(fetch) {
    const elements = new Map();
    function element(id, extra = {}) {
        const value = {
            id, value: "", type: "text", hidden: false, disabled: false, textContent: "",
            innerHTML: "", dataset: {}, attributes: {}, listeners: new Map(),
            classList: { add() {}, remove() {}, toggle() {} },
            addEventListener(event, callback) {
                if (!this.listeners.has(event)) this.listeners.set(event, []);
                this.listeners.get(event).push(callback);
            },
            setAttribute(name, content) { this.attributes[name] = String(content); },
            getAttribute(name) { return this.attributes[name] ?? null; },
            removeAttribute(name) { delete this.attributes[name]; },
            setCustomValidity(message) { this.validationMessage = message; },
            reportValidity() { return !this.validationMessage; },
            checkValidity() { return !this.validationMessage; },
            focus() {}, ...extra
        };
        elements.set(id, value);
        return value;
    }
    const inputs = Object.keys(customer).filter(name => name !== "id").map(name => element(name, {
        name, type: name === "email" ? "email" : name === "data_nascimento" ? "date" : "text",
        disabled: name === "email"
    }));
    const save = element("saveAccount", { type: "submit" });
    const logout = element("publicLogout", { type: "button" });
    const retry = element("publicAccountRetry", { type: "button", hidden: true });
    const exportButton = element("publicExportData", { type: "button" });
    const deleteButton = element("publicDeleteAccount", { type: "button" });
    const controls = [...inputs, save, logout, retry, exportButton, deleteButton];
    const fields = element("publicAccountFields", { disabled: false });
    const form = element("publicAccountForm", {
        elements: Object.assign(controls, Object.fromEntries(inputs.map(input => [input.name, input]))),
        querySelectorAll: () => controls,
        querySelector: selector => selector.includes("fieldset") ? fields : selector.includes("submit") ? save : null
    });
    element("accountStatus");
    const storage = new Map([
        ["petflow_customer_token", "original-token"],
        ["petflow_customer_user", JSON.stringify({ nome: "Perfil já salvo" })],
        ["petflow_public_cart", JSON.stringify({ product: 2 })],
        ["petflow_public_favorites", JSON.stringify(["product"])]
    ]);
    const legacy = new Map([["petflow_public_cart", "legacy-cart"]]);
    const requests = [];
    const window = { location: { href: "/conta" }, PetFlowPublicHeader: { update() {} } };
    const document = {
        addEventListener() {},
        getElementById: id => elements.get(id) || null,
        querySelector: selector => selector.includes("submit") ? save : null,
        querySelectorAll: () => []
    };
    const storageApi = map => ({
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key)
    });
    class FormDataStub {
        constructor(target) { this.form = target; }
        entries() {
            return this.form.elements.filter(control => control.name && !control.disabled)
                .map(control => [control.name, control.value])[Symbol.iterator]();
        }
    }
    const context = vm.createContext({
        window, document, AbortController, AbortSignal, URLSearchParams, console, FormData: FormDataStub,
        sessionStorage: storageApi(storage), localStorage: storageApi(legacy),
        fetch: async (url, options) => {
            requests.push({ url, ...options });
            return fetch(url, options);
        }
    });
    vm.runInContext(source, context);
    return {
        context, form, save, retry, window, storage, legacy, requests,
        get: id => elements.get(id),
        blocked: () => fields.disabled || save.disabled,
        init: () => context.setupPublicAccount(),
        async click(target) {
            await Promise.all((target.listeners.get("click") || []).map(callback => callback({ preventDefault() {}, target })));
        },
        async submit() {
            await Promise.all((form.listeners.get("submit") || []).map(callback => callback({ preventDefault() {}, target: form })));
        }
    };
}

for (const failure of [
    { name: "503", fetch: async () => response(503, { message: "Serviço temporariamente indisponível." }) },
    { name: "erro de rede", fetch: async () => { throw new TypeError("Failed to fetch"); } },
    { name: "timeout", fetch: async () => { throw Object.assign(new Error("Timeout"), { name: "TimeoutError" }); } }
]) {
    test(`Minha conta preserva sessão, carrinho e favoritos após ${failure.name}`, async () => {
        const page = accountPage(failure.fetch);
        const initialStorage = new Map(page.storage);
        const initialLegacy = new Map(page.legacy);
        await page.init();
        assert.equal(page.window.location.href, "/conta");
        assert.deepEqual(page.storage, initialStorage);
        assert.deepEqual(page.legacy, initialLegacy);
        assert.equal(page.retry.hidden, false);
        assert.equal(page.retry.disabled, false);
        assert.equal(page.blocked(), true, "Impede salvar campos vazios antes de carregar o perfil");
        assert.match(page.get("accountStatus").textContent, /novamente|tentar|indisponível|carregar/i);
        assert.equal(page.requests[0].headers.Authorization, "Bearer original-token");
        assert.ok(page.requests[0].signal, "A consulta tem um limite de espera");
    });
}

test("tentar novamente recupera o perfil sem duplicar o envio do formulário", async () => {
    let loads = 0;
    const page = accountPage(async (_url, options) => {
        if (options.method === "PUT") return response(200, { data: customer });
        return ++loads < 3 ? response(503, { message: "Tente novamente." }) : response(200, { data: customer });
    });
    await page.init();
    await page.click(page.retry);
    assert.equal(page.retry.hidden, false);
    await page.click(page.retry);
    assert.equal(loads, 3);
    assert.equal(page.retry.hidden, true);
    assert.equal(page.blocked(), false);
    assert.equal(page.get("nome").value, customer.nome);
    assert.equal(page.get("numero").value, "123");
    assert.equal(page.get("complemento").value, "Casa 2");
    assert.equal(page.get("email").disabled, true, "E-mail permanece somente para consulta");
    assert.equal(page.storage.get("petflow_customer_token"), "original-token");
    assert.equal(page.storage.get("petflow_public_cart"), JSON.stringify({ product: 2 }));
    assert.equal(page.storage.get("petflow_public_favorites"), JSON.stringify(["product"]));
    await page.submit();
    assert.equal(page.requests.filter(request => request.method === "PUT").length, 1);
    assert.match(page.get("accountStatus").textContent, /atualizados com sucesso/i);
});

test("nova tentativa em andamento bloqueia cliques repetidos", async () => {
    const pending = deferred();
    let loads = 0;
    const page = accountPage(async () => ++loads === 1 ? response(503, { message: "Indisponível." }) : pending.promise);
    await page.init();
    const loading = page.click(page.retry);
    assert.equal(page.retry.disabled, true);
    assert.equal(page.blocked(), true);
    await page.click(page.retry);
    assert.equal(loads, 2);
    pending.resolve(response(200, { data: customer }));
    await loading;
    assert.equal(page.blocked(), false);
    assert.equal(page.retry.hidden, true);
});

for (const status of [401, 403]) {
    test(`Minha conta invalida a sessão somente com autenticação recusada (${status})`, async () => {
        const page = accountPage(async () => response(status, { message: "Sessão inválida." }));
        await page.init();
        assert.equal(page.window.location.href, "/login");
        for (const key of ["petflow_customer_token", "petflow_customer_user", "petflow_public_cart", "petflow_public_favorites"]) {
            assert.equal(page.storage.has(key), false);
        }
    });
}

for (const status of [200, 401]) {
    test(`resposta antiga (${status}) não altera o perfil nem a autenticação de outra sessão`, async () => {
        const pending = deferred();
        const page = accountPage(() => pending.promise);
        const loading = page.init();
        page.storage.set("petflow_customer_token", "new-token");
        page.storage.set("petflow_customer_user", JSON.stringify({ nome: "Outro cliente" }));
        pending.resolve(response(status, status === 200 ? { data: customer } : { message: "Sessão antiga expirada." }));
        await loading;
        assert.equal(page.get("nome").value, "");
        assert.equal(page.storage.get("petflow_customer_token"), "new-token");
        assert.equal(page.storage.get("petflow_customer_user"), JSON.stringify({ nome: "Outro cliente" }));
        assert.equal(page.window.location.href, "/conta");
        assert.equal(page.blocked(), true);
    });
}

test("resposta pendente não restaura o perfil depois de encerrar a sessão", async () => {
    const pending = deferred();
    const page = accountPage(() => pending.promise);
    const loading = page.init();
    page.storage.delete("petflow_customer_token");
    page.storage.delete("petflow_customer_user");
    pending.resolve(response(200, { data: customer }));
    await loading;
    assert.equal(page.get("nome").value, "");
    assert.equal(page.storage.has("petflow_customer_token"), false);
    assert.equal(page.storage.has("petflow_customer_user"), false);
    assert.equal(page.blocked(), true);
});
