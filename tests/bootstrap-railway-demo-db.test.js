"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { target } = require("../scripts/configure-railway-demo");
const { TEST_PRODUCTS } = require("../scripts/seed-test-products");
const { parseArgs, validateRemoteContext, buildChildEnv, runScript, prepareRemoteDatabase,
    assignMissingTestPhotos, loadRemoteContext, PHOTO_FILES, AI_DESCRIPTION } = require("../scripts/bootstrap-railway-demo-db");

function fixtures() {
    const state = { id: target.projectId, environments: { edges: [{ node: {
        id: target.environmentId, serviceInstances: { edges: [
            { node: { serviceId: target.serviceId, serviceName: "nacao-animal", source: { repo: "tiger-tech-br/nacao-animal" } } },
            { node: { serviceId: target.postgresId, serviceName: "Postgres" } }
        ] }
    } }] } };
    const app = { DB_EXPECTED_NAME: "railway", PAYMENTS_ENABLED: "false", PAYMENT_ENVIRONMENT: "sandbox",
        ADMIN_EMAIL: "admin@example.invalid", ADMIN_PASSWORD: "Fixture-admin-1234!", ADMIN_NAME: "Fixture Admin",
        RESEND_API_KEY: "fixture-remote-mail-key", JWT_SECRET: "fixture-remote-secret" };
    const postgres = { PGDATABASE: "railway", PGUSER: "postgres", PGPASSWORD: "fixture password!",
        DATABASE_PUBLIC_URL: "postgresql://postgres:fixture%20password!@demo.proxy.rlwy.net:12345/railway" };
    return { state, app, postgres, context: () => validateRemoteContext(state, app, postgres) };
}

function fakeDatabase({ users = 0, admins = 0, products = [], database = "railway", schema = "public", locked = true } = {}) {
    const state = { users, admins, products: structuredClone(products), clients: 0, orders: 0 };
    const calls = [];
    const client = {
        released: false,
        async query(sql, values = []) {
            const text = sql.trim().replace(/\s+/g, " ");
            calls.push({ text, values });
            if (text.startsWith("SELECT current_database()")) return { rows: [{ database, schema }] };
            if (text.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ locked }] };
            if (text.startsWith("SELECT pg_advisory_unlock")) return { rows: [] };
            if (text.includes("AS usuarios,")) return { rows: [{ usuarios: state.users, administradores: state.admins,
                produtos: state.products.length, fotos: state.products.filter(item => item.foto != null).length,
                clientes: state.clients, pedidos: state.orders }] };
            if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
            if (text.startsWith("UPDATE produtos SET foto=")) {
                assert.match(text, /WHERE sku=\$1 AND foto IS NULL AND nome=\$5/);
                assert.match(text, /empresa_id=\(SELECT id FROM empresas/);
                for (const item of state.products) {
                    if (item.sku === values[0] && item.nome === values[4] && item.foto == null && !item.foreign) {
                        item.foto = values[1];
                        item.descricao = `${(item.descricao || "").replace(values[2], "").trim()} ${values[3]}`.trim();
                    }
                }
                return { rows: [] };
            }
            assert.fail(`Unexpected isolated query: ${text}`);
        },
        release() { this.released = true; }
    };
    const pool = { ended: false, async connect() { return client; }, async end() { this.ended = true; } };
    return { state, calls, client, pool };
}

test("importar o bootstrap nao executa CLI, subprocessos ou conexoes e flags ambiguas sao recusadas", () => {
    const result = execFileSync(process.execPath, ["-e", "require('./scripts/bootstrap-railway-demo-db');process.stdout.write('import-only')"], {
        encoding: "utf8", env: { ...process.env, DATABASE_URL: "invalid-local-url" }
    });
    assert.equal(result, "import-only");
    assert.deepEqual(parseArgs([]), { apply: false });
    assert.deepEqual(parseArgs(["--dry-run"]), { apply: false });
    assert.deepEqual(parseArgs(["--apply"]), { apply: true });
    for (const args of [["--apply", "--apply"], ["--force"], ["--apply", "--dry-run"]]) assert.throws(() => parseArgs(args), /Use node/);
});

test("identidade fixa de projeto, ambiente, app, PostgreSQL e repositorio e obrigatoria", () => {
    const mutations = [
        data => { data.state.id = "another-project"; },
        data => { data.state.environments.edges[0].node.id = "another-environment"; },
        data => { data.state.environments.edges[0].node.serviceInstances.edges[0].node.serviceId = "another-app"; },
        data => { data.state.environments.edges[0].node.serviceInstances.edges[1].node.serviceId = "another-postgres"; },
        data => { data.state.environments.edges[0].node.serviceInstances.edges[0].node.source.repo = "someone/another-repo"; },
        data => { data.state.environments.edges[0].node.serviceInstances.edges[0].node.serviceName = "other"; },
        data => { data.state.environments.edges[0].node.serviceInstances.edges[1].node.serviceName = "other"; }
    ];
    for (const mutate of mutations) {
        const data = fixtures(); mutate(data);
        assert.throws(data.context, { code: "UNEXPECTED_TARGET" });
    }
});

