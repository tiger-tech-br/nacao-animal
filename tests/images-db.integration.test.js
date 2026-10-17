"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");

test("fotos e logos preservam IDs e serializam substituições no PostgreSQL", { skip: process.env.RUN_DB_TESTS !== "1" }, async () => {
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    const options = require("../config/dbOptions").buildDbOptions();
    const url = options.connectionString ? new URL(options.connectionString) : null;
    assert.ok(["localhost", "127.0.0.1"].includes(url?.hostname || options.host), "Somente PostgreSQL local");
    assert.equal(url ? url.pathname.slice(1) : options.database, "petflow_v2");
    const schema = `test_images_${randomBytes(8).toString("hex")}`;
    const admin = new Pool(options);
    let pool;
    const dbPath = require.resolve("../database/connection");
    const oldDb = require.cache[dbPath];
    try {
        await admin.query(`CREATE SCHEMA "${schema}"`);
        pool = new Pool({ ...options, options: `-c search_path=${schema},public` });
        for (const file of fs.readdirSync("database/sql").filter(name => name.endsWith(".sql")).sort()) {
            await pool.query(fs.readFileSync(`database/sql/${file}`, "utf8"));
        }
        require.cache[dbPath] = { exports: { query: (sql, params) => pool.query(sql, params) } };
        const products = require("../models/produtoModel");
        const companies = require("../models/empresaModel");
        const empresaId = (await pool.query("SELECT id FROM empresas ORDER BY created_at LIMIT 1")).rows[0].id;
        const categoriaId = (await pool.query("INSERT INTO categorias(empresa_id,nome) VALUES($1,'Fotos') RETURNING id", [empresaId])).rows[0].id;
        const photo = name => ({ foto: `https://res.cloudinary.com/test/image/upload/v1/petflow-v2/${name}.png`, fotoPublicId: `petflow-v2/${name}` });
        const base = { empresaId, categoriaId, nome: "Produto de teste", descricao: "Descrição do produto com foto", sku: "PHOTO_TEST", codigoBarras: null, preco: 10, custo: 5, ...photo("original") };
        const created = await products.create(base);
        assert.equal(created.foto_public_id, base.fotoPublicId);
        const first = await products.update(created.id, { ...base, ...photo("primeira"), replaceImage: true }, empresaId);
        assert.equal(first.previousImage.publicId, "petflow-v2/original");
        assert.equal(JSON.stringify(first).includes("previousImage"), false);
        const staleEdit = await products.update(created.id, { ...base, nome: "Sem nova foto", replaceImage: false }, empresaId);
        assert.equal(staleEdit.foto_public_id, "petflow-v2/primeira", "Edição sem arquivo não pode restaurar foto removida");
        const concurrent = await Promise.all(["segunda", "terceira"].map(name => products.update(created.id, { ...base, ...photo(name), replaceImage: true }, empresaId)));
        const current = await products.findById(created.id, empresaId);
        assert.ok(["petflow-v2/segunda", "petflow-v2/terceira"].includes(current.foto_public_id));
        assert.equal(new Set(concurrent.map(row => row.previousImage.publicId)).size, 2);
        assert.ok(concurrent.some(row => row.previousImage.publicId === "petflow-v2/primeira"));
        assert.ok(concurrent.every(row => row.previousImage.publicId !== current.foto_public_id), "A limpeza recebe apenas imagens realmente substituídas");
        const other = (await pool.query("INSERT INTO empresas(nome) VALUES('Outra loja') RETURNING id")).rows[0].id;
        assert.equal(await products.update(created.id, { ...base, ...photo("outra"), replaceImage: true }, other), null);
        const logo = name => ({ logo: `https://res.cloudinary.com/test/image/upload/v1/petflow-v2/${name}.png`, logoPublicId: `petflow-v2/${name}` });
        const company = { nome: "Loja teste", razaoSocial: "Loja teste", cnpj: null, telefone: "11999999999", email: "store@example.invalid", endereco: "Rua de Teste", numero: "1", bairro: "Centro", cidade: "São Paulo", estado: "SP", cep: "01001000", ...logo("logo-original") };
        await companies.update(empresaId, { ...company, replaceImage: true });
        const newLogo = await companies.update(empresaId, { ...company, ...logo("logo-nova"), replaceImage: true });
        assert.equal(newLogo.previousImage.publicId, "petflow-v2/logo-original");
        const noLogo = await companies.update(empresaId, { ...company, replaceImage: false });
        assert.equal(noLogo.logo_public_id, "petflow-v2/logo-nova");
        const companyConcurrent = await Promise.all(["logo-a", "logo-b"].map(name => companies.update(empresaId, { ...company, ...logo(name), replaceImage: true })));
        const finalCompany = await companies.findById(empresaId);
        assert.equal(new Set(companyConcurrent.map(row => row.previousImage.publicId)).size, 2);
        assert.ok(companyConcurrent.every(row => row.previousImage.publicId !== finalCompany.logo_public_id));
    } finally {
        if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
        if (pool) await pool.end();
        if (/^test_images_[a-f0-9]{16}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
    }
});
