"use strict";

// Ferramenta exclusiva da demonstracao autorizada. Nao le nem altera o .env,
// nao replica dados locais e nao executa nada quando importada por testes.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { cli, target } = require("./configure-railway-demo");
const { TEST_PRODUCTS, TEST_DESCRIPTION, seedTestProducts } = require("./seed-test-products");

const ROOT = path.join(__dirname, "..");
const EXPECTED = Object.freeze({
    projectId: "69f7f38b-5d4c-4e40-9d7f-8417786a8883",
    environmentId: "05621372-8739-427e-9a5b-ce4bc49c815e",
    serviceId: "a258d23c-2278-4053-aae5-62fe5b0c4675",
    postgresId: "746e33f5-3596-4d17-b14c-12cadec7b071"
});
const LEGACY_PHOTO_FILES = Object.freeze([
    "test-dog-waste-bags.jpg", "test-cat-wand.jpg", "test-bird-perch.jpg",
    "test-aquarium-ornament.jpg", "test-rodent-chew.jpg", "test-pet-ball.jpg"
]);
const PHOTO_FILES = Object.freeze(TEST_PRODUCTS.map((product, index) =>
    product.foto ? path.basename(product.foto) : LEGACY_PHOTO_FILES[index]));
const AI_DESCRIPTION = "Imagem ilustrativa gerada por inteligencia artificial; marca nao informada.";
const LOCK = "nacao-animal/railway-demo-bootstrap/v1";

class BootstrapError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

function reject(code, message) { throw new BootstrapError(code, message); }

function parseArgs(args) {
    if (args.length > 1 || args.some(arg => !["--apply", "--dry-run"].includes(arg))) {
        reject("INVALID_ARGUMENTS", "Use node scripts/bootstrap-railway-demo-db.js [--dry-run | --apply].");
    }
    return { apply: args.includes("--apply") };
}

function assertTarget(state) {
    if (Object.keys(EXPECTED).some(key => target[key] !== EXPECTED[key])) {
        reject("UNEXPECTED_TARGET", "O destino fixo da demonstracao foi alterado.");
    }
    const environment = state?.environments?.edges?.find(edge => edge.node?.id === EXPECTED.environmentId)?.node;
    const services = environment?.serviceInstances?.edges?.map(edge => edge.node) || [];
    const app = services.find(service => service.serviceId === EXPECTED.serviceId);
    const postgres = services.find(service => service.serviceId === EXPECTED.postgresId);
    if (state?.id !== EXPECTED.projectId || !app || !postgres || app.serviceName !== "nacao-animal" ||
        postgres.serviceName !== "Postgres" || app.source?.repo !== "tiger-tech-br/nacao-animal") {
        reject("UNEXPECTED_TARGET", "Projeto, ambiente, servicos ou repositorio diferentes da demonstracao autorizada.");
    }
}

function resolved(value) { return typeof value === "string" && Boolean(value.trim()) && !value.includes("${{"); }

function validateRemoteContext(state, appVariables, postgresVariables) {
    assertTarget(state);
    if (appVariables?.PAYMENTS_ENABLED !== "false" || appVariables?.PAYMENT_ENVIRONMENT !== "sandbox") {
        reject("PAYMENTS_NOT_DISABLED", "A demonstracao precisa manter pagamentos desativados e ambiente sandbox.");
    }
    if (!resolved(postgresVariables?.PGDATABASE) || !resolved(appVariables?.DB_EXPECTED_NAME) ||
        postgresVariables.PGDATABASE !== appVariables.DB_EXPECTED_NAME) {
        reject("UNEXPECTED_DATABASE", "PGDATABASE e DB_EXPECTED_NAME remotos nao correspondem.");
    }
    const rawUrl = postgresVariables.DATABASE_PUBLIC_URL;
    let url;
    try { url = new URL(rawUrl); } catch { reject("INVALID_PUBLIC_URL", "O Postgres ainda nao possui uma URL publica valida."); }
    // O TCP proxy oficial identifica o servico PostgreSQL publico do Railway.
    // Nao aceitar URLs arbitrarias, loopback, rede privada ou enderecos internos.
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        !/^[a-z0-9-]+\.proxy\.rlwy\.net$/i.test(url.hostname) ||
        !url.port || Number(url.port) < 1 || Number(url.port) > 65535 ||
        !url.username || !url.password || url.search || url.hash) {
        reject("INVALID_PUBLIC_URL", "A URL deve usar o TCP proxy publico do PostgreSQL autorizado no Railway.");
    }
    let database;
    try { database = decodeURIComponent(url.pathname.slice(1)); }
    catch { reject("INVALID_PUBLIC_URL", "O nome do banco na URL publica e invalido."); }
    if (database !== postgresVariables.PGDATABASE) {
        reject("UNEXPECTED_DATABASE", "A URL publica nao aponta para o banco remoto esperado.");
    }
    for (const key of ["PGUSER", "PGPASSWORD"]) {
        if (!resolved(postgresVariables[key])) reject("INVALID_PUBLIC_URL", "Credenciais remotas do PostgreSQL ausentes.");
    }
    let user, password;
    try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
    catch { reject("INVALID_PUBLIC_URL", "As credenciais da URL publica sao invalidas."); }
    if (user !== postgresVariables.PGUSER || password !== postgresVariables.PGPASSWORD) {
        reject("INVALID_PUBLIC_URL", "As credenciais da URL publica nao correspondem ao PostgreSQL remoto.");
    }
    return { state, appVariables: { ...appVariables }, postgresVariables: { ...postgresVariables },
        databaseUrl: url.toString(), expectedDatabase: database };
}

