"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function catalogPage(products, cards = [], href = "http://localhost:4600/") {
    const grid = { innerHTML: "" };
    const status = { textContent: "" };
    const favorites = { innerHTML: "" };
    const listeners = {};
    const saved = {};
    const context = {
        URL,
        console,
        sessionStorage: { getItem: key => saved[key] || null, setItem: (key, value) => { saved[key] = value; } },
        document: {
            addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
            querySelector: selector => selector === ".products-grid" ? grid : selector === ".favorites-overlay" ? {} : null,
            querySelectorAll(selector) {
                if (selector === "[data-product-card]") return cards;
                if (selector === "[data-action='toggle-cart']") return cards.map(card => card.cart);
                if (selector === "[data-action='toggle-favorite']") return cards.map(card => card.favorite);
                return [];
            },
            getElementById: id => id === "searchStatus" ? status : id === "favoritesItems" ? favorites : null
        },
        products
    };
    context.window = context;
    context.location = { href };
    vm.runInNewContext(fs.readFileSync("public/js/pages/home/catalog.js", "utf8"), context);
    vm.runInNewContext("publicProducts = products", context);
    return { context, grid, status, saved, favorites,
        clickDocument(target) { for (const callback of listeners.click || []) callback({ target }); }
    };
}

test("catálogo inicial mantém os produtos posteriores ao sexto disponíveis para navegação", () => {
    const products = Array.from({ length: 9 }, (_, index) => ({ id: index + 1, nome: `Produto ${index + 1}`, preco: 10 }));
    const page = catalogPage(products);
    page.context.applyPublicSearch("", false);
    assert.equal((page.grid.innerHTML.match(/data-product-card/g) || []).length, 9);
    assert.match(page.grid.innerHTML, /Produto 9/);
    assert.equal(page.status.textContent, "9 produtos disponíveis.");
});

test("busca sem acentos exibe somente os resultados e reserva estado vazio para ausência de correspondências", () => {
    const page = catalogPage([
        { id: 1, nome: "Ração para cães", preco: 79.9 },
        { id: 2, nome: "Brinquedo para gatos", preco: 29.9 }
    ]);
    page.context.applyPublicSearch("racao", false);
    assert.match(page.grid.innerHTML, /Ração para cães/);
    assert.doesNotMatch(page.grid.innerHTML, /Brinquedo para gatos|Nenhum produto|public-empty/);
    assert.equal(page.status.textContent, "1 produto encontrado para “racao”.");

    page.context.applyPublicSearch("produto inexistente", false);
    assert.equal((page.grid.innerHTML.match(/data-product-card/g) || []).length, 0);
    assert.match(page.grid.innerHTML, /Nenhum produto encontrado para essa busca/);
});

test("pesquisa enviada por outra página filtra a inicial nas URLs nova e legada", () => {
    const products = [
        { id: 1, nome: "Ração para cães", preco: 79.9 },
        { id: 2, nome: "Coleira", preco: 29.9 }
    ];
    for (const href of [
        "http://localhost:4600/?busca=ra%C3%A7%C3%A3o#products",
        "http://localhost:4600/#products?busca=ra%C3%A7%C3%A3o"
    ]) {
        const page = catalogPage(products, [], href);
        page.context.applyPublicSearch(page.context.getSearchValue(), false);
        assert.match(page.grid.innerHTML, /Ração para cães/);
        assert.doesNotMatch(page.grid.innerHTML, /Coleira/);
        assert.match(page.status.textContent, /1 produto encontrado/);
    }
});

test("link de favoritos das páginas internas é reconhecido sem interferir na busca", () => {
    const page = catalogPage([], [], "http://localhost:4600/?favoritos=1&busca=coleira#products");
    assert.equal(page.context.getHomeNavigation().favorites, true);
    assert.equal(page.context.getSearchValue(), "coleira");
    const ordinary = catalogPage([], [], "http://localhost:4600/#products");
    assert.equal(ordinary.context.getHomeNavigation().favorites, false);
});

function productCard(id) {
    const card = { dataset: { id: String(id) } };
    function button() {
        const listeners = {};
        const classes = new Set();
        return {
            dataset: {}, attributes: {}, disabled: false, innerHTML: "",
            setAttribute(name, value) { this.attributes[name] = value; },
            classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } },
            addEventListener(type, listener) { listeners[type] = listener; },
            closest: () => card,
            click() { if (!this.disabled) listeners.click?.(); }
        };
    }
    card.cart = button();
    card.favorite = button();
    card.querySelector = selector => selector === "[data-action='toggle-cart']" ? card.cart : card.favorite;
    return card;
}

test("estoque bloqueia adicionar e a alternância de sacola preserva ícone e estado acessível", () => {
    const product = { id: 1, nome: "Ração para cães", estoque_disponivel: 0, preco: 79.9 };
    const card = productCard(1);
    const page = catalogPage([product], [card]);
    page.context.bindProductActions();
    page.context.syncProductButtons();
    assert.equal(card.cart.disabled, true);
    assert.match(card.cart.attributes["aria-label"], /esgotado/);
    card.cart.click();
    assert.equal(page.saved.petflow_public_cart, undefined);

    product.estoque_disponivel = 3;
    page.context.syncProductButtons();
    assert.equal(card.cart.disabled, false);
    card.cart.click();
    assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), { 1: 1 });
    assert.equal(card.cart.attributes["aria-pressed"], "true");
    assert.equal(card.cart.attributes["aria-label"], "Remover Ração para cães da sacola");
    assert.match(card.cart.innerHTML, /href="#icon-cart"/);

    card.cart.click();
    assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), {});
    assert.equal(card.cart.attributes["aria-pressed"], "false");
    assert.equal(card.cart.attributes["aria-label"], "Adicionar Ração para cães à sacola");
    assert.match(card.cart.innerHTML, /href="#icon-cart"/);
});