test("URL publica deve corresponder ao proxy e as credenciais do PostgreSQL remoto", () => {
    for (const url of [undefined, "not-a-url", "postgres://postgres:fixture@localhost:5432/railway",
        "postgres://postgres:fixture@127.0.0.1:5432/railway", "postgres://postgres:fixture@10.0.0.1:5432/railway",
        "postgres://postgres:fixture@postgres.railway.internal:5432/railway",
        "postgres://postgres:fixture@arbitrary.example:5432/railway", "https://demo.proxy.rlwy.net:1234/railway",
        "postgres://postgres:fixture@demo.proxy.rlwy.net/railway",
        "postgres://other:fixture%20password!@demo.proxy.rlwy.net:1234/railway",
        "postgres://postgres:wrong-password@demo.proxy.rlwy.net:1234/railway",
        "postgres://postgres:fixture%20password!@demo.proxy.rlwy.net:1234/wrong",
        "postgres://postgres:fixture%20password!@demo.proxy.rlwy.net:1234/railway?options=unsafe"]) {
        const data = fixtures(); data.postgres.DATABASE_PUBLIC_URL = url;
        assert.throws(data.context, /URL|proxy|banco remoto|credenciais/i);
    }
    const data = fixtures();
    assert.equal(data.context().expectedDatabase, "railway");
    for (const name of ["", "other", "${{Postgres.PGDATABASE}} "]) {
        data.app.DB_EXPECTED_NAME = name;
        assert.throws(data.context, { code: "UNEXPECTED_DATABASE" });
    }
});

test("pagamentos reais ou flags nao resolvidas impedem qualquer preparacao", () => {
    for (const values of [{ PAYMENTS_ENABLED: "true" }, { PAYMENT_ENVIRONMENT: "production" }, { PAYMENTS_ENABLED: "FALSE" }]) {
        const data = fixtures(); Object.assign(data.app, values);
        assert.throws(data.context, { code: "PAYMENTS_NOT_DISABLED" });
    }
});

test("ambiente filho usa apenas configuracao remota, SSL e banco esperado, sem alterar ambiente local", () => {
    const data = fixtures();
    const local = Object.freeze({ PATH: "fixture-system-path", SYSTEMROOT: "fixture-system-root",
        DB_PASSWORD: "local-password", ADMIN_EMAIL: "local@example.invalid", ADMIN_PASSWORD: "local-admin",
        NODE_OPTIONS: "--require=unsafe", DATABASE_URL: "postgres://local", RESEND_API_KEY: "local-mail-key", CUSTOM_LOCAL: "omit" });
    const before = structuredClone(process.env);
    const env = buildChildEnv(data.context(), local);
    assert.equal(env.PATH, local.PATH);
    assert.equal(env.ADMIN_EMAIL, data.app.ADMIN_EMAIL);
    assert.equal(env.ADMIN_PASSWORD, data.app.ADMIN_PASSWORD);
    assert.equal(env.RESEND_API_KEY, data.app.RESEND_API_KEY);
    assert.equal(env.DB_PASSWORD, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.CUSTOM_LOCAL, undefined);
    assert.equal(env.DB_SSL, "true");
    assert.equal(env.DB_NAME, "railway");
    assert.equal(env.DB_EXPECTED_NAME, "railway");
    assert.equal(new URL(env.DATABASE_URL).hostname, "demo.proxy.rlwy.net");
    assert.equal(JSON.stringify({ ...process.env }) === JSON.stringify(before), true, "O ambiente local deve permanecer inalterado.");
    for (const key of ["NODE_OPTIONS", "NODE_PATH", "DOTENV_KEY", "DOTENV_CONFIG_PATH"]) {
        const unsafe = fixtures(); unsafe.app[key] = "fixture";
        assert.throws(() => buildChildEnv(unsafe.context(), local), { code: "UNSAFE_CHILD_ENV" });
    }
});

