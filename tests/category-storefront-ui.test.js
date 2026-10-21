"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function categoryPage(products, { slug = "caes", pathname = `/categorias/${slug}`, failure = false, cart, favorites } = {}) {
    const elements = new Map();
    const events = {};
    const documentEvents = {};
    const saved = {};
    if (cart) saved.petflow_public_cart = JSON.stringify(cart);
    if (favorites) saved.petflow_public_favorites = JSON.stringify(favorites);
    const cartButtons = new Map();
    const favoriteButtons = new Map();
    let requests = 0;
    let headerUpdates = 0;
    function get(id) {
        if (!elements.has(id)) elements.set(id, {
            value: "", textContent: "", innerHTML: "", hidden: false,
            attributes: {}, listeners: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(type, callback) { this.listeners[type] = callback; }
        });
        return elements.get(id);
    }
    const context = {
        console,
        sessionStorage: { getItem: key => saved[key] || null, setItem: (key, value) => { saved[key] = value; } },
        document: {
            addEventListener(name, callback) { documentEvents[name] = callback; }, getElementById: get,
            querySelectorAll(selector) {
                const attribute = selector === "[data-add-cart]" ? "add-cart" : selector === "[data-favorite-product]" ? "favorite-product" : null;
                if (!attribute) return [];
                const buttons = attribute === "add-cart" ? cartButtons : favoriteButtons;
                return [...get("categoryProducts").innerHTML.matchAll(new RegExp(`data-${attribute}="([^"]+)"`, "g"))].map(([, id]) => {
                    if (!buttons.has(id)) buttons.set(id, {
                        dataset: { addCart: id, favoriteProduct: id }, attributes: {}, listeners: {}, innerHTML: "",
                        classList: { add() {}, toggle() {} },
                        setAttribute(name, value) { this.attributes[name] = value; },
                        addEventListener(type, callback) { this.listeners[type] = callback; }
                    });
                    return buttons.get(id);
                });
            }
        },
        async fetch() {
            requests++;
            if (failure) throw new Error("Conexão indisponível");
            return { ok: true, json: async () => ({ success: true, data: products }) };
        },
        location: { pathname },
        history: { pushState(state, title, path) { context.location.pathname = path; } },
        PetFlowPublicHeader: { update() { headerUpdates++; } },
        addEventListener(name, callback) { events[name] = callback; }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync("public/js/pages/categories/category-detail.js", "utf8"), context);
    return { context, get, events, documentEvents, saved, cartButtons, favoriteButtons, headerUpdates: () => headerUpdates, requests: () => requests, load: () => context.setupCategoryPage() };
}

test("categoria filtra por pet, busca sem acentos e ordena preço sem modificar a seleção original", async () => {
    const products = [
        { id: "a", nome: "Ração para cães Premium", preco: 90, foto: "/a.jpg" },
        { id: "b", nome: "Ração para gatos", preco: 20, foto: "/b.jpg" },
        { id: "c", nome: "Ração para cães Econômica", preco: 45, foto: "/c.jpg" }
    ];
    const page = categoryPage(products);
    await page.load();
    assert.equal(page.get("categoryResults").textContent, "2 produtos encontrados na categoria.");
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /Ração para gatos/);
    page.get("categorySearch").value = "racao";
    page.get("categorySort").value = "price-asc";
    page.get("categorySort").listeners.change();
    let html = page.get("categoryProducts").innerHTML;
    assert.ok(html.indexOf('data-product-id="c"') < html.indexOf('data-product-id="a"'));
    assert.equal(page.get("categoryResults").textContent, "2 produtos encontrados nesta busca.");
    page.get("categorySort").value = "price-desc";
    page.context.applyFilters();
    html = page.get("categoryProducts").innerHTML;
    assert.ok(html.indexOf('data-product-id="a"') < html.indexOf('data-product-id="c"'));
    assert.deepEqual(products.map(product => product.id), ["a", "b", "c"]);
    page.get("categorySearch").value = "inexistente";
    page.context.applyFilters();
    assert.match(page.get("categoryProducts").innerHTML, /Vamos tentar outra busca/);
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /data-product-id=/);
});