test("favoritos alternam armazenamento e estado acessível sem alterar a sacola", () => {
    const card = productCard(2);
    const page = catalogPage([{ id: 2, nome: "Brinquedo", preco: 29.9 }], [card]);
    page.context.bindProductActions();
    card.favorite.click();
    assert.deepEqual(JSON.parse(page.saved.petflow_public_favorites), ["2"]);
    assert.equal(card.favorite.attributes["aria-pressed"], "true");
    assert.equal(card.favorite.attributes["aria-label"], "Remover Brinquedo dos favoritos");
    assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), {});

    card.favorite.click();
    assert.deepEqual(JSON.parse(page.saved.petflow_public_favorites), []);
    assert.equal(card.favorite.attributes["aria-pressed"], "false");
    assert.equal(card.favorite.attributes["aria-label"], "Salvar Brinquedo nos favoritos");
});

function favoritesPage(products, cart = {}) {
    const page = catalogPage(products);
    page.context.initialCart = cart;
    vm.runInNewContext("publicFavorites=new Set(products.map(product=>String(product.id)));publicCart={...initialCart};setupFavoritesPanel();renderFavoritesItems();", page.context);
    page.addFromFavorites = id => page.clickDocument({
        classList: { contains: () => false },
        closest(selector) { return selector === "[data-favorite-add-cart]" ? { disabled: false, dataset: { favoriteAddCart: String(id) } } : null; }
    });
    return page;
}

test("adicionar pelos favoritos preserva quantidade existente e inicia novos itens com uma unidade", () => {
    const page = favoritesPage([
        { id: "old", nome: "Produto já na sacola", preco: 10, estoque_disponivel: 5 },
        { id: "new", nome: "Outro produto", preco: 6, estoque_disponivel: 5 }
    ], { old: 3 });
    assert.match(page.favorites.innerHTML, /Produto já na sacola já está na sacola/);
    page.addFromFavorites("old");
    assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), { old: 3 });
    page.addFromFavorites("new");
    page.addFromFavorites("new");
    assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), { old: 3, new: 1 });
    assert.deepEqual(JSON.parse(page.saved.petflow_public_favorites), ["old", "new"]);
});

test("favoritos e vitrine bloqueiam preço ausente ou inválido, inclusive no handler", () => {
    for (const preco of [undefined, null, "", " ", "inválido", NaN, Infinity, -1]) {
        const product = { id: "invalid", nome: "Produto sem preço", preco, estoque_disponivel: 5 };
        const page = favoritesPage([product]);
        assert.match(page.favorites.innerHTML, /Preço indisponível/);
        assert.match(page.favorites.innerHTML, /data-favorite-add-cart="invalid"[^>]*disabled/);
        assert.doesNotMatch(page.favorites.innerHTML, /R\$|NaN/);
        page.addFromFavorites("invalid");
        assert.equal(page.saved.petflow_public_cart, undefined);
        page.context.renderProducts([product]);
        assert.match(page.grid.innerHTML, /Preço indisponível/);
        assert.match(page.grid.innerHTML, /data-action="toggle-cart"[^>]*disabled/);
        page.context.toggleCartProduct("invalid");
        assert.equal(vm.runInNewContext("Object.keys(publicCart).length", page.context), 0);
    }
});

test("favoritos bloqueiam esgotados e ignoram produto que saiu do catálogo", () => {
    const page = favoritesPage([{ id: "empty", nome: "Produto esgotado", preco: 6, estoque_disponivel: 0 }]);
    assert.match(page.favorites.innerHTML, /data-favorite-add-cart="empty"[^>]*disabled/);
    assert.match(page.favorites.innerHTML, />Esgotado</);
    page.addFromFavorites("empty");
    page.addFromFavorites("removed");
    assert.equal(page.saved.petflow_public_cart, undefined);
});

test("favoritos sem foto mostram placeholder e não usam imagem de outro produto", () => {
    for (const foto of [undefined, null, "", " "]) {
        const page = favoritesPage([{ id: "photo", nome: "Bolinha", preco: 10, foto }]);
        assert.match(page.favorites.innerHTML, /favorite-image-placeholder[^>]*role="img"[^>]*aria-label="Sem foto">Sem foto/);
        assert.doesNotMatch(page.favorites.innerHTML, /<img|petflow-prime-racao/);
    }
    const page = favoritesPage([{ id: "photo", nome: "Bolinha", preco: 10, foto: "/images/products/test-pet-ball.jpg" }]);
    assert.match(page.favorites.innerHTML, /<img src="\/images\/products\/test-pet-ball.jpg" alt="Bolinha"/);
    assert.doesNotMatch(page.favorites.innerHTML, /favorite-image-placeholder|petflow-prime-racao/);
});

test("preços zero e numérico em texto permanecem válidos nos favoritos", () => {
    for (const preco of [0, "0", "6.50"]) {
        const page = favoritesPage([{ id: "valid", nome: "Produto", preco, estoque_disponivel: 1 }]);
        assert.doesNotMatch(page.favorites.innerHTML, /Preço indisponível|data-favorite-add-cart="valid"[^>]*disabled/);
        page.addFromFavorites("valid");
        assert.deepEqual(JSON.parse(page.saved.petflow_public_cart), { valid: 1 });
    }
});
