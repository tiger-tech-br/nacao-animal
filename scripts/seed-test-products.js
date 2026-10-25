"use strict";

const LEGACY_TEST_PRODUCTS = Object.freeze([
    { sku: "NA-TESTE-CAES-01", categoria: "Cães", nome: "[TESTE] Saquinhos higiênicos para cães", preco: 6, quantidade: 5 },
    { sku: "NA-TESTE-GATOS-01", categoria: "Gatos", nome: "[TESTE] Varinha para gatos", preco: 6, quantidade: 5 },
    { sku: "NA-TESTE-AVES-01", categoria: "Aves", nome: "[TESTE] Poleiro para aves", preco: 6, quantidade: 5 },
    { sku: "NA-TESTE-PEIXES-01", categoria: "Peixes", nome: "[TESTE] Enfeite para aquário de peixes", preco: 10, quantidade: 5 },
    { sku: "NA-TESTE-ROEDORES-01", categoria: "Roedores", nome: "[TESTE] Mordedor para hamster e roedores", preco: 6, quantidade: 5 },
    { sku: "NA-TESTE-ACESSORIOS-01", categoria: "Acessórios", nome: "[TESTE] Bolinha para pets", preco: 10, quantidade: 5 }
].map(Object.freeze));

const TEST_DESCRIPTION = "Produto demonstrativo cadastrado para testes autorizados da loja Nação Animal. Nome, preço e estoque são dados de teste; não representam oferta de um item físico confirmado. Foto e marca não informadas.";
const NEW_TEST_DESCRIPTION = "Produto fictício para testar o catálogo da Nação Animal. Nome, preço, embalagem e estoque são demonstrativos e não representam uma oferta de mercadoria física. Imagem ilustrativa; marca não informada.";
const NEW_TEST_PRODUCTS = Object.freeze([
    { sku: "NA-TESTE-CAES-RACAO-01", categoria: "Cães", subcategoria: "racoes", nome: "[TESTE] Ração seca para cães 500 g", preco: 10, foto: "/images/products/petflow-prime-racao.jpg" },
    { sku: "NA-TESTE-CAES-UMIDA-01", categoria: "Cães", subcategoria: "racoes-umidas", nome: "[TESTE] Alimento úmido para cães 100 g", preco: 6, foto: "/images/products/wet-food.jpg" },
    { sku: "NA-TESTE-GATOS-RACAO-01", categoria: "Gatos", subcategoria: "racoes", nome: "[TESTE] Ração seca para gatos 500 g", preco: 10, foto: "/images/products/felis-prime-racao.jpg" },
    { sku: "NA-TESTE-GATOS-UMIDA-01", categoria: "Gatos", subcategoria: "racoes-umidas", nome: "[TESTE] Alimento úmido para gatos 85 g", preco: 6, foto: "/images/products/wet-cat-food.jpg" },
    { sku: "NA-TESTE-AVES-RACAO-01", categoria: "Aves", subcategoria: "racoes", nome: "[TESTE] Mistura de sementes para pássaros 300 g", preco: 6, foto: "/images/products/bird-food.jpg" },
    { sku: "NA-TESTE-ROEDORES-RACAO-01", categoria: "Roedores", subcategoria: "racoes", nome: "[TESTE] Ração para pequenos roedores 300 g", preco: 10, foto: "/images/products/rodent-food.jpg" },
    { sku: "NA-TESTE-PEIXES-RACAO-01", categoria: "Peixes", subcategoria: "racoes", nome: "[TESTE] Ração em flocos para peixes 20 g", preco: 6, foto: "/images/products/fish-food.jpg" },
    { sku: "NA-TESTE-JARDIM-TERRA-01", categoria: "Jardinagem", subcategoria: "terras-fertilizantes", nome: "[TESTE] Terra vegetal para plantas 1 kg", preco: 6, foto: "/images/products/garden-soil.jpg" },
    { sku: "NA-TESTE-JARDIM-FERT-01", categoria: "Jardinagem", subcategoria: "terras-fertilizantes", nome: "[TESTE] Fertilizante para plantas 100 g", preco: 10, foto: "/images/products/garden-fertilizer.jpg" },
    { sku: "NA-TESTE-JARDIM-VASO-01", categoria: "Jardinagem", subcategoria: "acessorios", nome: "[TESTE] Vaso pequeno para plantas", preco: 6, foto: "/images/products/garden-pot.jpg" },
    { sku: "NA-TESTE-JARDIM-REGADOR-01", categoria: "Jardinagem", subcategoria: "acessorios", nome: "[TESTE] Regador pequeno para jardim", preco: 10, foto: "/images/products/garden-watering-can.jpg" }
].map(item => Object.freeze({ ...item, quantidade: 5, descricao: NEW_TEST_DESCRIPTION })));
const TEST_PRODUCTS = Object.freeze([...LEGACY_TEST_PRODUCTS, ...NEW_TEST_PRODUCTS]);

