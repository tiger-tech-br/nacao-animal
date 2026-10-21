"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function cartHarness(fetch) {
    const timers = new Map();
    const elements = new Map();
    const storage = new Map();
    const documentListeners = new Map();
    let timerId = 0;
    const document = {
        activeElement: null,
        addEventListener(event, callback) { documentListeners.set(event, callback); },
        getElementById: get,
        querySelector: () => get("buy"),
        querySelectorAll: () => []
    };
    function get(id) {
        if (!elements.has(id)) elements.set(id, {
            id, listeners: {}, attributes: {}, textContent: "", innerHTML: "", value: "",
            disabled: false, hidden: false,
            addEventListener(event, callback) { this.listeners[event] = callback; },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            removeAttribute(name) { delete this.attributes[name]; },
            getAttribute(name) { return this.attributes[name] ?? null; },
            replaceChildren() { this.innerHTML = ""; },
            focus() { document.activeElement = this; },
            reportValidity() { return true; }
        });
        return elements.get(id);
    }
    const window = {};
    window.parent = window;
    const context = vm.createContext({
        window, document, fetch, AbortController, AbortSignal, console, URLSearchParams,
        setTimeout: (callback, delay) => {
            const id = ++timerId;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout: id => timers.delete(id),
        location: { search: "", origin: "http://localhost" },
        sessionStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key)
        },
        localStorage: { removeItem() {} }
    });
    const run = code => vm.runInContext(code, context);
    run(fs.readFileSync("public/js/pages/cart/cart.js", "utf8"));
    run('cartProducts=[{id:"product",preco:6,nome:"Produto"}];cart={product:1};setupCartEvents();');
    return {
        get, run, document, storage, timers,
        async logout() {
            storage.delete("petflow_customer_token");
            storage.delete("petflow_customer_user");
            await documentListeners.get("petflow:customer-logout")();
        },
        input(id, value) {
            const element = get(id);
            element.value = value;
            get("shippingForm").listeners.input({ target: element });
        },
        fireLookupTimers() {
            const promises = [];
            for (const [id, timer] of [...timers]) {
                if (timer.delay > 1000) continue;
                timers.delete(id);
                promises.push(timer.callback());
            }
            return Promise.all(promises);
        }
    };
}

const address = {
    cep: "09060820", endereco: "Rua dos Testes", bairro: "Vila Teste",
    cidade: "Santo André", estado: "SP"
};
const response = data => ({ ok: true, status: 200, json: async () => ({ data }) });
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test("CEP anônimo consulta automaticamente com oito dígitos e preserva número e complemento", async () => {
    const pending = deferred();
    const requests = [];
    const h = cartHarness((url, options) => {
        requests.push({ url, options });
        return pending.promise;
    });
    h.get("deliveryNumber").value = "123";
    h.get("deliveryComplement").value = "Casa 2";
    h.get("deliveryCep").focus();
    h.input("deliveryCep", "0906082");
    await h.fireLookupTimers();
    assert.equal(requests.length, 0, "Não consulta um CEP incompleto");

    h.input("deliveryCep", "09060820");
    assert.equal(h.get("deliveryCep").value, "09060-820");
    assert.equal(requests.length, 0, "Aguarda a pausa de digitação");
    const lookup = h.fireLookupTimers();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/public/frete/cep/09060820");
    assert.equal(requests[0].options.headers?.Authorization, undefined);
    assert.equal(h.get("lookupCep").disabled, true, "Evita buscas repetidas enquanto consulta");

    pending.resolve(response(address));
    await lookup;
    assert.equal(h.get("deliveryCep").value, "09060-820", "Mantém o CEP formatado após a resposta");
    assert.equal(h.get("deliveryStreet").value, address.endereco);
    assert.equal(h.get("deliveryDistrict").value, address.bairro);
    assert.equal(h.get("deliveryCity").value, address.cidade);
    assert.equal(h.get("deliveryState").value, "SP");
    assert.equal(h.get("deliveryNumber").value, "123");
    assert.equal(h.get("deliveryComplement").value, "Casa 2");
    assert.equal(h.get("lookupCep").disabled, false);
    assert.match(h.get("cepStatus").textContent, /Endereço encontrado/);
    assert.equal(h.document.activeElement, h.get("deliveryNumber"));
    const saved = JSON.parse(h.storage.get("petflow_delivery_address"));
    assert.equal(saved.cep, "09060820");
    assert.equal(saved.numero, "123");
    assert.equal(saved.complemento, "Casa 2");
    assert.equal(requests.length, 1, "Visitante escolhe quando calcular o frete");
    assert.equal(h.run("shippingQuote"), null);
});

test("CEP inválido informa o formato esperado sem consultar o servidor", async () => {
    let requests = 0;
    const h = cartHarness(async () => { ++requests; return response(address); });
    h.get("deliveryCep").value = "09060-82";
    await h.get("lookupCep").listeners.click();
    assert.equal(requests, 0);
    assert.match(h.get("cepStatus").textContent, /8 dígitos/);
    assert.equal(h.get("lookupCep").disabled, false);
    let prevented = false;
    h.get("deliveryCep").listeners.keydown({ key: "Enter", preventDefault() { prevented = true; } });
    assert.equal(prevented, true, "Enter consulta o CEP sem enviar o formulário de frete");
    assert.equal(requests, 0);
});

