"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveProductSubcategory } = require("../services/productTaxonomyService");

test("cadastro aceita apenas as subcategorias correspondentes a cada categoria", () => {
    for (const name of ["Cães", "Gatos"]) {
        assert.equal(resolveProductSubcategory({ subcategoria: "Rações úmidas" }, { id: name, nome: name }), "racoes-umidas");
    }
    for (const name of ["Pássaros", "Aves", "Roedores", "Peixes"]) {
        const category = { id: name, nome: name };
        for (const value of ["racoes", "acessorios"]) assert.equal(resolveProductSubcategory({ subcategoria: value }, category), value);
        assert.throws(() => resolveProductSubcategory({ subcategoria: "racoes-umidas" }, category), { status: 400 });
    }
    assert.equal(resolveProductSubcategory({ subcategoria: "Terras e fertilizantes" }, { id: "jardim", nome: "Jardinagem" }), "terras-fertilizantes");
    assert.throws(() => resolveProductSubcategory({ subcategoria: "racoes" }, { id: "jardim", nome: "Jardinagem" }), { status: 400 });
});

test("edição legada preserva classificação omitida, limpa ao trocar categoria e permite remover o filtro", () => {
    const category = { id: "caes", nome: "Cães" };
    const existing = { categoria_id: "caes", subcategoria: "racoes-umidas" };
    assert.equal(resolveProductSubcategory({}, category, existing), "racoes-umidas");
    assert.equal(resolveProductSubcategory({}, { id: "aves", nome: "Aves" }, existing), null);
    for (const value of [null, "", "   "]) assert.equal(resolveProductSubcategory({ subcategoria: value }, category, existing), null);
    assert.equal(resolveProductSubcategory({}, category), null);
    for (const value of ["inventada", "terras-fertilizantes", [], {}, 2, false]) {
        assert.throws(() => resolveProductSubcategory({ subcategoria: value }, category), { status: 400 });
    }
    assert.equal(resolveProductSubcategory({}, { id: "legada", nome: "Categoria antiga" }), null);
});