test("seleção de categoria e voltar no histórico sincronizam título, filtro e produtos", async () => {
    const page = categoryPage([{ id: 1, nome: "Coleira para cães", preco: 20 }, { id: 2, nome: "Caminha para gatos", preco: 30 }]);
    await page.load();
    page.get("categoryFilter").value = "gatos";
    page.get("categoryFilter").listeners.change();
    assert.equal(page.context.location.pathname, "/categorias/gatos");
    assert.equal(page.get("categoryTitle").textContent, "Produtos para gatos");
    assert.match(page.get("categoryProducts").innerHTML, /Caminha para gatos/);
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /Coleira para cães/);
    page.context.location.pathname = "/categorias/caes";
    page.events.popstate();
    assert.equal(page.get("categoryFilter").value, "caes");
    assert.equal(page.get("categoryBreadcrumb").textContent, "Produtos para cães");
    assert.match(page.get("categoryProducts").innerHTML, /Coleira para cães/);
});

test("catálogo vazio, falha e slug desconhecido mostram estado útil sem produtos inventados", async () => {
    const empty = categoryPage([]);
    await empty.load();
    assert.match(empty.get("categoryProducts").innerHTML, /Novidades chegando por aqui/);
    assert.match(empty.get("categoryProducts").innerHTML, /href="\/#products"/);
    assert.equal(empty.get("categoryProducts").attributes["aria-busy"], "false");
    const failed = categoryPage([], { failure: true });
    await failed.load();
    assert.equal(failed.get("categoryResults").textContent, "Catálogo indisponível no momento.");
    assert.match(failed.get("categoryProducts").innerHTML, /Não foi possível carregar a seleção/);
    const unknown = categoryPage([], { slug: "desconhecida" });
    await unknown.load();
    assert.equal(unknown.requests(), 0);
    assert.equal(unknown.get("categoryTitle").textContent, "Categoria não encontrada");
    assert.equal(unknown.get("categoryToolbar").hidden, true);
});

test("cards sem estoque bloqueiam compra e sem foto apresentam ausência da imagem", async () => {
    const page = categoryPage([{ id: 1, nome: "Ração para cães", preco: 79.9, estoque_disponivel: 0 }]);
    await page.load();
    const html = page.get("categoryProducts").innerHTML;
    assert.match(html, /Ração para cães: esgotado/);
    assert.match(html, /data-add-cart="1"[^>]*disabled/);
    assert.match(html, /aria-label="Sem foto">Sem foto/);
    assert.doesNotMatch(html, /petflow-prime-racao\.jpg/);
    assert.equal(page.saved.petflow_public_cart, undefined);
});

test("ração para gatos adultos não aparece na categoria cães pela faixa etária", async () => {
    const page = categoryPage([
        { id: "gato", nome: "Ração gatos adultos", categoria: "Rações", preco: 45 },
        { id: "cao", nome: "Ração cães adultos", categoria: "Rações", preco: 50 }
    ]);
    await page.load();
    const html = page.get("categoryProducts").innerHTML;
    assert.match(html, /Ração cães adultos/);
    assert.doesNotMatch(html, /Ração gatos adultos/);
    assert.equal(page.get("categoryResults").textContent, "1 produto encontrado na categoria.");
});

test("roedores sem itens específicos ficam vazios sem usar petiscos, higiene ou acessórios de outras espécies", async () => {
    const page = categoryPage([
        { id: "cao", nome: "Petisco para cães", categoria: "Petiscos", preco: 15 },
        { id: "gato", nome: "Shampoo para gatos", categoria: "Higiene", preco: 20 },
        { id: "coleira", nome: "Coleira para cães", categoria: "Acessórios", preco: 30 }
    ], { slug: "roedores" });
    await page.load();
    const html = page.get("categoryProducts").innerHTML;
    assert.doesNotMatch(html, /data-product-id=/);
    assert.match(html, /Novidades chegando por aqui/);
    assert.equal(page.get("categoryResults").textContent, "0 produtos encontrados na categoria.");
});

