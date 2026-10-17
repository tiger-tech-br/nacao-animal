"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/pages/auth/public-auth.js", "utf8");
const order = {
    id: "pedido-123",
    status: "AGUARDANDO_PAGAMENTO",
    pagseguro_checkout_url: "https://legacy-provider.invalid/stale-checkout"
};
const freshCheckoutUrl = "https://current-provider.invalid/new-checkout";
const response = (status, payload) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
});

function ordersPage(paymentResponse) {
    const listeners = new Map();
    const requests = [];
    const status = { textContent: "" };
    const button = { disabled: false, dataset: { continuePayment: order.id } };
    const list = {
        innerHTML: "",
        addEventListener: (event, callback) => listeners.set(event, callback)
    };
    const window = { location: { href: "/meus-pedidos" } };
    const context = vm.createContext({
        window,
        document: {
            addEventListener() {},
            getElementById: id => ({ publicOrdersList: list, ordersStatus: status })[id] || null
        },
        sessionStorage: { getItem: key => key === "petflow_customer_token" ? "test-token" : null },
        async fetch(url, options) {
            requests.push({ url, ...options });
            if (url === "/api/public/clientes/pedidos" && options.method === "GET") {
                return response(200, { data: [order] });
            }
            assert.equal(url, "/api/public/pagamentos");
            assert.equal(options.method, "POST");
            return paymentResponse();
        }
    });
    vm.runInContext(source, context);
    return {
        context, window, status, button, list,
        payments: () => requests.filter(item => item.url === "/api/public/pagamentos"),
        init: () => context.setupPublicOrders(),
        click: () => listeners.get("click")({
            preventDefault() {},
            target: { closest: selector => selector === "[data-continue-payment]" ? button : null }
        })
    };
}

test("continuar pagamento renderiza o ID do pedido sem expor a URL legada", () => {
    const page = ordersPage();
    const markup = page.context.renderContinuePayment(order);
    assert.match(markup, /data-continue-payment="pedido-123"/);
    assert.ok(!markup.includes(order.pagseguro_checkout_url));
    assert.doesNotMatch(markup, /href=|https?:\/\//);
    assert.match(page.context.renderContinuePayment({ id: order.id, status: order.status }), /Continuar pagamento/);
});

test("continuar pagamento consulta a API e não redireciona quando ela responde 503", async () => {
    const page = ordersPage(() => response(503, {
        message: "Pagamentos temporariamente indisponíveis.",
        payment: { checkoutUrl: freshCheckoutUrl }
    }));
    await page.init();
    await page.click();
    assert.equal(page.payments().length, 1);
    const payment = page.payments()[0];
    assert.equal(payment.headers.Authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(payment.body), { vendaId: order.id });
    assert.equal(page.window.location.href, "/meus-pedidos");
    assert.equal(page.status.textContent, "Pagamentos temporariamente indisponíveis.");
    assert.equal(page.button.disabled, false);
});

test("continuar pagamento usa somente o checkout recém-retornado pela API", async () => {
    const page = ordersPage(() => response(200, { payment: { checkoutUrl: freshCheckoutUrl } }));
    await page.init();
    await page.click();
    assert.equal(page.payments().length, 1);
    assert.equal(page.window.location.href, freshCheckoutUrl);
    assert.notEqual(page.window.location.href, order.pagseguro_checkout_url);
    assert.equal(page.button.disabled, false);
});

test("duplo clique enquanto a API responde não duplica o início do pagamento", async () => {
    let finishPayment;
    const pending = new Promise(resolve => { finishPayment = resolve; });
    const page = ordersPage(() => pending);
    await page.init();
    const firstClick = page.click();
    assert.equal(page.button.disabled, true);
    assert.equal(page.payments().length, 1);
    assert.equal(page.window.location.href, "/meus-pedidos");
    await page.click();
    assert.equal(page.payments().length, 1);
    finishPayment(response(200, { payment: { checkoutUrl: freshCheckoutUrl } }));
    await firstClick;
    assert.equal(page.window.location.href, freshCheckoutUrl);
    assert.equal(page.button.disabled, false);
});