test("CEP não encontrado exibe a falha e permite preencher manualmente sem perder número", async () => {
    const h = cartHarness(async () => ({
        ok: false, status: 404, json: async () => ({ message: "CEP não encontrado." })
    }));
    h.get("deliveryStreet").value = "Rua anterior";
    h.get("deliveryDistrict").value = "Bairro anterior";
    h.get("deliveryCity").value = "Cidade anterior";
    h.get("deliveryState").value = "SP";
    h.get("deliveryNumber").value = "45";
    h.get("deliveryComplement").value = "Apto 10";
    h.input("deliveryCep", "99999999");
    await h.fireLookupTimers();
    assert.match(h.get("cepStatus").textContent, /CEP não encontrado/);
    for (const id of ["deliveryStreet", "deliveryDistrict", "deliveryCity", "deliveryState"]) {
        assert.equal(h.get(id).value, "", "Não conserva endereço de outro CEP");
        assert.equal(h.get(id).disabled, false, "Campo continua disponível para edição manual");
    }
    assert.equal(h.get("deliveryNumber").value, "45");
    assert.equal(h.get("deliveryComplement").value, "Apto 10");
    assert.equal(h.get("lookupCep").disabled, false);
    assert.equal(h.run("shippingQuote"), null);
});

test("resposta de CEP não rouba o foco de quem já passou para outro campo", async () => {
    const pending = deferred();
    const h = cartHarness(() => pending.promise);
    h.get("deliveryCep").focus();
    h.input("deliveryCep", "09060820");
    const lookup = h.fireLookupTimers();
    h.get("deliveryComplement").focus();
    h.get("deliveryComplement").value = "Fundos";
    pending.resolve(response(address));
    await lookup;
    assert.equal(h.document.activeElement, h.get("deliveryComplement"));
    assert.equal(h.get("deliveryComplement").value, "Fundos");
    assert.equal(h.get("deliveryStreet").value, address.endereco);
});

test("resposta atrasada do CEP anterior não substitui o novo endereço", async () => {
    const oldRequest = deferred();
    const requests = [];
    const newAddress = { ...address, cep: "04101000", endereco: "Rua Nova", bairro: "Vila Nova", cidade: "São Paulo" };
    const h = cartHarness((url, options) => {
        requests.push({ url, options });
        return requests.length === 1 ? oldRequest.promise : Promise.resolve(response(newAddress));
    });
    h.get("deliveryNumber").value = "789";
    h.get("deliveryComplement").value = "Loja";
    h.input("deliveryCep", address.cep);
    const firstLookup = h.fireLookupTimers();
    h.input("deliveryCep", newAddress.cep);
    assert.equal(requests[0].options.signal.aborted, true);
    await h.fireLookupTimers();
    assert.equal(h.get("deliveryCep").value, "04101-000");
    assert.equal(h.get("deliveryStreet").value, "Rua Nova");
    const currentStatus = h.get("cepStatus").textContent;

    // Simula um transporte que concluiu a resposta mesmo após receber o cancelamento.
    oldRequest.resolve(response(address));
    await firstLookup;
    assert.equal(requests.length, 2);
    assert.equal(h.get("deliveryCep").value, "04101-000");
    assert.equal(h.get("deliveryStreet").value, "Rua Nova");
    assert.equal(h.get("deliveryDistrict").value, "Vila Nova");
    assert.equal(h.get("deliveryCity").value, "São Paulo");
    assert.equal(h.get("deliveryNumber").value, "789");
    assert.equal(h.get("deliveryComplement").value, "Loja");
    assert.equal(h.get("cepStatus").textContent, currentStatus);
    assert.equal(h.get("lookupCep").disabled, false);
    assert.equal(JSON.parse(h.storage.get("petflow_delivery_address")).cep, newAddress.cep);
});

test("cotação aguarda uma UF válida antes de enviar o endereço", async () => {
    let requests = 0;
    const h = cartHarness(async () => { ++requests; return response({ valor: 3 }); });
    for (const [id, value] of Object.entries({
        deliveryCep: "09060-820", deliveryStreet: "Rua dos Testes", deliveryNumber: "123",
        deliveryDistrict: "Vila Teste", deliveryCity: "Santo André", deliveryState: "São Paulo"
    })) h.get(id).value = value;
    await h.run("calculateShipping()");
    assert.equal(requests, 0);
    assert.equal(h.run("shippingQuote"), null);
    assert.match(h.get("shippingStatus").textContent, /CEP|endereço|UF|estado/i);
});

const personalAddress = { ...address, numero: "123", complemento: "Casa 2" };
const customerProfile = { ...personalAddress, nome: "Cliente anterior", telefone: "11999999999", email: "anterior@example.invalid" };