function buildChildEnv(context, baseEnv = process.env) {
    const checked = validateRemoteContext(context.state, context.appVariables, context.postgresVariables);
    const env = {};
    // Herdar somente o ambiente do sistema operacional. Variaveis de banco,
    // admin e provedores do processo local nunca servem de fallback remoto.
    for (const [name, value] of Object.entries(baseEnv)) {
        if (/^(PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|LANG|LC_ALL)$/i.test(name)) env[name] = value;
    }
    for (const [name, value] of Object.entries(checked.appVariables)) {
        if (/^(NODE_OPTIONS|NODE_PATH|DOTENV_KEY|DOTENV_CONFIG_.*)$/i.test(name)) {
            reject("UNSAFE_CHILD_ENV", "Configuracao de execucao inesperada nas variaveis remotas.");
        }
        if (typeof value === "string") env[name] = value;
    }
    return { ...env, DATABASE_URL: checked.databaseUrl, POSTGRES_URL: checked.databaseUrl,
        DATABASE_PUBLIC_URL: checked.databaseUrl, DB_EXPECTED_NAME: checked.expectedDatabase,
        DB_NAME: checked.expectedDatabase, DB_SSL: "true", PAYMENTS_ENABLED: "false", PAYMENT_ENVIRONMENT: "sandbox" };
}

function runScript(scriptName, env, spawn = spawnSync) {
    if (!["migrate.js", "seed-admin.js"].includes(scriptName)) reject("UNEXPECTED_SCRIPT", "Script de preparacao nao permitido.");
    // Os scripts antigos usam dotenv.config(). Executa-los em uma pasta
    // temporaria vazia impede que leiam o .env do projeto como fallback.
    // Nenhum segredo e escrito nessa pasta; scripts e SQL usam caminhos absolutos.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nacao-animal-railway-db-"));
    let result;
    try {
        result = spawn(process.execPath, [path.join(__dirname, scriptName)], {
            cwd, env: { ...env }, encoding: "utf8", timeout: 180000,
            windowsHide: true, maxBuffer: 8 * 1024 * 1024
        });
    } finally {
        fs.rmdirSync(cwd);
    }
    // seed-admin imprime dados pessoais e erros de drivers podem incluir URLs.
    // Capturar e descartar toda a saida; somente os nomes SQL reconhecidos saem.
    if (result.error || result.status !== 0) reject("CHILD_SCRIPT_FAILED", "A preparacao do banco nao concluiu; a saida privada foi omitida.");
    if (scriptName !== "migrate.js") return [];
    return [...String(result.stdout || "").matchAll(/^(?:Aplicando|Ignorando) ([0-9]{3}_[a-z0-9_]+\.sql)(?:\.\.\.|: ja aplicado\.)$/gm)].map(match => match[1]);
}

function assertAdminCredentials(env) {
    if (!/^\S+@\S+\.\S+$/.test(env.ADMIN_EMAIL || "") || typeof env.ADMIN_PASSWORD !== "string" ||
        env.ADMIN_PASSWORD.length < 12 || !/[a-z]/.test(env.ADMIN_PASSWORD) || !/[A-Z]/.test(env.ADMIN_PASSWORD) ||
        !/\d/.test(env.ADMIN_PASSWORD) || !/[^A-Za-z0-9]/.test(env.ADMIN_PASSWORD)) {
        reject("ADMIN_CONFIGURATION_REQUIRED", "Configure as credenciais administrativas fortes no servico remoto antes da primeira inicializacao.");
    }
}

async function readCounts(client) {
    const result = await client.query(`SELECT
        (SELECT COUNT(*)::int FROM usuarios) AS usuarios,
        (SELECT COUNT(*)::int FROM usuarios WHERE perfil='ADMIN' AND ativo=TRUE) AS administradores,
        (SELECT COUNT(*)::int FROM produtos) AS produtos,
        (SELECT COUNT(*)::int FROM produtos WHERE foto IS NOT NULL) AS fotos,
        (SELECT COUNT(*)::int FROM clientes) AS clientes,
        (SELECT COUNT(*)::int FROM vendas) AS pedidos`);
    const row = result.rows[0] || {};
    const counts = {};
    for (const key of ["usuarios", "administradores", "produtos", "fotos", "clientes", "pedidos"]) {
        const value = Number(row[key]);
        if (!Number.isSafeInteger(value) || value < 0) reject("INVALID_COUNTS", "Nao foi possivel conferir as contagens do banco remoto.");
        counts[key] = value;
    }
    return counts;
}

