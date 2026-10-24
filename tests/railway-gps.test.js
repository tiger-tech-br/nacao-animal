"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const { target } = require("../scripts/configure-railway-demo");
const { parseArgs, publicStoreAddress, runChecks, main } = require("../scripts/check-railway-gps");

const origin = `https://${target.domain}`;
const browserKey = `AIza${"b".repeat(35)}`, serverKey = `AIza${"s".repeat(35)}`;
const csp = "default-src 'self'; script-src 'self' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.gstatic.com";
const address = { endereco: "Avenida Publica", numero: "100", bairro: "Centro", cidade: "Santo André", estado: "SP", cep: "09060-820", email: "never-use@example.invalid", telefone: "never-use" };

function fixture({ mutateState, variables: override = {}, responses = {}, quote } = {}) {
    const state = { id: target.projectId, environments: { edges: [{ node: {
        id: target.environmentId, serviceInstances: { edges: [{ node: {
            serviceId: target.serviceId, serviceName: "nacao-animal", source: { repo: "tiger-tech-br/nacao-animal" },
            domains: { serviceDomains: [{ domain: target.domain }] }
        } }] }
    } }] } };
    mutateState?.(state);
    const variables = { GOOGLE_MAPS_BROWSER_API_KEY: browserKey, GOOGLE_MAPS_API_KEY: serverKey, APP_URL: origin,
        DATABASE_URL: "postgres://private-credentials@private-db/railway", JWT_SECRET: "private-session-secret", ...override };
    const cliCalls = [], fetchCalls = [];
    const cliImpl = args => {
        cliCalls.push(args);
        if (args[0] === "status") return state;
        if (args[0] === "variable" && args[1] === "list") return variables;
        assert.fail("Only read-only CLI calls allowed");
    };
    const fetchImpl = async (url, options) => {
        fetchCalls.push({ url, options });
        assert.equal(new URL(url).origin, origin);
        if (new URL(url).pathname === "/api/public/frete/cotar") {
            assert.ok(quote, "No shipping/Google call in default diagnostic");
            return { url, redirected: false, ...await quote(url, options) };
        }
        assert.equal(options.method, "GET");
        assert.equal(options.redirect, "manual");
        assert.equal(options.headers, undefined, "No credentials on public requests");
        const path = new URL(url).pathname;
        let body = path === "/api/health" ? { success: true, status: "ok", database: "connected" }
            : path === "/api/public/entregas/mapa-config" ? { success: true, data: { browserKey } }
            : path === "/api/public/loja" ? { success: true, data: address } : {};
        const headerValues = { "content-security-policy": csp, "referrer-policy": "strict-origin-when-cross-origin", "cache-control": "no-store" };
        const override = responses[path] || {};
        if (Object.hasOwn(override, "body")) body = override.body;
        return { status: 200, url, redirected: false, ...override,
            headers: { get: name => ({ ...headerValues, ...(override.headers || {}) })[name] || null }, json: async () => body };
    };
    return { cliImpl, fetchImpl, cliCalls, fetchCalls, variables };
}

function assertNoSecrets(report) {
    const output = JSON.stringify(report);
    for (const secret of [browserKey, serverKey, "private-session-secret", "private-credentials", address.endereco, address.email, address.telefone]) assert.ok(!output.includes(secret));
}

test("importar diagnostico nao carrega .env, banco, servico de frete nem executa a CLI", () => {
    const output = execFileSync(process.execPath, ["-e", "require('./scripts/check-railway-gps');if(Object.keys(require.cache).some(p=>/[\\\\/]config[\\\\/]env\\.js$/.test(p)))throw Error('env loaded');process.stdout.write('import-only')"], { encoding: "utf8" });
    assert.equal(output, "import-only");
    assert.deepEqual(parseArgs([]), { probeRoutes: false });
    assert.deepEqual(parseArgs(["--probe-routes"]), { probeRoutes: true });
    for (const args of [["--apply"], ["--probe-routes", "--probe-routes"], ["--force"]]) assert.throws(() => parseArgs(args), { code: "INVALID_ARGUMENTS" });
});

test("diagnostico padrao confere destino, headers e chaves sem Google, SQL, mutacao ou segredos na saida", async () => {
    const environmentHash = () => crypto.createHash("sha256").update(JSON.stringify({ ...process.env })).digest("hex");
    const h = fixture(), before = structuredClone(h.variables), processBefore = environmentHash();
    const report = await runChecks([], h);
    assert.equal(report.success, true);
    assert.equal(h.cliCalls.length, 2);
    assert.equal(h.fetchCalls.length, 5);
    assert.equal(report.routes.performed, false);
    assert.equal(report.routes.status, "not_requested");
    assert.deepEqual(report.mapsJavaScript, { authorizationVerified: false, status: "manual_browser_validation_required" });
    assert.equal(report.gpsHardwareVerified, false);
    assert.deepEqual(h.variables, before);
    assert.ok(environmentHash() === processBefore, "Global environment remains unchanged");
    assertNoSecrets(report);
});