function parseArgs(args) {
    if (args.some(arg => !["--apply", "--dry-run"].includes(arg)) || new Set(args).size !== args.length || args.length > 1) {
        throw new Error("Use node scripts/seed-test-products.js [--dry-run | --apply].");
    }
    return { apply: args.includes("--apply") };
}

function previewProducts() {
    return TEST_PRODUCTS.map(item => ({ sku: item.sku, categoria: item.categoria, subcategoria: item.subcategoria || null, nome: item.nome, preco: item.preco, estoque: item.quantidade }));
}

async function existingProduct(client, sku, empresaId) {
    const result = await client.query(
        `SELECT p.id,p.empresa_id,p.nome,p.preco,p.sku,c.nome AS categoria,
                COALESCE(e.quantidade,0)::int AS quantidade
         FROM produtos p
         LEFT JOIN categorias c ON c.id=p.categoria_id
         LEFT JOIN estoque e ON e.produto_id=p.id AND e.empresa_id=p.empresa_id
         WHERE p.sku=$1 LIMIT 1`, [sku]
    );
    const row = result.rows[0];
    if (row && row.empresa_id !== empresaId) {
        throw new Error("Um SKU de teste já pertence a outra empresa; nenhum registro foi alterado.");
    }
    return row;
}

function summary(row, resultado) {
    return { sku: row.sku, categoria: row.categoria, nome: row.nome, preco: Number(row.preco), estoque: Number(row.quantidade), resultado };
}

