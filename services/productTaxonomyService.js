"use strict";

const taxonomy = require("../public/js/catalog-taxonomy");

function resolveProductSubcategory(body, category, existing = null) {
    const hasValue = Object.prototype.hasOwnProperty.call(body, "subcategoria");
    if (!hasValue) {
        return existing && String(existing.categoria_id) === String(category.id)
            ? existing.subcategoria || null
            : null;
    }
    const value = body.subcategoria;
    if (value === null || value === "" || (typeof value === "string" && !value.trim())) return null;
    const normalized = typeof value === "string" ? taxonomy.normalizeSubcategory(value) : "";
    const group = taxonomy.getCategory(category.nome);
    if (!normalized || !group?.subcategories.some(item => item.slug === normalized)) {
        throw Object.assign(new Error("Selecione uma subcategoria válida para a categoria do produto."), { status: 400 });
    }
    return normalized;
}

module.exports = { resolveProductSubcategory };
