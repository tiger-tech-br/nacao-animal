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
const customerKeys = [
    "petflow_customer_token", "petflow_customer_user", "petflow_public_cart",
    "petflow_public_favorites", "petflow_delivery_address", "petflow_cart_coupon"
];
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

function accountPage(fetch, { confirm = () => true } = {}) {
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
        ["petflow_public_favorites", JSON.stringify(["product"])],
        ["petflow_delivery_address", JSON.stringify({ cep: "00000000" })],
        ["petflow_cart_coupon", JSON.stringify({ codigo: "TESTE" })],
        ["token", "staff-token"], ["user", JSON.stringify({ nome: "Equipe" })], ["theme", "dark"]
    ]);
    const legacy = new Map([
        ...customerKeys.map(key => [key, `legado-${key}`]),
        ["token", "legacy-staff-token"], ["user", JSON.stringify({ nome: "Equipe antiga" })], ["theme", "light"]
    ]);
    const requests = [];
    const confirmationCalls = [];
    const deletionConfirmations = [];
    const confirmation = deferred();
    const emittedEvents = [];
    const documentListeners = new Map();
    const window = {
        location: { href: "/conta" }, PetFlowPublicHeader: { update() {} },
        confirm(message) { deletionConfirmations.push(message); return confirm(message); },
        NacaoAnimalLogoutDialog: { confirm(trigger) { confirmationCalls.push(trigger); return confirmation.promise; } }
    };
    const document = {
        addEventListener(name, callback) {
            const listeners = documentListeners.get(name) || [];
            listeners.push(callback);
            documentListeners.set(name, listeners);
        },
        dispatchEvent(event) {
            emittedEvents.push(event.type);
            for (const callback of documentListeners.get(event.type) || []) callback(event);
        },
        getElementById: id => elements.get(id) || null,
        querySelector: selector => selector.includes("submit") ? save : selector === ".account-container" ? form : null,
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
        CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
        sessionStorage: storageApi(storage), localStorage: storageApi(legacy),
        fetch: async (url, options) => {
            requests.push({ url, ...options });
            return fetch(url, options);
        }
    });
    vm.runInContext(source, context);
    return {
        context, form, save, retry, window, storage, legacy, requests, confirmationCalls, deletionConfirmations, emittedEvents,
        answerConfirmation: value => confirmation.resolve(value),
        get: id => elements.get(id),
        blocked: () => fields.disabled || save.disabled,
        init: () => context.setupPublicAccount(),
        async click(target) {
            await Promise.all((target.listeners.get("click") || []).map(callback => callback({ preventDefault() {}, target, currentTarget: target })));
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
        for (const key of customerKeys) {
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

test("Minha conta aguarda confirmação e cancelar mantém dados e página atual", async () => {
    const page = accountPage(async () => response(200, { data: customer }));
    await page.init();
    const before = [new Map(page.storage), new Map(page.legacy)];
    const logout = page.get("publicLogout");
    const leaving = page.click(logout);
    assert.deepEqual(page.confirmationCalls, [logout]);
    assert.equal(page.requests.filter(item => item.url.endsWith("/logout")).length, 0);
    assert.deepEqual(page.storage, before[0]);
    assert.equal(page.window.location.href, "/conta");
    page.answerConfirmation(false);
    await leaving;
    assert.deepEqual(page.storage, before[0]);
    assert.deepEqual(page.legacy, before[1]);
    assert.equal(page.window.location.href, "/conta");
    assert.equal(page.requests.filter(item => item.url.endsWith("/logout")).length, 0);
    assert.deepEqual(page.emittedEvents, []);
});

for (const revocation of ["sucesso", "erro de rede", "HTTP 503"]) {
    test(`Minha conta confirma saída e limpa somente dados do cliente após ${revocation}`, async () => {
        const page = accountPage(async (url, options) => {
            if (url === "/api/public/clientes/me" && options.method === "GET") return response(200, { data: customer });
            assert.equal(url, "/api/public/clientes/logout");
            assert.equal(options.method, "POST");
            if (revocation === "erro de rede") throw new TypeError("Failed to fetch");
            return response(revocation === "HTTP 503" ? 503 : 200, {});
        });
        await page.init();
        const preserved = [page.storage, page.legacy].map(store => new Map(
            [...store].filter(([key]) => !customerKeys.includes(key))
        ));
        const leaving = page.click(page.get("publicLogout"));
        assert.equal(page.storage.get("petflow_customer_token"), "original-token");
        assert.equal(page.window.location.href, "/conta");
        page.answerConfirmation(true);
        await leaving;
        for (const [index, store] of [page.storage, page.legacy].entries()) {
            for (const key of customerKeys) assert.equal(store.has(key), false, key);
            assert.deepEqual(store, preserved[index], "Preserva token/user administrativos e preferências");
        }
        const logouts = page.requests.filter(item => item.url.endsWith("/logout"));
        assert.equal(logouts.length, 1);
        assert.equal(logouts[0].headers.Authorization, "Bearer original-token");
        assert.equal(logouts[0].keepalive, true);
        assert.deepEqual(page.emittedEvents, ["petflow:customer-logout"]);
        assert.equal(page.window.location.href, "/");
    });
}

test("Minha conta não encerra outra sessão aberta enquanto o diálogo aguarda", async () => {
    const page = accountPage(async () => response(200, { data: customer }));
    await page.init();
    const leaving = page.click(page.get("publicLogout"));
    page.storage.set("petflow_customer_token", "another-account-token");
    page.storage.set("petflow_customer_user", JSON.stringify({ nome: "Outro cliente" }));
    page.storage.set("petflow_delivery_address", JSON.stringify({ cep: "11111111" }));
    const before = [new Map(page.storage), new Map(page.legacy)];
    page.answerConfirmation(true);
    await leaving;
    assert.deepEqual(page.storage, before[0]);
    assert.deepEqual(page.legacy, before[1]);
    assert.equal(page.window.location.href, "/conta");
    assert.equal(page.requests.filter(item => item.url.endsWith("/logout")).length, 0);
    assert.deepEqual(page.emittedEvents, []);
});

test("exclusão usa confirmação nativa explicativa e cancelar mantém o cadastro", async () => {
    const page = accountPage(async () => response(200, { data: customer }), { confirm: () => false });
    await page.init();
    const before = [new Map(page.storage), new Map(page.legacy)];
    await page.click(page.get("publicDeleteAccount"));
    assert.equal(page.deletionConfirmations.length, 1);
    const message = page.deletionConfirmations[0];
    assert.match(message, /Tem certeza que deseja excluir seu cadastro/);
    assert.match(message, /acesso e seus dados cadastrais serão removidos/);
    assert.match(message, /obrigação de conservação poderão ser mantidos/);
    assert.match(message, /pedidos em andamento.*analisada antes da exclusão/);
    assert.deepEqual(page.confirmationCalls, [], "Exclusão mantém a confirmação nativa própria");
    assert.equal(page.requests.filter(item => item.method === "DELETE").length, 0);
    assert.deepEqual(page.storage, before[0]);
    assert.deepEqual(page.legacy, before[1]);
    assert.equal(page.window.location.href, "/conta");
    assert.equal(page.blocked(), false);
    assert.deepEqual(page.emittedEvents, []);
});

test("exclusão pendente retorna protocolo e mantém sessão e dados", async () => {
    const page = accountPage(async (_url, options) => options.method === "DELETE"
        ? response(202, { pending: true, message: "Solicitação em análise.", protocolo: "PROTO-TESTE-202" })
        : response(200, { data: customer }));
    await page.init();
    const before = [new Map(page.storage), new Map(page.legacy)];
    await page.click(page.get("publicDeleteAccount"));
    assert.deepEqual(page.storage, before[0]);
    assert.deepEqual(page.legacy, before[1]);
    assert.equal(page.get("accountStatus").textContent, "Solicitação em análise. Protocolo: PROTO-TESTE-202.");
    const deletion = page.requests.find(item => item.method === "DELETE");
    assert.equal(deletion.url, "/api/public/clientes/me");
    assert.equal(deletion.headers.Authorization, "Bearer original-token");
    assert.equal(page.window.location.href, "/conta");
    assert.equal(page.blocked(), false);
    assert.equal(page.get("publicDeleteAccount").disabled, false);
    assert.equal(page.get("email").disabled, true);
    assert.deepEqual(page.emittedEvents, []);
});

test("exclusão concluída limpa cliente, preserva administrador e encerra a página", async () => {
    const page = accountPage(async (_url, options) => options.method === "DELETE"
        ? response(200, { success: true, message: "Cadastro excluído." })
        : response(200, { data: customer }));
    await page.init();
    const preserved = [page.storage, page.legacy].map(store => new Map(
        [...store].filter(([key]) => !customerKeys.includes(key))
    ));
    await page.click(page.get("publicDeleteAccount"));
    for (const [index, store] of [page.storage, page.legacy].entries()) {
        for (const key of customerKeys) assert.equal(store.has(key), false, key);
        assert.deepEqual(store, preserved[index]);
    }
    assert.equal(page.requests.filter(item => item.method === "DELETE").length, 1);
    assert.deepEqual(page.emittedEvents, ["petflow:customer-logout"]);
    assert.equal(page.window.location.href, "/");
});

test("exclusão em andamento bloqueia duplo clique e reabilita ações após protocolo", async () => {
    const pending = deferred();
    const page = accountPage(async (_url, options) => options.method === "DELETE"
        ? pending.promise : response(200, { data: customer }));
    await page.init();
    const deleting = page.click(page.get("publicDeleteAccount"));
    assert.equal(page.get("publicDeleteAccount").disabled, true);
    assert.equal(page.save.disabled, true);
    assert.equal(page.get("publicLogout").disabled, false);
    await page.click(page.get("publicDeleteAccount"));
    assert.equal(page.requests.filter(item => item.method === "DELETE").length, 1);
    assert.equal(page.deletionConfirmations.length, 1);
    pending.resolve(response(202, { pending: true, message: "Em análise.", protocolo: "PROTO-TESTE" }));
    await deleting;
    assert.equal(page.get("publicDeleteAccount").disabled, false);
    assert.equal(page.save.disabled, false);
    assert.equal(page.get("email").disabled, true);
    assert.equal(page.storage.get("petflow_customer_token"), "original-token");
});

for (const result of ["sucesso", "HTTP 503", "erro de rede"]) {
    test(`exclusão antiga com ${result} não altera outra sessão`, async () => {
        const pending = deferred();
        const page = accountPage(async (_url, options) => options.method === "DELETE"
            ? pending.promise : response(200, { data: customer }));
        await page.init();
        const deleting = page.click(page.get("publicDeleteAccount"));
        page.storage.set("petflow_customer_token", "new-account-token");
        page.storage.set("petflow_customer_user", JSON.stringify({ nome: "Nova conta" }));
        page.storage.set("petflow_delivery_address", JSON.stringify({ cep: "22222222" }));
        page.get("accountStatus").textContent = "Estado da nova sessão";
        const before = [new Map(page.storage), new Map(page.legacy)];
        const disabled = page.form.elements.map(control => control.disabled);
        if (result === "erro de rede") pending.reject(new TypeError("Failed to fetch"));
        else pending.resolve(response(result === "HTTP 503" ? 503 : 200,
            result === "HTTP 503" ? { message: "Falha antiga" } : { success: true }));
        await deleting;
        assert.deepEqual(page.storage, before[0]);
        assert.deepEqual(page.legacy, before[1]);
        assert.deepEqual(page.form.elements.map(control => control.disabled), disabled);
        assert.equal(page.get("accountStatus").textContent, "Estado da nova sessão");
        assert.equal(page.window.location.href, "/conta");
        assert.deepEqual(page.emittedEvents, []);
    });
}
