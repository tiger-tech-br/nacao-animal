"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const taxonomy = require("../public/js/catalog-taxonomy");
const source = fs.readFileSync("public/js/pages/admin/admin-page.js", "utf8").replace(/\}\)\(\);\s*$/, `
    window.__taxonomyTest = { populateRemoteSelects, fillForm, bindEvents, readForm };
})();`);

function select(name) {
    let markup = "", value = "", values = [""];
    return {
        name, disabled: false,
        get innerHTML() { return markup; },
        set innerHTML(html) { markup = html; values = [...html.matchAll(/<option[^>]+value="([^"]*)"/g)].map(item => item[1]); value = values[0] || ""; },
        get value() { return value; },
        set value(next) { value = values.includes(String(next)) ? String(next) : ""; }
    };
}

function page(apiGet) {
    const category = select("categoriaId");
    const subcategory = select("subcategoria");
    const listeners = {};
    const form = {
        elements: { categoriaId: category, subcategoria: subcategory },
        addEventListener(name, listener) { listeners[name] = listener; }
    };
    const nodes = { recordForm: form, categoriaId: category, subcategoria: subcategory };
    const window = {
        NacaoCatalogTaxonomy: taxonomy,
        PetFlowAdminPage: { key: "produtos", fields: [
            { name: "categoriaId", type: "remote-select", endpoint: "/categorias" },
            { name: "subcategoria", type: "select" }
        ] }
    };
    vm.runInNewContext(source, {
        window, apiGet,
        document: {
            addEventListener() {}, getElementById: id => nodes[id] || null,
            querySelector: selector => nodes[selector.match(/^\[name="([^"]+)"\]$/)?.[1]] || null
        }
    });
    window.__taxonomyTest.bindEvents();
    return { category, subcategory, hooks: window.__taxonomyTest, changeCategory(id) {
        category.value = id;
        listeners.change({ target: category });
    } };
}

const categories = [
    { id: "caes", nome: "Cães" }, { id: "gatos", nome: "Gatos" },
    { id: "aves", nome: "Aves" }, { id: "jardim", nome: "Jardinagem" }
];

test("cadastro administrativo adapta subcategorias e limpa escolha incompatível ao trocar categoria", async () => {
    const ui = page(async () => ({ data: categories }));
    await ui.hooks.populateRemoteSelects();
    ui.changeCategory("caes");
    assert.match(ui.subcategory.innerHTML, /Rações úmidas/);
    ui.subcategory.value = "racoes-umidas";
    ui.changeCategory("aves");
    assert.equal(ui.subcategory.value, "");
    assert.doesNotMatch(ui.subcategory.innerHTML, /Rações úmidas/);
    assert.match(ui.subcategory.innerHTML, /Rações/);
    ui.changeCategory("jardim");
    assert.match(ui.subcategory.innerHTML, /Terras e fertilizantes/);
    assert.doesNotMatch(ui.subcategory.innerHTML, /Rações/);
    ui.subcategory.value = "terras-fertilizantes";
    assert.equal(ui.hooks.readForm().subcategoria, "terras-fertilizantes");
});

test("abrir edição antes da resposta de categorias preserva categoria e subcategoria salvas", async () => {
    let finish;
    const ui = page(() => new Promise(resolve => { finish = resolve; }));
    const load = ui.hooks.populateRemoteSelects();
    ui.hooks.fillForm({ categoria_id: "gatos", subcategoria: "racoes-umidas" });
    assert.equal(ui.subcategory.disabled, true);
    finish({ data: categories });
    await load;
    assert.equal(ui.category.value, "gatos");
    assert.equal(ui.subcategory.value, "racoes-umidas");
    assert.equal(ui.subcategory.disabled, false);
    ui.hooks.fillForm({ categoria_id: "caes", subcategoria: null });
    assert.equal(ui.category.value, "caes");
    assert.equal(ui.subcategory.value, "");
});

test("página de produtos carrega a classificação compartilhada antes do formulário administrativo", () => {
    const html = fs.readFileSync("admin/pages/produtos/produtos.html", "utf8");
    assert.match(html, /"name":"subcategoria","label":"Subcategoria","type":"select"/);
    assert.ok(html.indexOf('/js/catalog-taxonomy.js') < html.indexOf('/js/pages/admin/admin-page.js'));
});