test("subprocesso captura dados pessoais e segredos sem devolve-los nem usar argumentos de credenciais", () => {
    const env = buildChildEnv(fixtures().context(), {});
    let observed;
    const migrations = runScript("migrate.js", env, (exe, args, options) => {
        observed = { exe, args, options };
        assert.deepEqual(require("node:fs").readdirSync(options.cwd), []);
        assert.notEqual(options.cwd, process.cwd());
        return { status: 0, stdout: "Aplicando 001_extensions.sql...\nUsuario admin: private@example.invalid fixture-secret\nIgnorando 003_empresas.sql: ja aplicado.\n", stderr: "fixture-private-value" };
    });
    assert.deepEqual(migrations, ["001_extensions.sql", "003_empresas.sql"]);
    assert.equal(observed.exe, process.execPath);
    assert.equal(observed.args.length, 1);
    assert.ok(observed.args[0].endsWith("migrate.js"));
    assert.equal(observed.options.env.DATABASE_URL, env.DATABASE_URL);
    assert.deepEqual(runScript("seed-admin.js", env, () => ({ status: 0, stdout: "private@example.invalid" })), []);
    assert.throws(() => runScript("seed-admin.js", env, () => ({ status: 1, stderr: "postgres://private-secret@example.invalid" })), error => {
        assert.equal(error.code, "CHILD_SCRIPT_FAILED");
        assert.doesNotMatch(error.message, /private-secret|postgres:\/\//);
        return true;
    });
    assert.throws(() => runScript("seed-demo-clients.js", env), { code: "UNEXPECTED_SCRIPT" });
});

test("sem --apply nenhuma conexao, migracao, seed ou alteracao de fotos e executada", async () => {
    const result = await prepareRemoteDatabase(fixtures().context(), {
        createPool() { assert.fail("dry run must not connect"); },
        runChild() { assert.fail("dry run must not spawn"); },
        seedProducts() { assert.fail("dry run must not seed"); },
        verifyFixtures() { assert.fail("dry run must not need fixtures"); }
    });
    assert.deepEqual(result, { modo: "conferir", destino: "demonstracao-railway", mutacoes: false });
});

test("primeiro banco vazio recebe migracoes, um admin e os produtos aprovados com fotos e descricoes IA", async () => {
    const db = fakeDatabase();
    const scripts = [];
    let poolOptions;
    const result = await prepareRemoteDatabase(fixtures().context(), { apply: true,
        createPool(options) { poolOptions = options; return db.pool; },
        verifyFixtures: () => true,
        runChild(script, env) {
            scripts.push(script); assert.equal(env.DB_SSL, "true");
            if (script === "seed-admin.js") { db.state.users = 1; db.state.admins = 1; }
            return ["001_extensions.sql"];
        },
        async seedProducts(client, options) {
            assert.equal(client, db.client); assert.equal(options.expectedDatabase, "railway");
            db.state.products.push(...TEST_PRODUCTS.map(item => ({ ...item, foto: null,
                descricao: "Produto demonstrativo. Foto e marca não informadas." })));
        }
    });
    assert.deepEqual(poolOptions.ssl, { rejectUnauthorized: false });
    assert.deepEqual(scripts, ["migrate.js", "seed-admin.js"]);
    assert.deepEqual(result.contagens, { usuarios: 1, administradores: 1, produtos: TEST_PRODUCTS.length, fotos: TEST_PRODUCTS.length, clientes: 0, pedidos: 0 });
    assert.equal(PHOTO_FILES.length, TEST_PRODUCTS.length);
    assert.ok(PHOTO_FILES.every(file => typeof file === "string" && !file.includes("undefined")));
    assert.deepEqual(db.state.products.map(item => item.foto), PHOTO_FILES.map(file => `/images/products/${file}`));
    assert.ok(db.state.products.every(item => item.descricao.includes(AI_DESCRIPTION) && !item.descricao.includes("Foto e marca não informadas.")));
    assert.ok(!db.calls.some(call => /(?:INSERT|UPDATE|DELETE).*(?:clientes|vendas|estoque)/i.test(call.text)));
    assert.ok(db.client.released && db.pool.ended);
    assert.ok(db.calls.at(-1).text.includes("pg_advisory_unlock"));
});

test("admin existente conserva sua senha e catalogo parcial nunca e completado nem tem estoque reposto", async () => {
    const approved = TEST_PRODUCTS[0];
    const db = fakeDatabase({ users: 2, admins: 1, products: [
        { ...approved, foto: "/existing.jpg", descricao: "Original", quantidade: 1 },
        { sku: "unrelated", nome: "Outra mercadoria", foto: null, descricao: "Preservar", quantidade: 3 }
    ] });
    const before = structuredClone(db.state.products);
    const scripts = [];
    const data = fixtures(); delete data.app.ADMIN_PASSWORD;
    await prepareRemoteDatabase(data.context(), { apply: true, createPool: () => db.pool, verifyFixtures: () => true,
        runChild(name) { scripts.push(name); return []; },
        seedProducts() { assert.fail("existing products must not seed"); }
    });
    assert.deepEqual(scripts, ["migrate.js"]);
    assert.deepEqual(db.state.products, before);
});

test("foto NULL so e preenchida para os seis SKUs com nomes aprovados e mesma empresa", async () => {
    const db = fakeDatabase({ users: 1, admins: 1, products: [
        { ...TEST_PRODUCTS[0], foto: null, descricao: "Texto existente" },
        { ...TEST_PRODUCTS[1], nome: "Nome alterado", foto: null, descricao: "Preservar" },
        { ...TEST_PRODUCTS[2], foreign: true, foto: null, descricao: "Outra empresa" }
    ] });
    await assignMissingTestPhotos(db.client);
    assert.equal(db.state.products[0].foto, "/images/products/test-dog-waste-bags.jpg");
    assert.ok(db.state.products[0].descricao.startsWith("Texto existente"));
    assert.equal(db.state.products[1].foto, null);
    assert.equal(db.state.products[2].foto, null);
});

test("usuarios sem administrador ativo exigem orientacao e nenhuma senha e redefinida", async () => {
    const db = fakeDatabase({ users: 1, admins: 0 });
    const scripts = [];
    await assert.rejects(prepareRemoteDatabase(fixtures().context(), { apply: true, createPool: () => db.pool, verifyFixtures: () => true,
        runChild(name) { scripts.push(name); return []; }, seedProducts() { assert.fail("must not seed"); }
    }), { code: "ADMIN_REVIEW_REQUIRED" });
    assert.deepEqual(scripts, ["migrate.js"]);
    assert.ok(!db.calls.some(call => call.text.startsWith("UPDATE")));
    assert.ok(db.client.released && db.pool.ended);
});

test("credenciais remotas ausentes nunca usam o administrador local como fallback", async () => {
    const db = fakeDatabase();
    const data = fixtures(); delete data.app.ADMIN_PASSWORD;
    const scripts = [];
    await assert.rejects(prepareRemoteDatabase(data.context(), { apply: true, createPool: () => db.pool, verifyFixtures: () => true,
        runChild(name) { scripts.push(name); return []; }
    }), { code: "ADMIN_CONFIGURATION_REQUIRED" });
    assert.deepEqual(scripts, ["migrate.js"]);
});

test("conexao com banco ou esquema inesperado e inicializacao concorrente interrompem antes das migracoes", async () => {
    for (const options of [{ database: "nacao-animal" }, { schema: "private" }, { locked: false }]) {
        const db = fakeDatabase(options);
        await assert.rejects(prepareRemoteDatabase(fixtures().context(), { apply: true, createPool: () => db.pool, verifyFixtures: () => true,
            runChild() { assert.fail("guard must precede migration"); }, seedProducts() { assert.fail("guard must precede seed"); }
        }), /conexao|andamento/i);
        assert.ok(db.client.released && db.pool.ended);
        assert.ok(!db.calls.some(call => /^(UPDATE|INSERT|DELETE|BEGIN)/.test(call.text)));
    }
});

test("falha de seed libera lock e conexao; imagem ausente interrompe antes de conectar", async () => {
    const db = fakeDatabase({ users: 1, admins: 1 });
    await assert.rejects(prepareRemoteDatabase(fixtures().context(), { apply: true, createPool: () => db.pool, verifyFixtures: () => true,
        runChild: () => [], seedProducts() { throw new Error("fixture failure"); }
    }), /fixture failure/);
    assert.ok(db.client.released && db.pool.ended);
    assert.ok(db.calls.at(-1).text.includes("pg_advisory_unlock"));
    await assert.rejects(prepareRemoteDatabase(fixtures().context(), { apply: true, verifyFixtures: () => false,
        createPool() { assert.fail("missing fixture must not connect"); }
    }), { code: "MISSING_FIXTURES" });
});

test("CLI e exclusivamente leitura com IDs fixos e identidade errada nao chega as variaveis", () => {
    const data = fixtures(); const calls = [];
    const context = loadRemoteContext(args => {
        calls.push(args);
        if (args[0] === "status") return data.state;
        return args.includes(target.serviceId) ? data.app : data.postgres;
    });
    assert.equal(context.expectedDatabase, "railway");
    assert.equal(calls.length, 3);
    assert.ok(calls.every(args => args.includes(target.projectId) && args.includes(target.environmentId) && args.includes("--json")));
    data.state.id = "wrong";
    assert.throws(() => loadRemoteContext(args => { assert.equal(args[0], "status"); return data.state; }), { code: "UNEXPECTED_TARGET" });
});