test("catálogo completo inclui todas as espécies, busca sem acentos e ordena sem alterar a API", async () => {
    const products = [
        { id: "cao", nome: "Coleira para cães", preco: 30, estoque_disponivel: 5 },
        { id: "gato", nome: "Varinha para gatos", preco: 6, estoque_disponivel: 5 },
        { id: "hamster", nome: "Mordedor para hamster", preco: 10, estoque_disponivel: 5 }
    ];
    const page = categoryPage(products, { pathname: "/produtos" });
    await page.load();
    assert.equal(page.get("categoryFilter").value, "todas");
    assert.equal(page.get("categoryResults").textContent, "3 produtos encontrados no catálogo.");
    for (const product of products) assert.match(page.get("categoryProducts").innerHTML, new RegExp(`data-product-id="${product.id}"`));
    page.get("categorySort").value = "price-asc";
    page.get("categorySort").listeners.change();
    const html = page.get("categoryProducts").innerHTML;
    assert.ok(html.indexOf('data-product-id="gato"') < html.indexOf('data-product-id="hamster"'));
    assert.ok(html.indexOf('data-product-id="hamster"') < html.indexOf('data-product-id="cao"'));
    page.get("categorySearch").value = "caes";
    page.get("categorySearch").listeners.input();
    assert.equal(page.get("categoryResults").textContent, "1 produto encontrado nesta busca.");
    assert.match(page.get("categoryProducts").innerHTML, /Coleira para cães/);
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /Varinha para gatos|Mordedor para hamster/);
    assert.deepEqual(products.map(product => product.id), ["cao", "gato", "hamster"]);
});

test("trocar todas e categoria sincroniza URL e voltar restaura o catálogo completo", async () => {
    const page = categoryPage([
        { id: "cao", nome: "Coleira para cães", preco: 20 },
        { id: "gato", nome: "Caminha para gatos", preco: 30 }
    ], { pathname: "/produtos" });
    await page.load();
    const title = page.get("categoryTitle").textContent;
    page.get("categoryFilter").value = "gatos";
    page.get("categoryFilter").listeners.change();
    assert.equal(page.context.location.pathname, "/categorias/gatos");
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /Coleira para cães/);
    page.get("categoryFilter").value = "todas";
    page.get("categoryFilter").listeners.change();
    assert.equal(page.context.location.pathname, "/produtos");
    assert.equal(page.get("categoryTitle").textContent, title);
    assert.equal(page.get("categoryResults").textContent, "2 produtos encontrados no catálogo.");
    page.context.location.pathname = "/categorias/caes";
    page.events.popstate();
    assert.equal(page.get("categoryFilter").value, "caes");
    page.context.location.pathname = "/produtos";
    page.events.popstate();
    assert.equal(page.get("categoryFilter").value, "todas");
    assert.equal(page.get("categoryTitle").textContent, title);
    assert.equal(page.get("categoryResults").textContent, "2 produtos encontrados no catálogo.");
});

test("catálogo bloqueia itens sem preço válido e preserva quantidades já adicionadas", async () => {
    const invalid = [null, undefined, "", "inválido", -1];
    const products = invalid.map((preco, index) => ({ id: `invalid-${index}`, nome: `Produto ${index}`, preco, estoque_disponivel: 5 }));
    products.push({ id: "valid", nome: "Bolinha para cães", preco: 10, estoque_disponivel: 5 });
    const page = categoryPage(products, { pathname: "/produtos", cart: { valid: 3 } });
    await page.load();
    for (const [index] of invalid.entries()) {
        const id = `invalid-${index}`;
        assert.match(page.get("categoryProducts").innerHTML, new RegExp(`data-add-cart="${id}"[^>]*disabled`));
        page.cartButtons.get(id).listeners.click();
        assert.equal(JSON.parse(page.saved.petflow_public_cart)[id], undefined);
    }
    assert.match(page.get("categoryProducts").innerHTML, /Preço indisponível/);
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /R\$\s*0,00|NaN/);
    page.cartButtons.get("valid").listeners.click();
    assert.equal(JSON.parse(page.saved.petflow_public_cart).valid, 3);
});

