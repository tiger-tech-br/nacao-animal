"use strict";

const fs = require("fs");
const path = require("path");

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const current = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(current) : [current];
    });
}

const htmlFiles = ["admin", "views"].flatMap(directory => walk(directory))
    .filter(file => file.endsWith(".html"));
const missing = [];

for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const pageConfig = html.match(/window\.PetFlowAdminPage\s*=\s*(\{[^;]+\});/s);
    if (pageConfig) {
        try { JSON.parse(pageConfig[1]); }
        catch (error) { missing.push(`${file}: configuracao administrativa invalida (${error.message})`); }
    }
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const reference = match[1].split(/[?#]/)[0];
        if (!reference.startsWith("/") || reference.startsWith("/api/")) continue;
        if (!path.extname(reference)) continue;
        const target = reference.startsWith("/admin/")
            ? path.resolve(reference.slice(1))
            : path.resolve("public", reference.slice(1));
        if (!fs.existsSync(target)) missing.push(`${file}: ${reference}`);
    }
}

if (missing.length) {
    console.error("Arquivos estaticos ausentes:\n" + missing.join("\n"));
    process.exitCode = 1;
} else {
    console.log(`Links estaticos aprovados em ${htmlFiles.length} paginas HTML.`);
}