async function assignMissingTestPhotos(client) {
    await client.query("BEGIN");
    try {
        for (let index = 0; index < TEST_PRODUCTS.length; index++) {
            const product = TEST_PRODUCTS[index];
            await client.query(`UPDATE produtos SET foto=$2,
                descricao=CASE WHEN POSITION($4 IN COALESCE(descricao,''))>0 THEN descricao
                    ELSE CONCAT_WS(' ', NULLIF(TRIM(REPLACE(COALESCE(descricao,''),$3,'')),''),$4) END
                WHERE sku=$1 AND foto IS NULL AND nome=$5
                    AND empresa_id=(SELECT id FROM empresas ORDER BY created_at ASC LIMIT 1)`,
            [product.sku, `/images/products/${PHOTO_FILES[index]}`, "Foto e marca não informadas.", AI_DESCRIPTION, product.nome]);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    }
}

async function prepareRemoteDatabase(context, { apply = false, runChild = runScript,
    createPool = options => new (require("pg").Pool)(options), seedProducts = seedTestProducts,
    verifyFixtures = () => PHOTO_FILES.every(file => fs.existsSync(path.join(ROOT, "public", "images", "products", file))) } = {}) {
    const checked = validateRemoteContext(context.state, context.appVariables, context.postgresVariables);
    if (!apply) return { modo: "conferir", destino: "demonstracao-railway", mutacoes: false };
    if (!verifyFixtures()) reject("MISSING_FIXTURES", "Uma imagem autorizada do catalogo demonstrativo esta ausente.");
    const env = buildChildEnv(checked);
    const pool = createPool({ connectionString: checked.databaseUrl, ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000, max: 1, query_timeout: 30000 });
    let client, locked = false;
    try {
        client = await pool.connect();
        const identity = await client.query("SELECT current_database() AS database,current_schema() AS schema");
        if (identity.rows[0]?.database !== checked.expectedDatabase || identity.rows[0]?.schema !== "public") {
            reject("UNEXPECTED_DATABASE", "A conexao nao corresponde ao banco e esquema remotos autorizados.");
        }
        const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [LOCK]);
        locked = lock.rows[0]?.locked === true;
        if (!locked) reject("BOOTSTRAP_BUSY", "Outra inicializacao demonstrativa ja esta em andamento.");
        const migrations = await runChild("migrate.js", env);
        let counts = await readCounts(client);
        if (counts.usuarios === 0) {
            assertAdminCredentials(env);
            await runChild("seed-admin.js", env);
            counts = await readCounts(client);
            if (!counts.administradores) reject("ADMIN_NOT_CREATED", "A criacao do administrador nao foi confirmada.");
        } else if (!counts.administradores) {
            reject("ADMIN_REVIEW_REQUIRED", "Existem usuarios sem administrador ativo; nenhuma senha foi redefinida.");
        }
        // Apenas a primeira inicializacao de um catalogo completamente vazio.
        // Um estoque consumido ou parcialmente cadastrado nunca e recomposto.
        if (counts.produtos === 0) await seedProducts(client, { expectedDatabase: checked.expectedDatabase });
        await assignMissingTestPhotos(client);
        return { modo: "aplicar", migracoesConferidas: migrations.length, contagens: await readCounts(client) };
    } finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK]).catch(() => {});
        client?.release();
        await pool.end();
    }
}

function loadRemoteContext(runCli = cli) {
    const state = runCli(["status", "--project", EXPECTED.projectId, "--environment", EXPECTED.environmentId, "--json"]);
    assertTarget(state);
    const variables = serviceId => runCli(["variable", "list", "--project", EXPECTED.projectId,
        "--service", serviceId, "--environment", EXPECTED.environmentId, "--json"]);
    return validateRemoteContext(state, variables(EXPECTED.serviceId), variables(EXPECTED.postgresId));
}

async function main(args = process.argv.slice(2)) {
    const options = parseArgs(args);
    const context = loadRemoteContext();
    const summary = await prepareRemoteDatabase(context, options);
    console.log(JSON.stringify(summary));
}

if (require.main === module) main().catch(error => {
    console.error(error instanceof BootstrapError ? `${error.code}: ${error.message}` : "BOOTSTRAP_FAILED: Falha ao preparar a demonstracao; detalhes privados foram omitidos.");
    process.exitCode = 1;
});

module.exports = { parseArgs, validateRemoteContext, buildChildEnv, runScript, readCounts,
    assignMissingTestPhotos, prepareRemoteDatabase, loadRemoteContext, main, PHOTO_FILES, AI_DESCRIPTION, TEST_DESCRIPTION };