async function seedTestProducts(client, { expectedDatabase = "nacao-animal", products = TEST_PRODUCTS } = {}) {
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('nacao-animal/seed-test-products/v1'))");
        const context = await client.query(
            `SELECT current_database() AS database,
                    (SELECT id FROM empresas ORDER BY created_at ASC LIMIT 1) AS empresa_id`
        );
        if (context.rows[0]?.database !== expectedDatabase) {
            throw new Error("O banco conectado não corresponde a DB_EXPECTED_NAME; nenhum registro foi alterado.");
        }
        if (!context.rows[0]?.empresa_id) {
            throw new Error("Cadastre a loja antes dos produtos de teste; nenhuma empresa foi criada.");
        }
        const tenant = await client.query("SELECT get_petflow_empresa_id() AS id");
        const empresaId = tenant.rows[0]?.id;
        if (empresaId !== context.rows[0].empresa_id) throw new Error("A empresa pública mudou durante o cadastro; tente novamente.");

        const results = [];
        for (const item of products) {
            const existing = await existingProduct(client, item.sku, empresaId);
            if (existing) {
                results.push(summary(existing, "preservado"));
                continue;
            }
            await client.query(
                `INSERT INTO categorias (empresa_id,nome,descricao,status,ativo)
                 VALUES ($1,$2,'Categoria do catálogo da loja.',TRUE,TRUE)
                 ON CONFLICT (nome) DO NOTHING`, [empresaId, item.categoria]
            );
            const category = await client.query("SELECT id,empresa_id FROM categorias WHERE nome=$1 LIMIT 1", [item.categoria]);
            if (category.rows[0]?.empresa_id !== empresaId) {
                throw new Error("Uma categoria já pertence a outra empresa; nenhum registro foi alterado.");
            }
            const inserted = await client.query(
                `INSERT INTO produtos
                    (empresa_id,categoria_id,nome,descricao,sku,preco,custo,preco_venda,preco_custo,foto,marca,status,ativo,subcategoria)
                 VALUES ($1,$2,$3,$4,$5,$6,0,$6,0,$7,NULL,TRUE,TRUE,$8)
                 ON CONFLICT (sku) DO NOTHING RETURNING id`,
                [empresaId, category.rows[0].id, item.nome, item.descricao || TEST_DESCRIPTION, item.sku, item.preco, item.foto || null, item.subcategoria || null]
            );
            if (!inserted.rows[0]) {
                const concurrent = await existingProduct(client, item.sku, empresaId);
                if (!concurrent) throw new Error("O SKU mudou durante o cadastro; tente novamente.");
                results.push(summary(concurrent, "preservado"));
                continue;
            }
            const produtoId = inserted.rows[0].id;
            await client.query(
                `INSERT INTO estoque (empresa_id,produto_id,quantidade,estoque_minimo,estoque_maximo,localizacao)
                 VALUES ($1,$2,$3,0,$3,'Catálogo de testes')`,
                [empresaId, produtoId, item.quantidade]
            );
            await client.query(
                `INSERT INTO movimentacoes_estoque
                    (empresa_id,produto_id,tipo,quantidade,observacao,saldo_anterior,saldo_novo,referencia_tipo,referencia_id)
                 VALUES ($1,$2,'ENTRADA',$3,'Estoque inicial do catálogo de testes autorizado.',0,$3,'SEED_TESTES',$2)`,
                [empresaId, produtoId, item.quantidade]
            );
            await client.query(
                `INSERT INTO auditoria_admin (empresa_id,acao,entidade,entidade_id,descricao,dados_novos)
                 VALUES ($1,'CRIAR','PRODUTO',$2,'Produto e estoque iniciais de teste cadastrados por script.',$3::jsonb)`,
                [empresaId, produtoId, JSON.stringify({ sku: item.sku, nome: item.nome, preco: item.preco, quantidade: item.quantidade, subcategoria: item.subcategoria || null, origem: "seed-test-products" })]
            );
            results.push(summary(item, "cadastrado"));
        }
        await client.query("COMMIT");
        return results;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    }
}

async function main(args = process.argv.slice(2)) {
    const { apply } = parseArgs(args);
    if (!apply) {
        console.table(previewProducts());
        console.log("Prévia: nenhum banco foi acessado. Para cadastrar, execute node scripts/seed-test-products.js --apply.");
        return;
    }
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    const { buildDbOptions } = require("../config/dbOptions");
    const pool = new Pool({ ...buildDbOptions(), connectionTimeoutMillis: 10000 });
    let client;
    try {
        client = await pool.connect();
        const results = await seedTestProducts(client, { expectedDatabase: process.env.DB_EXPECTED_NAME || "nacao-animal" });
        console.table(results);
        console.log("Cadastro concluído. Produtos, preços e estoques preexistentes foram preservados. Nenhuma compra ou cobrança foi executada.");
    } finally {
        client?.release();
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error("Falha ao preparar produtos de teste:", error.code || error.name);
        if (/^(Use node|O banco conectado|Cadastre a loja|Um SKU de teste|Uma categoria|A empresa pública|O SKU mudou)/.test(error.message)) console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { LEGACY_TEST_PRODUCTS, NEW_TEST_PRODUCTS, TEST_PRODUCTS, TEST_DESCRIPTION, NEW_TEST_DESCRIPTION, parseArgs, previewProducts, seedTestProducts };