test("projeto, ambiente, servico, repositorio e dominio devem corresponder ao destino fixo antes de ler variaveis", async () => {
    const mutations = [
        state => { state.id = "other"; },
        state => { state.environments.edges[0].node.id = "other"; },
        state => { state.environments.edges[0].node.serviceInstances.edges[0].node.serviceId = "other"; },
        state => { state.environments.edges[0].node.serviceInstances.edges[0].node.serviceName = "other"; },
        state => { state.environments.edges[0].node.serviceInstances.edges[0].node.source.repo = "other/repo"; },
        state => { state.environments.edges[0].node.serviceInstances.edges[0].node.domains.serviceDomains = []; }
    ];
    for (const mutateState of mutations) {
        const h = fixture({ mutateState });
        await assert.rejects(runChecks([], h), { code: "UNEXPECTED_TARGET" });
        assert.equal(h.cliCalls.length, 1);
        assert.equal(h.fetchCalls.length, 0);
    }
});

test("chave repetida, ausente, formato invalido ou APP_URL local impedem probe pago", async () => {
    for (const variables of [{ GOOGLE_MAPS_API_KEY: browserKey }, { GOOGLE_MAPS_BROWSER_API_KEY: "" },
        { GOOGLE_MAPS_API_KEY: "unresolved-${{reference}}" }, { APP_URL: "http://localhost:4600" }]) {
        const h = fixture({ variables });
        const report = await runChecks(["--probe-routes"], h);
        assert.equal(report.success, false);
        assert.deepEqual(report.routes, { performed: false, status: "failed", code: "KEY_CONFIGURATION_INVALID" });
        assert.equal(h.fetchCalls.length, 5);
        assertNoSecrets(report);
    }
});

test("configuracao publica deve expor apenas chave de navegador correta sem cache", async () => {
    for (const body of [{ success: true, data: { browserKey: "different" } }, { success: true, data: { browserKey, leakedKey: serverKey } }]) {
        const h = fixture({ responses: { "/api/public/entregas/mapa-config": { body } } });
        const report = await runChecks([], h);
        assert.equal(report.success, false);
        assertNoSecrets(report);
    }
    const h = fixture({ responses: { "/api/public/entregas/mapa-config": { headers: { "cache-control": "max-age=3600" } } } });
    assert.equal((await runChecks([], h)).endpoints.mapConfig.noStore, false);
});

test("mapas exigem CSP e referrer corretos nas tres paginas", async () => {
    for (const path of ["/entregador", "/acompanhar-entrega", "/admin/acompanhar-entrega"]) {
        const report = await runChecks([], fixture({ responses: { [path]: { headers: { "content-security-policy": "default-src 'self'", "referrer-policy": "no-referrer" } } } }));
        assert.equal(report.success, false);
    }
});

test("redirecionamento publico nao e seguido e origem HTTP ou externa nao e aceita", async () => {
    for (const override of [{ status: 302 }, { url: "http://localhost/entregador" }, { url: "https://other.example/entregador", redirected: true }]) {
        const report = await runChecks([], fixture({ responses: { "/entregador": override } }));
        assert.equal(report.success, false);
        assert.equal(report.endpoints.driver.ok, false);
    }
});

test("health conectado mas migracoes pendentes nao e considerado saudavel", async () => {
    const report = await runChecks([], fixture({ responses: { "/api/health": { status: 503, body: { success: false, status: "migrations_pending", database: "connected" } } } }));
    assert.equal(report.endpoints.health.databaseConnected, true);
    assert.equal(report.endpoints.health.healthy, false);
    assert.equal(report.success, false);
});

test("probe faz uma cotacao anonima no Railway com endereco publico loja, sem chave, GPS ou cliente", async () => {
    let calls = 0;
    const h = fixture({ quote: async (url, options) => {
        calls++;
        assert.equal(url, `${origin}/api/public/frete/cotar`);
        assert.equal(options.method, "POST");
        assert.equal(options.redirect, "manual");
        assert.deepEqual(options.headers, { "Content-Type": "application/json" });
        assert.ok(!JSON.stringify(options).includes(serverKey));
        assert.ok(!JSON.stringify(options).includes(browserKey));
        const body = JSON.parse(options.body);
        assert.deepEqual(body, { endereco: { endereco: address.endereco, numero: "100", bairro: "Centro", cidade: "Santo André", estado: "SP", cep: "09060820" } });
        assert.ok(!options.body.includes(address.email));
        return { status: 200, json: async () => ({ success: true, data: { distanciaMetros: 0, valor: 0, token: "never-display-quote-token" } }) };
    } });
    const report = await runChecks(["--probe-routes"], h);
    assert.equal(calls, 1);
    assert.equal(report.success, true);
    assert.deepEqual(report.routes, { performed: true, status: "ok", httpStatus: 200, distanceMeters: 0, value: 0, providerReached: true, authorizationValidated: true });
    assert.ok(!JSON.stringify(report).includes("never-display-quote-token"));
    assert.equal(report.mapsJavaScript.authorizationVerified, false);
    assertNoSecrets(report);
});

