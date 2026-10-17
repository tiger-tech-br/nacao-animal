"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function cartHarness(fetch) {
    const timers = new Map();
    let timerId = 0;
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) elements.set(id, { id, listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback; }, textContent: "", innerHTML: "", value: "", disabled: false, hidden: false, replaceChildren() { this.innerHTML = ""; }, reportValidity() { return true; } });
        return elements.get(id);
    };
    const storage = new Map([["petflow_customer_token", "test"]]);
    const window = {};
    window.parent = window;
    const context = vm.createContext({
        window, fetch, AbortSignal, console, URLSearchParams,
        setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
        clearTimeout: id => timers.delete(id),
        location: { search: "", origin: "http://localhost" },
        document: { addEventListener() {}, getElementById: get, querySelector: () => get("buy"), querySelectorAll: () => [] },
        sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
    });
    vm.runInContext(fs.readFileSync("public/js/pages/cart/cart.js", "utf8"), context);
    vm.runInContext(`cartProducts=[{id:"product",preco:3.29,nome:"Produto"}];cart={product:1};shippingQuote={valor:4.9};`, context);
    return { context, get, run: code => vm.runInContext(code, context), timers,
        async flushTimers() {
            for (const [id, timer] of [...timers]) {
                timers.delete(id);
                await timer.callback();
            }
        }
    };
}
const response = (codigo, produtos = 3.29) => ({ ok: true, json: async () => ({ data: {
    produtos, cupom: codigo ? { codigo, desconto: Math.round(produtos * 10) / 100 } : null,
    disponiveis: [{ codigo: "PETFLOW10", descricao: "10%", desconto: .33 }]
} }) });
const amount = element => element.textContent.replace(/\s/g, "");

test("resumo mostra desconto separado, subtotal, frete, total e remoção", async () => {
    const h = cartHarness(async (url, options) => response(JSON.parse(options.body).codigo));
    await h.run('refreshCoupons("PETFLOW10")');
    assert.equal(amount(h.get("cartProductsTotal")), "R$3,29");
    assert.equal(amount(h.get("cartDiscount")), "-R$0,33");
    assert.equal(amount(h.get("cartSubtotal")), "R$2,96");
    assert.equal(amount(h.get("cartShipping")), "R$4,90");
    assert.equal(amount(h.get("cartTotal")), "R$7,86");
    assert.equal(h.get("cartSavings").hidden, false);
    await h.run('refreshCoupons("")');
    assert.equal(amount(h.get("cartTotal")), "R$8,19");
    assert.equal(h.get("cartSavings").hidden, true);
});

test("sacola bloqueia compra quando o produto está esgotado", () => {
    const h = cartHarness(async () => response(""));
    h.run("cartProducts[0].estoque_disponivel=0; renderCart()");
    assert.equal(h.get("buy").disabled, true);
    assert.equal(h.get("cartStockStatus").hidden, false);
    assert.match(h.get("cartStockStatus").textContent, /sem estoque/);
    assert.match(h.get("cartItems").innerHTML, /Produto esgotado/);
});

test("resposta atrasada não reaplica cupom removido durante a consulta", async () => {
    let resolveFirst;
    let calls = 0;
    const h = cartHarness(async () => ++calls === 1
        ? new Promise(resolve => { resolveFirst = resolve; }) : response(""));
    const first = h.run('refreshCoupons("PETFLOW10")');
    assert.equal(h.get("buy").disabled, true);
    await h.run('refreshCoupons("")');
    resolveFirst(response("PETFLOW10"));
    await first;
    assert.equal(h.run("appliedCoupon"), null);
    assert.equal(amount(h.get("cartTotal")), "R$8,19");
    assert.equal(h.get("buy").disabled, false);
});

test("mudança de quantidade revalida cupom e erro remove desconto com mensagem", async () => {
    let fail = false;
    const h = cartHarness(async (url, options) => {
        const body = JSON.parse(options.body);
        return fail ? { ok: false, json: async () => ({ message: "Cupom expirou." }) }
            : response(body.codigo, 3.29 * body.itens[0].quantidade);
    });
    await h.run('refreshCoupons("PETFLOW10")');
    h.run("cart.product=2");
    await h.run("refreshCoupons()");
    assert.equal(amount(h.get("cartDiscount")), "-R$0,66");
    assert.equal(amount(h.get("cartTotal")), "R$10,82");
    fail = true;
    await h.run("refreshCoupons()");
    assert.match(h.get("couponStatus").textContent, /Cupom expirou/);
    assert.equal(h.get("appliedCoupon").hidden, true);
    assert.equal(amount(h.get("cartDiscount")), "R$0,00");
});

