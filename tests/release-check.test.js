"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { REQUIRED_MIGRATIONS, productionConfigurationChecks, configurationStatus } = require("../config/productionReadiness");
const { runReleaseChecks } = require("../scripts/release-check");

function productionEnv() {
    return {
        NODE_ENV: "production", JWT_SECRET: "1ca3385e66b641b9916b2b8852e48c95",
        JWT_EXPIRES_IN: "7d", APP_URL: "https://petflow.loja.com.br",
        RESEND_API_KEY: "re_credential", EMAIL_FROM: "PetFlow <contato@loja.com.br>",
        PAGSEGURO_BASE_URL: "https://api.pagseguro.com", PAGSEGURO_TOKEN: "production-credential",
        GOOGLE_MAPS_API_KEY: "server-map-key", GOOGLE_MAPS_BROWSER_API_KEY: "browser-map-key",
        CLOUDINARY_CLOUD_NAME: "petflow-shop", CLOUDINARY_API_KEY: "123456789", CLOUDINARY_API_SECRET: "image-credential"
    };
}

function readyDb(options = {}) {
    return { query: async sql => {
        if (sql.includes("to_regclass")) return { rows: [{ migrations: true, auditoria: true, reservas: true, lgpd: true, atendimento: true }] };
        if (sql.includes("FROM schema_migrations")) return { rows: REQUIRED_MIGRATIONS.filter(name => name !== options.missingMigration).map(nome => ({ nome })) };
        if (sql.includes("WITH loja")) return { rows: [{ empresas: 1, admins: 1, produtos: 2, estoques: 2, vendaveis: 1, ...options.catalog }] };
        if (sql.includes("AS pendentes")) return { rows: [{ pendentes: options.legalMissing || [] }] };
        throw new Error("Unexpected database query");
    } };
}

const failed = checks => checks.filter(check => !check.passed).map(check => check.name);

test("liberacao exige producao mesmo quando todas as credenciais estao preenchidas", () => {
    const env = productionEnv();
    assert.deepEqual(failed(productionConfigurationChecks(env, { cloudinaryConfigured: true })), []);
    for (const nodeEnv of ["development", "test", undefined]) {
        assert.ok(failed(productionConfigurationChecks({ ...env, NODE_ENV: nodeEnv })).includes("Modo de producao"));
    }
});

test("valores de exemplo e JWT repetido nunca aprovam integracoes", () => {
    const env = { ...productionEnv(), JWT_SECRET: "troque_por_uma_chave_forte_e_grande", RESEND_API_KEY: "sua_chave_resend", PAGSEGURO_TOKEN: "seu_token_pagseguro", CLOUDINARY_CLOUD_NAME: "seu_cloud_name", CLOUDINARY_API_KEY: "sua_api_key", CLOUDINARY_API_SECRET: "sua_api_secret" };
    const status = configurationStatus(productionConfigurationChecks(env, { cloudinaryConfigured: false }));
    assert.equal(status.configuracao, false);
    assert.equal(status.email, false);
    assert.equal(status.pagamento, false);
    assert.equal(status.imagens, false);
    assert.ok(failed(productionConfigurationChecks({ ...productionEnv(), JWT_SECRET: "a".repeat(64) })).includes("JWT forte"));
});

test("PagBank aceita somente origem de producao propria, sem caminhos ou credenciais", () => {
    for (const url of ["https://sandbox.api.pagseguro.com", "https://api.pagseguro.com.attacker.com", "http://api.pagseguro.com", "https://api.pagseguro.com/checkouts", "https://credential@api.pagseguro.com", "invalid"] ) {
        assert.ok(failed(productionConfigurationChecks({ ...productionEnv(), PAGSEGURO_BASE_URL: url })).includes("PagBank producao"), url);
    }
    assert.ok(!failed(productionConfigurationChecks({ ...productionEnv(), PAGSEGURO_BASE_URL: "https://api.pagseguro.com/" })).includes("PagBank producao"));
});

test("APP_URL local ou malformado e remetente invalido nao liberam a loja", () => {
    for (const url of ["http://petflow.loja.com.br", "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://example.com", "https://petflow.loja.com.br/?token=private", "https://credential@petflow.loja.com.br", "https://petflow.loja.com.br/app", "invalid"]) {
        assert.ok(failed(productionConfigurationChecks({ ...productionEnv(), APP_URL: url })).includes("APP_URL HTTPS publico"), url);
    }
    for (const sender of ["missing-address", "PetFlow <a@example.com>", "PetFlow <a@loja.test>"]) {
        assert.ok(failed(productionConfigurationChecks({ ...productionEnv(), EMAIL_FROM: sender })).includes("Remetente de e-mail"));
    }
});

test("a chave alternativa de frete implementada no servidor e aceita pela liberacao", () => {
    const env = { ...productionEnv(), GOOGLE_MAPS_API_KEY: undefined, GOOGLE_API_KEY: "alternative-map-key" };
    assert.equal(configurationStatus(productionConfigurationChecks(env)).frete, true);
    const output = JSON.stringify(productionConfigurationChecks(env));
    assert.ok(!output.includes("alternative-map-key"));
    assert.ok(!output.includes(env.JWT_SECRET));
    assert.ok(!output.includes(env.PAGSEGURO_TOKEN));
});

test("liberacao exige migracao Cloudinary e catalogo vendavel da loja", async () => {
    assert.deepEqual(failed(await runReleaseChecks(readyDb(), productionEnv(), { cloudinaryConfigured: true })), []);
    const pending = await runReleaseChecks(readyDb({ missingMigration: "113_cloudinary_assets.sql" }), productionEnv());
    assert.ok(failed(pending).includes("Migracao 113_cloudinary_assets.sql"));
    const unavailable = await runReleaseChecks(readyDb({ catalog: { admins: 0, estoques: 1, vendaveis: 0 }, legalMissing: ["numero", "CEP"] }), productionEnv());
    assert.ok(failed(unavailable).includes("Administrador da loja ativo"));
    assert.ok(failed(unavailable).includes("Estoque da loja cadastrado"));
    assert.ok(failed(unavailable).includes("Produtos disponiveis para venda"));
    assert.ok(failed(unavailable).includes("Dados publicos da loja"));
});

test("falha de banco bloqueia a liberacao sem expor mensagem ou URL de conexao", async () => {
    const db = { query: async () => { throw new Error("postgres://private-password@database/shop"); } };
    const checks = await runReleaseChecks(db, productionEnv());
    assert.ok(failed(checks).includes("Consulta PostgreSQL"));
    assert.doesNotMatch(JSON.stringify(checks), /private-password|postgres:\/\//);
});
