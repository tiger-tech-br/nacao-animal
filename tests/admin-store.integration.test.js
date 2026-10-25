"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

test("admin autentica, cadastra produto e controla estoque refletido no painel e catálogo", {
    skip: process.env.RUN_DB_TESTS !== "1"
}, async () => {
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    const options = require("../config/dbOptions").buildDbOptions();
    const target = options.connectionString ? new URL(options.connectionString) : null;
    assert.ok(["localhost", "127.0.0.1"].includes(target?.hostname || options.host),
        "Este teste só pode usar PostgreSQL local");
    assert.equal(target ? decodeURIComponent(target.pathname.slice(1)) : options.database, "nacao-animal",
        "Este teste só pode usar o banco nacao-animal");

    const schema = `test_admin_store_${randomBytes(8).toString("hex")}`;
    assert.match(schema, /^test_admin_store_[a-f0-9]{16}$/);
    const maintenance = new Pool({ ...options, connectionTimeoutMillis: 5000 });
    const originalFetch = global.fetch;
    const cacheBackup = new Map();
    const envOverrides = {
        NODE_ENV: "test",
        JWT_SECRET: "isolated-admin-store-integration-secret",
        JWT_EXPIRES_IN: "1h",
        APP_URL: "http://localhost",
        PAYMENTS_ENABLED: "false",
        PAYMENT_PROVIDER: "pending",
        PAYMENT_ENVIRONMENT: "sandbox"
    };
    const envBackup = Object.fromEntries(Object.keys(envOverrides).map(key => [key, process.env[key]]));
    let pool;
    let server;
    let base;
    let uploads = 0;
    const cleanupImages = [];

    function replaceModule(name, exports) {
        const filename = require.resolve(name);
        cacheBackup.set(filename, require.cache[filename]);
        require.cache[filename] = { id: filename, filename, loaded: true, exports };
    }

    try {
        await maintenance.query(`CREATE SCHEMA "${schema}"`);
        pool = new Pool({ ...options, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
        const sqlDirectory = path.join(__dirname, "..", "database", "sql");
        for (const filename of fs.readdirSync(sqlDirectory).filter(name => name.endsWith(".sql")).sort()) {
            await pool.query(fs.readFileSync(path.join(sqlDirectory, filename), "utf8"));
        }
        assert.equal((await pool.query("SELECT current_schema() AS schema")).rows[0].schema, schema);

        Object.assign(process.env, envOverrides);
        replaceModule("../config/db", { pool });
        replaceModule("../services/imageService", {
            async uploadImage(file) {
                if (!file) return null;
                assert.equal(file.mimetype, "image/png");
                assert.ok(file.buffer.length > 0);
                uploads++;
                return { url: `https://images.example.invalid/test-${uploads}.png`, publicId: `isolated/test-${uploads}` };
            },
            getImagePublicId(_url, publicId) { return publicId; },
            async removeImageSafely(publicId) { cleanupImages.push(publicId); }
        });
        const email = require("../services/emailService");
        replaceModule("../services/emailService", {
            ...email,
            assertEmailConfigured() { assert.fail("O fluxo administrativo não deve configurar e-mails"); },
            async sendEmail() { assert.fail("Este teste não pode enviar e-mails reais"); },
            async sendOptionalEmail() { assert.fail("Este teste não pode enviar e-mails reais"); }
        });
        global.fetch = async (url, init) => {
            assert.equal(new URL(String(url)).origin, base, "Nenhuma chamada externa é permitida neste teste");
            return originalFetch(url, init);
        };

        const app = require("../app");
        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
        base = `http://127.0.0.1:${server.address().port}`;

        async function request(endpoint, { method = "GET", body, token, multipart = false } = {}) {
            const response = await fetch(base + endpoint, {
                method,
                headers: {
                    ...(!multipart ? { "Content-Type": "application/json" } : {}),
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {})
            });
            return { status: response.status, body: await response.json() };
        }
        function expectStatus(response, status) {
            assert.equal(response.status, status, JSON.stringify(response.body));
            return response.body.data;
        }

        for (const endpoint of ["/api/produtos", "/api/estoque", "/api/dashboard"]) {
            expectStatus(await request(endpoint), 401);
        }
        for (const endpoint of ["/admin/", "/admin/pages/produtos/produtos.html",
            "/admin/pages/estoque/estoque.html", "/admin/pages/dashboard/dashboard.html"]) {
            const response = await fetch(base + endpoint);
            assert.equal(response.status, 200, endpoint);
            assert.match(await response.text(), /Nação Animal/);
        }

        const empresaId = (await pool.query("SELECT get_petflow_empresa_id() AS id")).rows[0].id;
        const password = `Teste-${randomBytes(16).toString("hex")}`;
        const passwordHash = await require("bcrypt").hash(password, 10);
        const adminId = (await pool.query(
            `INSERT INTO usuarios (empresa_id,nome,email,senha_hash,perfil)
             VALUES ($1,'Administrador de teste','admin-store@example.invalid',$2,'ADMIN') RETURNING id`,
            [empresaId, passwordHash]
        )).rows[0].id;
        expectStatus(await request("/api/auth/login", {
            method: "POST", body: { email: "admin-store@example.invalid", senha: "SenhaIncorreta123" }
        }), 401);
        const login = expectStatus(await request("/api/auth/login", {
            method: "POST", body: { email: "admin-store@example.invalid", senha: password }
        }), 200);
        assert.ok(login.token);
        assert.equal(login.user.id, adminId);
        assert.equal(login.user.empresaId, empresaId);
        assert.equal(login.user.perfil, "ADMIN");
        assert.ok((await pool.query("SELECT ultimo_login FROM usuarios WHERE id=$1", [adminId])).rows[0].ultimo_login);
        const token = login.token;
        assert.equal(expectStatus(await request("/api/auth/me", { token }), 200).id, adminId);
        const initialDashboard = expectStatus(await request("/api/dashboard", { token }), 200);

        const category = expectStatus(await request("/api/categorias", {
            method: "POST", token, body: { nome: "Categoria isolada", descricao: "Categoria usada no teste administrativo" }
        }), 201);
        const supplier = expectStatus(await request("/api/fornecedores", {
            method: "POST", token, body: { nome: "Fornecedor isolado", cnpj: "11222333000181" }
        }), 201);
        const productBody = {
            categoriaId: category.id, fornecedor_id: supplier.id, nome: "Ração teste isolado",
            descricao: "Produto de teste para validar o cadastro administrativo e o estoque.",
            sku: "ADMIN-STORE-TEST", codigoBarras: "", preco: "39.90", custo: "20.00"
        };
        function productForm(values = productBody) {
            const form = new FormData();
            for (const [key, value] of Object.entries(values)) form.append(key, value);
            form.append("foto", new Blob([Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1YAAAAASUVORK5CYII=", "base64"
            )], { type: "image/png" }), "produto-teste.png");
            return form;
        }

        expectStatus(await request("/api/produtos", { method: "POST", token, body: productBody }), 400);
        expectStatus(await request("/api/produtos", {
            method: "POST", token, multipart: true, body: productForm({ ...productBody, preco: "-1" })
        }), 400);
        assert.equal(uploads, 0, "Dados inválidos são recusados antes do envio da foto");
        const product = expectStatus(await request("/api/produtos", {
            method: "POST", token, multipart: true, body: productForm()
        }), 201);
        assert.equal(product.empresa_id, empresaId);
        assert.equal(product.fornecedor_id, supplier.id);
        assert.equal(Number(product.preco), 39.9);
        assert.equal(product.foto, "https://images.example.invalid/test-1.png");
        assert.equal(uploads, 1);
        assert.ok(expectStatus(await request("/api/produtos", { token }), 200).some(item => item.id === product.id));
        assert.equal(expectStatus(await request(`/api/produtos/${product.id}`, { token }), 200).sku, productBody.sku);
        const updated = expectStatus(await request(`/api/produtos/${product.id}`, {
            method: "PUT", token, body: { ...productBody, nome: "Ração teste atualizada", preco: "42.50" }
        }), 200);
        assert.equal(updated.nome, "Ração teste atualizada");
        assert.equal(Number(updated.preco), 42.5);
        assert.equal(updated.foto, product.foto, "Editar os dados mantém a foto existente");
        assert.equal(uploads, 1);

        const gardenCategory = expectStatus(await request("/api/categorias", { token }), 200)
            .find(item => item.nome === "Jardinagem");
        assert.ok(gardenCategory, "A migração disponibiliza Jardinagem para cadastrar produtos");
        const gardenBody = { ...productBody, nome: updated.nome, preco: "42.50", categoriaId: gardenCategory.id };
        expectStatus(await request(`/api/produtos/${product.id}`, {
            method: "PUT", token, body: { ...gardenBody, subcategoria: "racoes-umidas" }
        }), 400);
        const gardenProduct = expectStatus(await request(`/api/produtos/${product.id}`, {
            method: "PUT", token, body: { ...gardenBody, subcategoria: "Terras e fertilizantes" }
        }), 200);
        assert.equal(gardenProduct.subcategoria, "terras-fertilizantes");
        const publicGarden = expectStatus(await request("/api/public/produtos"), 200).find(item => item.id === product.id);
        assert.equal(publicGarden.subcategoria, "terras-fertilizantes");
        assert.equal(publicGarden.categoria, "Jardinagem");
        const sameCategory = expectStatus(await request(`/api/produtos/${product.id}`, {
            method: "PUT", token, body: gardenBody
        }), 200);
        assert.equal(sameCategory.subcategoria, "terras-fertilizantes", "Cliente legado não remove classificação omitida");
        const restoredCategory = expectStatus(await request(`/api/produtos/${product.id}`, {
            method: "PUT", token, body: { ...productBody, nome: updated.nome, preco: "42.50" }
        }), 200);
        assert.equal(restoredCategory.subcategoria, null, "Trocar de categoria sem tipo limpa classificação anterior");
        assert.equal(uploads, 1, "Classificar não substitui fotos");

        const stockBody = { produtoId: product.id, quantidade: 10, estoqueMinimo: 5,
            estoqueMaximo: 50, localizacao: "Prateleira de teste", motivo: "Contagem inicial de teste" };
        expectStatus(await request("/api/estoque", { method: "POST", token, body: stockBody }), 201);
        expectStatus(await request("/api/estoque", { method: "POST", token, body: stockBody }), 409);
        let stock = expectStatus(await request(`/api/estoque/${product.id}`, { token }), 200);
        assert.equal(Number(stock.quantidade), 10);
        assert.equal(Number(stock.estoque_minimo), 5);
        assert.equal(stock.localizacao, stockBody.localizacao);
        expectStatus(await request(`/api/estoque/${product.id}`, {
            method: "PUT", token, body: { ...stockBody, quantidade: -1 }
        }), 400);
        expectStatus(await request(`/api/estoque/${product.id}`, {
            method: "PUT", token, body: { ...stockBody, quantidade: 3, motivo: "" }
        }), 400);
        assert.equal(Number(expectStatus(await request(`/api/estoque/${product.id}`, { token }), 200).quantidade), 10,
            "Ajustes inválidos não alteram a quantidade");
        stock = expectStatus(await request(`/api/estoque/${product.id}`, {
            method: "PUT", token, body: { ...stockBody, quantidade: 3, motivo: "Recontagem física de teste" }
        }), 200);
        assert.equal(Number(stock.quantidade), 3);
        expectStatus(await request(`/api/estoque/${product.id}`, {
            method: "PUT", token, body: { ...stockBody, quantidade: 3, motivo: "Confirmação da recontagem" }
        }), 200);
        const movements = (await pool.query(
            `SELECT tipo,quantidade,saldo_anterior,saldo_novo,usuario_id FROM movimentacoes_estoque
             WHERE empresa_id=$1 AND produto_id=$2 ORDER BY data_movimentacao,id`, [empresaId, product.id]
        )).rows;
        assert.equal(movements.length, 2, "Repetir a mesma quantidade não cria outra movimentação");
        assert.ok(movements.some(item => item.tipo === "ENTRADA" && Number(item.saldo_anterior) === 0 && Number(item.saldo_novo) === 10));
        assert.ok(movements.some(item => item.tipo === "AJUSTE" && Number(item.quantidade) === 7 && Number(item.saldo_anterior) === 10 && Number(item.saldo_novo) === 3));
        assert.ok(movements.every(item => item.usuario_id === adminId));
        const stockList = expectStatus(await request("/api/estoque", { token }), 200);
        assert.equal(Number(stockList.find(item => item.produto_id === product.id).quantidade), 3);

        const dashboard = expectStatus(await request("/api/dashboard", { token }), 200);
        assert.equal(Number(dashboard.resumo.total_produtos), Number(initialDashboard.resumo.total_produtos) + 1);
        assert.equal(Number(dashboard.resumo.estoque_baixo), Number(initialDashboard.resumo.estoque_baixo) + 1);
        assert.ok(dashboard.estoqueBaixo.some(item => item.id === product.id && Number(item.quantidade) === 3));
        for (const key of ["ultimasVendas", "ultimasCompras", "contasVencidas", "produtosMaisVendidos"]) {
            assert.ok(Array.isArray(dashboard[key]), `${key} deve carregar no painel`);
        }
        const publicProducts = expectStatus(await request("/api/public/produtos"), 200);
        const publicProduct = publicProducts.find(item => item.id === product.id);
        assert.equal(publicProduct.nome, updated.nome);
        assert.equal(Number(publicProduct.preco), 42.5);
        assert.equal(publicProduct.estoque_disponivel, 3, "A loja pública recebe o estoque ajustado no painel");
        const auditRows = (await pool.query(
            "SELECT acao,entidade,usuario_id FROM auditoria_admin WHERE entidade_id=$1", [product.id]
        )).rows;
        assert.ok(auditRows.some(item => item.entidade === "PRODUTO" && item.acao === "CRIAR"));
        assert.ok(auditRows.some(item => item.entidade === "PRODUTO" && item.acao === "EDITAR"));
        assert.ok(auditRows.some(item => item.entidade === "ESTOQUE" && item.acao === "AJUSTAR"));
        assert.ok(auditRows.every(item => item.usuario_id === adminId));

        expectStatus(await request(`/api/estoque/${product.id}`, { method: "DELETE", token }), 405);
        expectStatus(await request(`/api/produtos/${product.id}`, { method: "DELETE", token }), 200);
        assert.ok(!expectStatus(await request("/api/public/produtos"), 200).some(item => item.id === product.id),
            "Desativar produto remove sua oferta no catálogo público");
        assert.equal(Number(expectStatus(await request(`/api/estoque/${product.id}`, { token }), 200).quantidade), 3,
            "A desativação preserva o histórico de estoque");
        assert.deepEqual(cleanupImages, []);
        assert.equal(process.env.PAYMENTS_ENABLED, "false");
        assert.equal(process.env.PAYMENT_PROVIDER, "pending");
        expectStatus(await request("/api/auth/logout", { method: "POST", token, body: {} }), 200);
        expectStatus(await request("/api/dashboard", { token }), 401);
    } finally {
        global.fetch = originalFetch;
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        for (const [filename, cached] of cacheBackup) {
            if (cached) require.cache[filename] = cached; else delete require.cache[filename];
        }
        for (const [key, value] of Object.entries(envBackup)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        if (pool) await pool.end();
        try {
            if (/^test_admin_store_[a-f0-9]{16}$/.test(schema)) {
                await maintenance.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            }
        } finally {
            await maintenance.end();
        }
    }
});
