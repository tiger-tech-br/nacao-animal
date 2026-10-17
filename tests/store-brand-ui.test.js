"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const DEFAULT_LOGO = "/images/logo/nacao-animal-logo-transparent.png";
const sources = {
    home: fs.readFileSync("public/js/pages/home/catalog.js", "utf8"),
    public: fs.readFileSync("public/js/layout/public-header.js", "utf8")
};

function setupPage(kind, data, options = {}) {
    const logo = { src: DEFAULT_LOGO, alt: "Logo da Nação Animal" };
    const label = { textContent: "Nação Animal" };
    const footer = { textContent: "Nação Animal" };
    let requests = 0;
    const storage = { getItem: () => null, setItem() {}, removeItem() {} };
    const context = {
        URL,
        console,
        sessionStorage: storage,
        localStorage: storage,
        document: {
            addEventListener() {},
            getElementById: () => null,
            querySelector(selector) {
                if (selector === ".public-header") return {};
                if (selector === ".header .logo img" || selector === ".public-header .logo img") return logo;
                if (selector === ".header .logo-text" || selector === ".public-header .logo-text") return label;
                return null;
            },
            querySelectorAll: selector => selector === "[data-store-name]" ? [footer] : []
        },
        async fetch(url) {
            assert.equal(url, "/api/public/loja");
            requests++;
            if (options.failure) throw new Error("API indisponível");
            return { ok: options.ok !== false, json: async () => ({ success: options.success !== false, data }) };
        }
    };
    context.window = context;
    context.location = { href: "http://localhost:3000/produtos/1", origin: "http://localhost:3000", pathname: "/produtos/1" };
    vm.runInNewContext(sources[kind], context);
    return {
        logo, label, footer,
        requests: () => requests,
        load: () => kind === "home" ? context.loadStoreInfo() : context.PetFlowPublicHeader.init()
    };
}

for (const kind of Object.keys(sources)) {
    test(`${kind}: logo Cloudinary e nome da loja são aplicados pelo DOM`, async () => {
        const name = '<img src=x onerror="alert(1)"> Pet Shop';
        const image = "https://res.cloudinary.com/deeapnolt/image/upload/v1/petflow/logo.png";
        const page = setupPage(kind, { nome: name, logo: image });
        await page.load();
        assert.equal(page.logo.src, image);
        assert.equal(page.logo.alt, `Logo de ${name}`);
        assert.equal(page.label.textContent, name);
        if (kind === "home") assert.equal(page.footer.textContent, name);
        page.logo.onerror();
        assert.equal(page.logo.src, DEFAULT_LOGO);
        assert.equal(page.logo.onerror, null, "O fallback não deve causar uma repetição infinita de erros");
    });

    test(`${kind}: URLs de logo aceitam HTTPS e HTTP local sem credenciais`, async () => {
        const cases = [
            ["https://images.example.com/logo.png", "https://images.example.com/logo.png"],
            ["/images/logo/cliente.png", "http://localhost:3000/images/logo/cliente.png"],
            ["http://localhost:3000/logo.png", "http://localhost:3000/logo.png"],
            ["http://images.example.com/logo.png", DEFAULT_LOGO],
            ["javascript:alert(1)", DEFAULT_LOGO],
            ["data:image/svg+xml,<svg></svg>", DEFAULT_LOGO],
            ["https://user:password@example.com/logo.png", DEFAULT_LOGO],
            ["https://user@example.com/logo.png", DEFAULT_LOGO],
            ["ftp://example.com/logo.png", DEFAULT_LOGO],
            ["http://[", DEFAULT_LOGO],
            ["   ", DEFAULT_LOGO],
            [null, DEFAULT_LOGO]
        ];
        for (const [url, expected] of cases) {
            const page = setupPage(kind, { nome: "  Minha Loja  ", logo: url });
            await page.load();
            assert.equal(page.logo.src, expected, `URL ${url}`);
            assert.equal(page.label.textContent, "Minha Loja");
        }
    });

    test(`${kind}: falha da API mantém o cabeçalho padrão`, async () => {
        for (const options of [{ failure: true }, { ok: false }, { success: false }]) {
            const page = setupPage(kind, { nome: "Inválido", logo: "https://example.com/logo.png" }, options);
            await page.load();
            assert.equal(page.logo.src, DEFAULT_LOGO);
            assert.equal(page.label.textContent, "Nação Animal");
        }
    });
}

test("cabeçalho público reutiliza a consulta da loja ao inicializar novamente", async () => {
    const page = setupPage("public", { nome: "Pet Shop", logo: null });
    await page.load();
    await page.load();
    assert.equal(page.requests(), 1);
});

test("contrato público da loja inclui o logo configurado", async () => {
    const source = fs.readFileSync("controllers/publicCatalogController.js", "utf8");
    const data = { nome: "Pet Shop", logo: "https://res.cloudinary.com/deeapnolt/image/upload/logo.png" };
    const context = {
        module: { exports: {} },
        require(name) {
            assert.equal(name, "../database/connection");
            return { async query(sql) {
                assert.match(sql, /SELECT\s+nome,logo,/);
                return { rows: [data] };
            } };
        }
    };
    vm.runInNewContext(source, context);
    let payload;
    await context.module.exports.loja({}, { json(value) { payload = value; } }, error => { throw error; });
    assert.equal(payload.success, true);
    assert.equal(payload.data.logo, data.logo);
});