function fillPersonalAddress(h) {
    h.storage.set("petflow_customer_token", "old-token");
    h.storage.set("petflow_customer_user", JSON.stringify(customerProfile));
    h.storage.set("petflow_delivery_address", JSON.stringify(personalAddress));
    h.run(`customer=${JSON.stringify(customerProfile)};`);
    h.run(`for (const [field,id] of Object.entries(deliveryFields)) document.getElementById(id).value=${JSON.stringify(personalAddress)}[field];`);
}

function assertLoggedOutAddress(h) {
    for (const id of h.run("Object.values(deliveryFields)")) assert.equal(h.get(id).value, "", id);
    assert.equal(h.storage.has("petflow_delivery_address"), false);
    assert.equal(h.storage.has("petflow_cart_coupon"), false);
    assert.equal(h.storage.has("petflow_customer_user"), false);
    assert.equal(h.run("customer"), null);
    assert.equal(h.run("shippingQuote"), null);
    assert.equal(h.run("appliedCoupon"), null);
    assert.equal(h.run("couponSubtotal"), null);
    assert.equal(h.run("couponLoading"), false);
    assert.equal(h.run("selectedCoupon"), "");
    assert.equal(h.get("couponCode").value, "");
    assert.equal(h.get("lookupCep").disabled, false);
    assert.equal(h.get("calculateShipping").disabled, false);
}

test("sair limpa endereço pessoal, cupom e consultas automáticas ainda agendadas", async () => {
    const h = cartHarness(async () => { throw new Error("Requisição inesperada"); });
    fillPersonalAddress(h);
    h.input("deliveryNumber", "124");
    assert.equal(h.timers.size, 1, "Há uma cotação automática agendada");
    h.run('shippingQuote={valor:3};selectedCoupon="ANTERIOR";appliedCoupon={codigo:"ANTERIOR",desconto:1};couponSubtotal=6;couponLoading=true;');
    h.storage.set("petflow_cart_coupon", "ANTERIOR");
    h.get("couponCode").value = "ANTERIOR";
    await h.logout();
    assert.equal(h.timers.size, 0);
    assertLoggedOutAddress(h);

    h.input("deliveryCep", address.cep);
    assert.equal(h.timers.size, 1, "Há uma busca de CEP agendada");
    await h.logout();
    assert.equal(h.timers.size, 0);
    assertLoggedOutAddress(h);
});

test("resposta de CEP concluída depois de sair não restaura endereço ou armazenamento", async () => {
    const pending = deferred();
    let signal;
    const h = cartHarness((_url, options) => { signal = options.signal; return pending.promise; });
    fillPersonalAddress(h);
    const lookup = h.run("lookupDeliveryCep()");
    assert.equal(h.get("lookupCep").disabled, true);
    await h.logout();
    assert.equal(signal.aborted, true);
    pending.resolve(response(address));
    await lookup;
    assertLoggedOutAddress(h);
    assert.equal(h.get("cepStatus").textContent, "");
});

for (const operation of ["calculateShipping()", 'refreshCoupons("ANTERIOR")']) {
    test(`${operation}: resposta anterior à saída não restaura frete ou cupom`, async () => {
        const pending = deferred();
        const h = cartHarness(() => pending.promise);
        fillPersonalAddress(h);
        const request = h.run(operation);
        await h.logout();
        pending.resolve(response({
            valor: 3, distanciaMetros: 1500, token: "old-quote", produtos: 6,
            cupom: { codigo: "ANTERIOR", desconto: 1 }, disponiveis: []
        }));
        await request;
        assertLoggedOutAddress(h);
        assert.equal(h.get("shippingStatus").textContent, "");
        assert.equal(h.get("couponStatus").textContent, "");
    });
}

test("perfil pendente após sair não volta ao cache, resumo ou formulário", async () => {
    const pending = deferred();
    let signal;
    const h = cartHarness((_url, options) => { signal = options.signal; return pending.promise; });
    fillPersonalAddress(h);
    const profile = h.run("renderCustomer()");
    await h.logout();
    assert.equal(signal.aborted, true);
    pending.resolve(response(customerProfile));
    await profile;
    h.run("restoreDeliveryAddress()");
    assertLoggedOutAddress(h);
    assert.doesNotMatch(h.get("cartCustomer").innerHTML, /Cliente anterior|anterior@example/);
});

for (const status of [200, 401]) {
    test(`perfil antigo com resposta ${status} não altera cache nem sessão de outro cliente`, async () => {
        const pending = deferred();
        const h = cartHarness(() => pending.promise);
        fillPersonalAddress(h);
        const profile = h.run("renderCustomer()");
        h.storage.set("petflow_customer_token", "new-token");
        h.storage.set("petflow_customer_user", "new-customer");
        h.get("cartCustomer").innerHTML = "Cliente atual";
        pending.resolve({ ok: status === 200, status, json: async () => ({ data: customerProfile }) });
        await profile;
        assert.equal(h.storage.get("petflow_customer_token"), "new-token");
        assert.equal(h.storage.get("petflow_customer_user"), "new-customer");
        assert.equal(h.get("cartCustomer").innerHTML, "Cliente atual");
        assert.equal(h.run("customer"), null);
    });
}