test("favoritos usa a sessão existente e permite buscar e ordenar apenas os produtos salvos", async () => {
    const products = [
        { id: 1, nome: "Ração para gatos", preco: 10 },
        { id: 2, nome: "Ração para cães", preco: 6 },
        { id: 3, nome: "Mordedor para hamster", preco: 8 }
    ];
    const page = categoryPage(products, { pathname: "/favoritos/", favorites: [1, "2"] });
    await page.load();
    assert.equal(page.get("categoryTitle").textContent, "Meus favoritos");
    assert.equal(page.get("productsTitle").textContent, "Produtos salvos");
    assert.equal(page.get("categorySearch").placeholder, "Buscar nos favoritos");
    assert.equal(page.get("categoryFilter").value, "favoritos");
    assert.equal(page.get("categoryResults").textContent, "2 produtos encontrados nos favoritos.");
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /data-product-id="3"/);
    page.get("categorySort").value = "price-asc";
    page.get("categorySort").listeners.change();
    const html = page.get("categoryProducts").innerHTML;
    assert.ok(html.indexOf('data-product-id="2"') < html.indexOf('data-product-id="1"'));
    page.get("categorySearch").value = "racao gatos";
    page.get("categorySearch").listeners.input();
    assert.equal(page.get("categoryResults").textContent, "0 produtos encontrados nesta busca.");
    page.get("categorySearch").value = "gatos";
    page.get("categorySearch").listeners.input();
    assert.match(page.get("categoryProducts").innerHTML, /data-product-id="1"/);
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /data-product-id="2"/);
    assert.equal(page.requests(), 1);
    assert.deepEqual(products.map(product => product.id), [1, 2, 3]);
});

test("remover favorito atualiza a lista, a sessão e o cabeçalho sem alterar o carrinho", async () => {
    const page = categoryPage([
        { id: "a", nome: "Bolinha", preco: 6 },
        { id: "b", nome: "Varinha", preco: 10 }
    ], { pathname: "/favoritos", favorites: ["a", "b"], cart: { a: 3 } });
    await page.load();
    assert.match(page.get("categoryProducts").innerHTML, /Remover Bolinha dos favoritos/);
    page.favoriteButtons.get("a").listeners.click();
    assert.deepEqual(JSON.parse(page.saved.petflow_public_favorites), ["b"]);
    assert.doesNotMatch(page.get("categoryProducts").innerHTML, /data-product-id="a"/);
    assert.match(page.get("categoryProducts").innerHTML, /data-product-id="b"/);
    assert.equal(page.get("categoryResults").textContent, "1 produto encontrado nos favoritos.");
    assert.equal(JSON.parse(page.saved.petflow_public_cart).a, 3);
    assert.equal(page.headerUpdates(), 1);
    page.favoriteButtons.get("b").listeners.click();
    assert.match(page.get("categoryProducts").innerHTML, /Você ainda não tem favoritos/);
    assert.match(page.get("categoryProducts").innerHTML, /href="\/produtos"/);
    assert.equal(page.headerUpdates(), 2);
});

test("favoritos preserva quantidade no carrinho e bloqueia esgotado ou preço inválido", async () => {
    const products = [
        { id: "valid", nome: "Bolinha", preco: 6, estoque_disponivel: 10, foto: "  " },
        { id: "sold", nome: "Varinha", preco: 10, estoque_disponivel: 0 },
        { id: "price", nome: "Mordedor", preco: null, estoque_disponivel: 10 }
    ];
    const page = categoryPage(products, { pathname: "/favoritos", favorites: ["valid", "sold", "price"], cart: { valid: 3 } });
    await page.load();
    const html = page.get("categoryProducts").innerHTML;
    assert.match(html, /aria-label="Sem foto">Sem foto/);
    assert.doesNotMatch(html, /<img|petflow-prime-racao\.jpg/);
    for (const id of ["sold", "price"]) {
        assert.match(html, new RegExp(`data-add-cart="${id}"[^>]*disabled`));
        page.cartButtons.get(id).listeners.click();
        assert.equal(JSON.parse(page.saved.petflow_public_cart)[id], undefined);
    }
    page.cartButtons.get("valid").listeners.click();
    assert.equal(JSON.parse(page.saved.petflow_public_cart).valid, 3);
    assert.equal(page.headerUpdates(), 1);
    page.saved.petflow_public_cart = JSON.stringify({});
    page.documentEvents["petflow:cart-changed"]();
    assert.match(page.get("categoryProducts").innerHTML, /Bolinha: adicionar à sacola/);
    page.cartButtons.get("valid").listeners.click();
    assert.equal(JSON.parse(page.saved.petflow_public_cart).valid, 1);
});