test("cotacao recusada retorna somente HTTP e codigo local sem mensagem ou token privados", async () => {
    const report = await runChecks(["--probe-routes"], fixture({ quote: async () => ({ status: 503, json: async () => ({
        success: false, message: `secret ${serverKey} ${address.endereco}`, token: "never-display-quote-token"
    }) }) }));
    assert.deepEqual(report.routes, { performed: true, status: "failed", httpStatus: 503, code: "REMOTE_QUOTE_FAILED" });
    assertNoSecrets(report);
    assert.ok(!JSON.stringify(report).includes("never-display-quote-token"));
});

test("HTTP422 sem rota valida confirma acesso Routes pelo contrato, sem confundir com zero normalizado ou GPS valido", async () => {
    const report = await runChecks(["--probe-routes"], fixture({ quote: async () => ({ status: 422,
        json: async () => ({ success: false, message: `upstream private ${serverKey}` }) }) }));
    assert.deepEqual(report.routes, { performed: true, status: "inconclusive", httpStatus: 422,
        code: "REMOTE_QUOTE_NO_ROUTE", providerReached: true, authorizationValidated: true });
    assert.equal(report.success, false);
    assert.equal(report.gpsHardwareVerified, false);
    assert.equal(report.mapsJavaScript.authorizationVerified, false);
    assertNoSecrets(report);
    const redirected = await runChecks(["--probe-routes"], fixture({ quote: async () => ({ status: 422,
        redirected: true, json: async () => ({ success: false }) }) }));
    assert.equal(redirected.routes.code, "REMOTE_QUOTE_FAILED");
    assert.equal(redirected.routes.authorizationValidated, undefined);
});

test("cotacao com redirecionamento ou origem externa e recusada", async () => {
    for (const response of [{ status: 302 }, { status: 200, redirected: true }, { status: 200, url: "https://other.example/quote" }]) {
        const report = await runChecks(["--probe-routes"], fixture({ quote: async () => ({ ...response, json: async () => ({ success: true, data: { distanciaMetros: 0, valor: 0 } }) }) }));
        assert.equal(report.routes.code, "REMOTE_QUOTE_FAILED");
        assert.equal(report.success, false);
    }
});

test("falha de rede ou cotacao incompleta nao simula rota e nao imprime erro bruto", async () => {
    for (const quote of [async () => { throw new Error(serverKey); },
        async () => ({ status: 200, json: async () => ({ data: {} }) }),
        async () => ({ status: 200, json: async () => ({ success: true, data: { distanciaMetros: 0, valor: "0" } }) }),
        async () => ({ status: 403, json: async () => ({ error: { status: serverKey, details: [{ reason: serverKey }] } }) })]) {
        const report = await runChecks(["--probe-routes"], fixture({ quote }));
        assert.equal(report.success, false);
        assertNoSecrets(report);
    }
});

test("endereco publico incompleto impede chamada Google", async () => {
    assert.equal(publicStoreAddress({ ...address, numero: null }), null);
    assert.equal(publicStoreAddress({ ...address, cep: "abc" }), null);
    assert.equal(publicStoreAddress({ ...address, endereco: { object: true } }), null);
    const h = fixture({ responses: { "/api/public/loja": { body: { success: true, data: { nome: "Loja sem endereco" } } } } });
    const report = await runChecks(["--probe-routes"], h);
    assert.equal(report.routes.code, "PUBLIC_STORE_ADDRESS_INVALID");
    assert.equal(report.routes.performed, false);
    assert.equal(h.fetchCalls.length, 6);
});

test("main sanitiza erros de CLI e flags antes de imprimir resultado", async () => {
    const printed = [], originalLog = console.log;
    console.log = value => printed.push(value);
    try {
        const report = await main([], { cliImpl() { throw new Error(`${serverKey} private-credentials`); } });
        assert.deepEqual(report, { success: false, code: "RAILWAY_READ_FAILED" });
        assert.equal(printed.length, 1);
        assert.ok(!printed[0].includes(serverKey));
        const badArgs = await main(["--apply"], { cliImpl() { assert.fail("Must not call CLI"); } });
        assert.equal(badArgs.code, "INVALID_ARGUMENTS");
    } finally { console.log = originalLog; }
});
