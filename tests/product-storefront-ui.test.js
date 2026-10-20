"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("public/js/pages/products/product-detail.js", "utf8");

function productPage(products = [], options = {}) {
    const elements = new Map();
    const listeners = new Map();
    const saved = { petflow_public_cart: JSON.stringify(options.cart || {}) };
    let headerUpdates = 0;
    function get(id) {
        if (!elements.has(id)) {
            const classes = new Set();
            const events = {};
            elements.set(id, {
                textContent: "", innerHTML: "", dataset: {}, attributes: {}, hidden: false, disabled: false,
                classList: {
                    add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
                    toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
                    contains(name) { return classes.has(name); }
                },
                setAttribute(name, value) { this.attributes[name] = value; },
                getAttribute(name) { return name === "src" ? this.src || null : this.attributes[name] || null; },
                removeAttribute(name) { delete this[name]; delete this.attributes[name]; },
                addEventListener(name, callback) { events[name] = callback; },
                click() { if (!this.disabled) events.click?.(); }
            });
        }
        return elements.get(id);
    }
    const context = {
        console,
        document: {
            title: "Nação Animal | Produto",
            getElementById: get,
            addEventListener(name, callback) {
                if (!listeners.has(name)) listeners.set(name, []);
                listeners.get(name).push(callback);
            },
            dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); }
        },
        sessionStorage: { getItem: key => saved[key] || null, setItem: (key, value) => { saved[key] = value; } },
        location: { pathname: options.path || "/produtos/racao-caes" },
        CustomEvent: class { constructor(type) { this.type = type; } },
        fetch: options.fetch || (async () => ({ ok: true, json: async () => ({ success: true, data: products }) })),
        PetFlowPublicHeader: { update() { headerUpdates++; } }
    };
    context.window = context;
    vm.runInNewContext(source, context);
    return { context, get, saved, headerUpdates: () => headerUpdates };
}

const product = { id: "1", sku: "RACAO-CAES", nome: "Ração para cães", preco: 79.9, estoque_disponivel: 4, foto: "/images/products/racao.jpg" };

test("produto em carregamento não oferece compra nem apresenta preço fictício", async () => {
    let resolveRequest;
    const page = productPage([], { fetch: () => new Promise(resolve => { resolveRequest = resolve; }) });
    const loading = page.context.setupProductPage();
    assert.equal(page.get("purchasePanel").hidden, true);
    assert.equal(page.get("addProductToCart").disabled, true);
    assert.equal(page.get("productPrice").textContent, "");
    resolveRequest({ ok: true, json: async () => ({ data: [product] }) });
    await loading;
    assert.equal(page.get("purchasePanel").hidden, false);
    assert.equal(page.get("productDetail").attributes["aria-busy"], "false");
    assert.match(page.get("productPrice").textContent, /79,90/);
});

test("produto ausente e falha da API mantêm compra bloqueada e oferecem retorno ao catálogo", async () => {
    for (const options of [{}, { fetch: async () => { throw new Error("Rede indisponível"); } }, { fetch: async () => ({ ok: false, json: async () => ({}) }) }]) {
        const page = productPage([], options);
        await page.context.setupProductPage();
        assert.equal(page.get("purchasePanel").hidden, true);
        assert.equal(page.get("addProductToCart").disabled, true);
        assert.equal(page.get("productPrice").textContent, "");
        assert.equal(page.get("productFallback").hidden, false);
        assert.equal(page.get("productImage").hidden, true);
        assert.equal(page.get("productImagePlaceholder").hidden, false);
        page.get("addProductToCart").click();
        assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), {});
    }
});

test("produto esgotado informa indisponibilidade sem inserir itens na sacola", async () => {
    const page = productPage([{ ...product, estoque_disponivel: 0 }]);
    await page.context.setupProductPage();
    assert.equal(page.get("addProductToCart").disabled, true);
    assert.equal(page.get("productAvailability").textContent, "Produto esgotado");
    page.get("addProductToCart").click();
    assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), {});
});

test("produto sem preço válido não é anunciado como gratuito nem pode ser comprado", async () => {
    for (const preco of [null, undefined, "", "indisponível"]) {
        const page = productPage([{ ...product, preco }]);
        await page.context.setupProductPage();
        assert.equal(page.get("productPrice").textContent, "Preço indisponível");
        assert.equal(page.get("addProductToCart").disabled, true);
        page.get("addProductToCart").click();
        assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), {});
    }
});

test("adicionar produto preserva quantidades existentes e atualiza o cabeçalho", async () => {
    for (const quantity of [0, 3]) {
        const page = productPage([product], { cart: quantity ? { 1: quantity } : {} });
        await page.context.setupProductPage();
        page.get("addProductToCart").click();
        assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), { 1: quantity || 1 });
        assert.equal(page.headerUpdates(), 1);
        assert.match(page.get("addProductToCart").innerHTML, /Na sua sacola/);
        assert.match(page.get("productStatus").textContent, quantity ? /já está/ : /adicionado/);
    }
});

test("foto ausente ou quebrada não é substituída pela foto de outro produto", async () => {
    const noPhoto = productPage([{ ...product, foto: null }]);
    await noPhoto.context.setupProductPage();
    assert.equal(noPhoto.get("productImage").hidden, true);
    assert.equal(noPhoto.get("productImage").src, undefined);
    assert.equal(noPhoto.get("productImageMessage").textContent, "Imagem indisponível");

    const brokenPhoto = productPage([product]);
    await brokenPhoto.context.setupProductPage();
    brokenPhoto.get("productImage").onerror();
    brokenPhoto.get("addProductToCart").click();
    assert.equal(brokenPhoto.get("productImage").hidden, true);
    assert.equal(brokenPhoto.get("productImagePlaceholder").hidden, false);
    assert.equal(brokenPhoto.get("productImage").src, product.foto);
});