test("favoritos distingue vazio, produtos indisponíveis e erro sem apagar os IDs salvos", async () => {
    const empty = categoryPage([{ id: 1, nome: "Bolinha", preco: 6 }], { pathname: "/favoritos" });
    await empty.load();
    assert.match(empty.get("categoryProducts").innerHTML, /Você ainda não tem favoritos/);
    assert.match(empty.get("categoryProducts").innerHTML, /href="\/produtos"/);
    const unavailable = categoryPage([], { pathname: "/favoritos", favorites: ["antigo"] });
    await unavailable.load();
    assert.match(unavailable.get("categoryProducts").innerHTML, /Seus produtos salvos estão indisponíveis/);
    assert.deepEqual(JSON.parse(unavailable.saved.petflow_public_favorites), ["antigo"]);
    const failed = categoryPage([], { pathname: "/favoritos", favorites: ["a"], failure: true });
    await failed.load();
    assert.match(failed.get("categoryProducts").innerHTML, /Não foi possível carregar seus favoritos/);
    assert.doesNotMatch(failed.get("categoryProducts").innerHTML, /Você ainda não tem favoritos/);
    assert.equal(failed.get("categoryResults").textContent, "Catálogo indisponível no momento.");
    assert.equal(failed.get("categoryProducts").attributes["aria-busy"], "false");
    failed.get("categorySearch").listeners.input();
    assert.match(failed.get("categoryProducts").innerHTML, /Catálogo indisponível no momento/);
    assert.deepEqual(JSON.parse(failed.saved.petflow_public_favorites), ["a"]);
    const malformed = categoryPage(null, { pathname: "/favoritos", favorites: ["a"] });
    await malformed.load();
    assert.match(malformed.get("categoryProducts").innerHTML, /Não foi possível carregar seus favoritos/);
    assert.doesNotMatch(malformed.get("categoryProducts").innerHTML, /Você ainda não tem favoritos/);
});

test("logout e retorno pelo histórico atualizam favoritos e preservam as rotas do catálogo", async () => {
    const page = categoryPage([{ id: "a", nome: "Bolinha para cães", preco: 6 }], { pathname: "/favoritos", favorites: ["a"] });
    await page.load();
    page.context.updateUrl("todas");
    page.events.popstate();
    assert.equal(page.context.location.pathname, "/produtos");
    page.context.updateUrl("favoritos");
    page.events.popstate();
    assert.equal(page.context.location.pathname, "/favoritos");
    page.context.location.pathname = "/categorias/caes";
    page.events.popstate();
    assert.equal(page.get("categoryTitle").textContent, "Produtos para cães");
    page.context.location.pathname = "/favoritos";
    page.events.popstate();
    assert.equal(page.get("categoryTitle").textContent, "Meus favoritos");
    delete page.saved.petflow_public_favorites;
    page.documentEvents["petflow:customer-logout"]();
    assert.match(page.get("categoryProducts").innerHTML, /Você ainda não tem favoritos/);
    page.saved.petflow_public_favorites = JSON.stringify(["a"]);
    page.events.pageshow({ persisted: true });
    assert.match(page.get("categoryProducts").innerHTML, /data-product-id="a"/);
    page.saved.petflow_public_favorites = JSON.stringify([]);
    page.events.pageshow({ persisted: true });
    assert.match(page.get("categoryProducts").innerHTML, /Você ainda não tem favoritos/);
    assert.equal(page.requests(), 1);
});

test("página de favoritos compartilha o catálogo, filtros acessíveis e navegação da loja", () => {
    const html = fs.readFileSync("views/products/favorites.html", "utf8");
    assert.match(html, /<title>Nação Animal \| Meus favoritos<\/title>/);
    assert.match(html, /category-detail\.js/);
    assert.match(html, /public-category\.css/);
    assert.match(html, /id="categoryProducts" aria-busy="true"/);
    assert.match(html, /id="categoryResults" role="status" aria-live="polite"/);
    assert.match(html, /<label for="categorySearch">/);
    assert.match(html, /<label for="categorySort">/);
    assert.doesNotMatch(html, /id="categoryFilter"/);
    assert.match(html, /salvos durante esta sessão de navegação/);
    assert.match(html, /href="\/produtos"/);
    assert.match(html, /href="\/favoritos"[^>]*aria-current="page"/);
    assert.doesNotMatch(html, /favorit(?:e|es)\.js/);
});
