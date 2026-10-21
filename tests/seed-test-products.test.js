"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { TEST_PRODUCTS, TEST_DESCRIPTION, parseArgs, seedTestProducts } = require("../scripts/seed-test-products");

function database({ name = "nacao-animal", empresaId = "empresa-a", failStock = false } = {}) {
    let serial = 0;
    return {
        commands: [],
        state: { categories: [], products: [], stocks: [], movements: [], audits: [] },
        async query(sql, values = []) {
            const query = sql.trim().replace(/\s+/g, " ");
            this.commands.push(query);
            if (query === "BEGIN") { this.before = structuredClone(this.state); return { rows: [] }; }
            if (query === "ROLLBACK") { this.state = this.before; return { rows: [] }; }
            if (query === "COMMIT") return { rows: [] };
            if (query.includes("pg_advisory_xact_lock")) return { rows: [] };
            if (query.startsWith("SELECT current_database()")) return { rows: [{ database: name, empresa_id: empresaId }] };
            if (query === "SELECT get_petflow_empresa_id() AS id") return { rows: [{ id: empresaId }] };
            if (query.includes("FROM produtos p")) {
                const product = this.state.products.find(row => row.sku === values[0]);
                if (!product) return { rows: [] };
                const category = this.state.categories.find(row => row.id === product.categoria_id);
                const stock = this.state.stocks.find(row => row.produto_id === product.id);
                return { rows: [{ ...product, categoria: category?.nome, quantidade: stock?.quantidade || 0 }] };
            }
            if (query.startsWith("INSERT INTO categorias")) {
                if (!this.state.categories.some(row => row.nome === values[1])) {
                    this.state.categories.push({ id: `category-${++serial}`, empresa_id: values[0], nome: values[1], ativo: true });
                }
                return { rows: [] };
            }
            if (query.startsWith("SELECT id,empresa_id FROM categorias")) {
                return { rows: this.state.categories.filter(row => row.nome === values[0]) };
            }
            if (query.startsWith("INSERT INTO produtos")) {
                if (this.state.products.some(row => row.sku === values[4])) return { rows: [] };
                const row = { id: `product-${++serial}`, empresa_id: values[0], categoria_id: values[1], nome: values[2], descricao: values[3], sku: values[4], preco: values[5], foto: null, marca: null, ativo: true };
                this.state.products.push(row);
                return { rows: [{ id: row.id }] };
            }
            if (query.startsWith("INSERT INTO estoque")) {
                if (failStock) throw Object.assign(new Error("isolated stock failure"), { code: "TEST_STOCK_ERROR" });
                assert.ok(!this.state.stocks.some(row => row.produto_id === values[1]), "Não pode sobrescrever estoque existente");
                this.state.stocks.push({ empresa_id: values[0], produto_id: values[1], quantidade: values[2] });
                return { rows: [] };
            }
            if (query.startsWith("INSERT INTO movimentacoes_estoque")) {
                this.state.movements.push({ empresa_id: values[0], produto_id: values[1], quantidade: values[2] });
                return { rows: [] };
            }
            if (query.startsWith("INSERT INTO auditoria_admin")) {
                this.state.audits.push({ empresa_id: values[0], produto_id: values[1], dados: JSON.parse(values[2]) });
                return { rows: [] };
            }
            assert.fail(`Consulta inesperada no teste isolado: ${query}`);
        }
    };
}

test("prévia é padrão, rejeita flags ambíguas e não depende de configuração nem conexão de banco", () => {
    assert.equal(parseArgs([]).apply, false);
    assert.equal(parseArgs(["--dry-run"]).apply, false);
    assert.equal(parseArgs(["--apply"]).apply, true);
    for (const args of [["--apply", "--dry-run"], ["--force"], ["--apply", "--apply"]]) assert.throws(() => parseArgs(args), /Use node/);
    const output = execFileSync(process.execPath, ["scripts/seed-test-products.js"], {
        encoding: "utf8", env: { ...process.env, DB_NAME: "wrong-database", DATABASE_URL: "invalid-url" }
    });
    assert.match(output, /Prévia: nenhum banco foi acessado/);
    assert.match(output, /NA-TESTE-CAES-01/);
});

test("cadastro cria seis itens baratos identificados e estoque inicial com movimentação e auditoria", async () => {
    const client = database();
    const rows = await seedTestProducts(client);
    assert.equal(rows.length, 6);
    assert.deepEqual(new Set(rows.map(row => row.preco)), new Set([6, 10]));
    assert.ok(rows.every(row => row.nome.startsWith("[TESTE]") && row.estoque === 5 && row.resultado === "cadastrado"));
    assert.deepEqual(new Set(client.state.categories.map(row => row.nome)), new Set(["Cães", "Gatos", "Aves", "Peixes", "Roedores", "Acessórios"]));
    assert.equal(client.state.products.length, 6);
    assert.ok(client.state.products.every(row => row.foto === null && row.marca === null && row.descricao === TEST_DESCRIPTION));
    assert.equal(client.state.stocks.length, 6);
    assert.equal(client.state.movements.length, 6);
    assert.equal(client.state.audits.length, 6);
    assert.equal(client.commands.at(-1), "COMMIT");
    assert.equal(client.commands.filter(sql => sql.includes("pg_advisory_xact_lock")).length, 1);
});

test("reexecutar preserva preços, estoque consumido, status e categorias preexistentes", async () => {
    const client = database();
    await seedTestProducts(client);
    client.state.products[0].preco = 19;
    client.state.products[0].ativo = false;
    client.state.stocks[0].quantidade = 1;
    client.state.categories[0].ativo = false;
    const before = structuredClone(client.state);
    const rows = await seedTestProducts(client);
    assert.deepEqual(client.state, before);
    assert.ok(rows.every(row => row.resultado === "preservado"));
    assert.equal(rows[0].preco, 19);
    assert.equal(rows[0].estoque, 1);
});

test("falha de estoque desfaz também os produtos e categorias criados na mesma execução", async () => {
    const client = database({ failStock: true });
    const before = structuredClone(client.state);
    await assert.rejects(seedTestProducts(client), { code: "TEST_STOCK_ERROR" });
    assert.deepEqual(client.state, before);
    assert.equal(client.commands.at(-1), "ROLLBACK");
    assert.ok(!client.commands.includes("COMMIT"));
});

test("SKU ou categoria de outra empresa interrompe sem alterar dados existentes", async () => {
    for (const type of ["sku", "category"]) {
        const client = database();
        if (type === "sku") client.state.products.push({ id: "foreign", empresa_id: "empresa-b", sku: TEST_PRODUCTS[0].sku });
        else client.state.categories.push({ id: "foreign", empresa_id: "empresa-b", nome: TEST_PRODUCTS[0].categoria });
        const before = structuredClone(client.state);
        await assert.rejects(seedTestProducts(client), /outra empresa/);
        assert.deepEqual(client.state, before);
        assert.equal(client.commands.at(-1), "ROLLBACK");
    }
});

test("banco inesperado e ausência de loja falham antes de inserir ou chamar função que cria empresa", async () => {
    for (const options of [{ name: "another-project" }, { empresaId: null }]) {
        const client = database(options);
        await assert.rejects(seedTestProducts(client), /banco conectado|Cadastre a loja/);
        assert.ok(!client.commands.some(sql => sql.startsWith("INSERT")));
        assert.ok(!client.commands.includes("SELECT get_petflow_empresa_id() AS id"));
        assert.equal(client.commands.at(-1), "ROLLBACK");
    }
});