test("frete sem conta envia o endereço, mostra valor exato e oculta total antes da cotação", async () => {
    const h = cartHarness(async (url, options) => {
        assert.equal(url, "/api/public/frete/cotar");
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(JSON.parse(options.body).endereco.numero, "123");
        return { ok: true, json: async () => ({ data: { valor: 3, distanciaMetros: 1500, token: "signed" } }) };
    });
    h.run(`sessionStorage.removeItem("petflow_customer_token"); shippingQuote=null;
        const address={cep:"09000-000",endereco:"Rua Teste",numero:"123",complemento:"",bairro:"Centro",cidade:"Santo André",estado:"SP"};
        for(const [field,id] of Object.entries(deliveryFields)) document.getElementById(id).value=address[field]; renderTotals();`);
    assert.equal(h.get("cartTotalRow").hidden, true);
    assert.equal(h.get("cartShippingRow").hidden, true);
    assert.equal(h.get("cartTotal").textContent, "");
    await h.run("calculateShipping()");
    assert.equal(h.get("cartTotalRow").hidden, false);
    assert.equal(amount(h.get("cartShipping")), "R$3,00");
    assert.equal(amount(h.get("cartTotal")), "R$6,29");
    assert.equal(h.get("buy").textContent, "Entrar para comprar");
    h.run("invalidateShipping()");
    assert.equal(h.get("cartTotalRow").hidden, true);
});

const savedAddress = { id: "customer", cep: "09000-000", endereco: "Rua Teste", numero: "123", complemento: "", bairro: "Centro", cidade: "Santo André", estado: "SP" };
const shippingResponse = { ok: true, json: async () => ({ data: { valor: 3, distanciaMetros: 1500, token: "signed" } }) };

test("cliente logado recebe frete ao abrir a sacola, sem botão; visitante calcula pelo botão", async () => {
    let calls = 0;
    const h = cartHarness(async () => { ++calls; return shippingResponse; });
    h.run(`customer=${JSON.stringify(savedAddress)}; shippingQuote=null;`);
    await h.run("restoreDeliveryAddress()");
    assert.equal(calls, 1);
    assert.equal(h.get("calculateShipping").hidden, true);
    assert.equal(amount(h.get("cartShipping")), "R$3,00");
    h.run('customer=null;sessionStorage.removeItem("petflow_customer_token");shippingQuote=null');
    await h.run("restoreDeliveryAddress()");
    assert.equal(calls, 1, "Visitante não dispara cotação automática");
    assert.equal(h.get("calculateShipping").hidden, false);
});

test("edições consecutivas agrupam a cotação e descartam resposta do endereço antigo", async () => {
    const addresses = [];
    let resolveFirst;
    const h = cartHarness(async (url, options) => {
        addresses.push(JSON.parse(options.body).endereco);
        return addresses.length === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : shippingResponse;
    });
    h.run(`customer=${JSON.stringify(savedAddress)}; setupCartEvents();`);
    const oldQuote = h.run("restoreDeliveryAddress()");
    for (const number of ["12", "125"]) {
        h.get("deliveryNumber").value = number;
        h.get("shippingForm").listeners.input({ target: h.get("deliveryNumber") });
    }
    assert.equal(h.timers.size, 1);
    assert.equal(h.get("cartTotalRow").hidden, true);
    resolveFirst(shippingResponse);
    await oldQuote;
    assert.equal(h.run("shippingQuote"), null, "Não mostra cotação anterior após editar endereço");
    await h.flushTimers();
    assert.equal(addresses.length, 2);
    assert.equal(addresses[1].numero, "125");
    assert.equal(h.get("calculateShipping").hidden, true);
    assert.equal(h.get("cartTotalRow").hidden, false);
});

test("endereço incompleto aguarda preenchimento e falha temporária tem uma única repetição automática", async () => {
    let calls = 0;
    const h = cartHarness(async () => {
        ++calls;
        return { ok: false, status: 503, json: async () => ({ message: "Indisponível" }) };
    });
    h.run(`customer=${JSON.stringify({ ...savedAddress, numero: "" })};setupCartEvents();`);
    await h.run("restoreDeliveryAddress()");
    assert.equal(calls, 0);
    assert.equal(h.get("calculateShipping").hidden, true);
    h.get("deliveryNumber").value = "123";
    h.get("shippingForm").listeners.input({ target: h.get("deliveryNumber") });
    await h.flushTimers();
    assert.equal(calls, 1);
    assert.match(h.get("shippingStatus").textContent, /tentativa automática/);
    await h.flushTimers();
    assert.equal(calls, 2);
    assert.equal(h.timers.size, 0, "Não repete chamadas indefinidamente");
});
