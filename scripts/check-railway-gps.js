"use strict";

// Diagnostico somente leitura da demonstracao autorizada. Nao le .env, nao
// recebe credenciais por argumentos e nao cria pedidos, GPS ou dados no banco.
const { cli, target } = require("./configure-railway-demo");
const KEY_PATTERN = /^AIza[A-Za-z0-9_-]{35}$/;
const PUBLIC_PATHS = {
    health: "/api/health", driver: "/entregador", customerTracking: "/acompanhar-entrega",
    adminTracking: "/admin/acompanhar-entrega", mapConfig: "/api/public/entregas/mapa-config"
};
const origin = `https://${target.domain}`;
const diagnosticError = code => Object.assign(new Error(code), { code });

function parseArgs(args) {
    if (args.length > 1 || args.some(arg => arg !== "--probe-routes")) throw diagnosticError("INVALID_ARGUMENTS");
    return { probeRoutes: args.includes("--probe-routes") };
}

function validateRemoteContext(state) {
    const environment = state?.environments?.edges?.find(item => item.node?.id === target.environmentId)?.node;
    const app = environment?.serviceInstances?.edges?.find(item => item.node?.serviceId === target.serviceId)?.node;
    if (state?.id !== target.projectId || !app || app.serviceName !== "nacao-animal" ||
        app.source?.repo !== "tiger-tech-br/nacao-animal" ||
        !app.domains?.serviceDomains?.some(item => item.domain === target.domain)) throw diagnosticError("UNEXPECTED_TARGET");
}

function loadRemoteContext(cliImpl = cli) {
    let state, variables;
    try { state = cliImpl(["status", "--project", target.projectId, "--environment", target.environmentId, "--json"]); }
    catch { throw diagnosticError("RAILWAY_READ_FAILED"); }
    validateRemoteContext(state);
    try { variables = cliImpl(["variable", "list", "--project", target.projectId, "--service", target.serviceId, "--environment", target.environmentId, "--json"]); }
    catch { throw diagnosticError("RAILWAY_READ_FAILED"); }
    if (!variables || typeof variables !== "object" || Array.isArray(variables)) throw diagnosticError("RAILWAY_VARIABLES_INVALID");
    return variables;
}

function keyStatus(variables) {
    const browser = typeof variables.GOOGLE_MAPS_BROWSER_API_KEY === "string" ? variables.GOOGLE_MAPS_BROWSER_API_KEY.trim() : "";
    const server = typeof variables.GOOGLE_MAPS_API_KEY === "string" ? variables.GOOGLE_MAPS_API_KEY.trim() : "";
    const fallback = typeof variables.GOOGLE_API_KEY === "string" ? variables.GOOGLE_API_KEY.trim() : "";
    return { browser, server: server || fallback, report: {
        browserConfigured: Boolean(browser), serverConfigured: Boolean(server || fallback),
        browserFormatValid: KEY_PATTERN.test(browser), serverFormatValid: KEY_PATTERN.test(server || fallback),
        distinct: Boolean(browser && (server || fallback) && browser !== (server || fallback)),
        appOriginCorrect: typeof variables.APP_URL === "string" && variables.APP_URL.replace(/\/+$/, "") === origin
    } };
}

async function publicGet(path, fetchImpl) {
    const url = origin + path;
    try {
        const response = await fetchImpl(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) });
        const https = response.url === url && !response.redirected;
        const report = { status: Number.isInteger(response.status) ? response.status : 0, https, ok: response.status === 200 && https };
        return { response, report };
    } catch { return { report: { status: 0, https: false, ok: false, code: "PUBLIC_REQUEST_FAILED" } }; }
}

function mapPageHeaders(response) {
    const csp = response?.headers?.get("content-security-policy") || "";
    const script = csp.split(";").find(part => /^\s*script-src\s/.test(part)) || "";
    const connect = csp.split(";").find(part => /^\s*connect-src\s/.test(part)) || "";
    return {
        mapsScriptsAllowed: /(?:^|\s)https:\/\/maps\.googleapis\.com(?:\s|$)/.test(script) &&
            /(?:^|\s)https:\/\/maps\.gstatic\.com(?:\s|$)/.test(script),
        mapsConnectionsAllowed: /(?:^|\s)https:\/\/(?:\*\.|maps\.)googleapis\.com(?:\s|$)/.test(connect) &&
            /(?:^|\s)https:\/\/(?:\*\.|maps\.)gstatic\.com(?:\s|$)/.test(connect),
        mapsEvaluationAllowed: /(?:^|\s)'unsafe-eval'(?:\s|$)/.test(script),
        referrerPolicyCorrect: response?.headers?.get("referrer-policy") === "strict-origin-when-cross-origin"
    };
}

async function jsonBody(response) {
    try { return await response?.json(); } catch { return null; }
}

function publicStoreAddress(store) {
    const fields = ["endereco", "numero", "bairro", "cidade", "estado", "cep"];
    if (!store || typeof store !== "object" || fields.some(field => typeof store[field] !== "string" || !store[field].trim() || store[field].length > 200)) return null;
    const address = Object.fromEntries(fields.map(field => [field, store[field].trim()]));
    address.cep = address.cep.replace(/\D/g, "");
    address.estado = address.estado.toUpperCase();
    if (!/^\d{8}$/.test(address.cep) || !/^[A-Z]{2}$/.test(address.estado)) return null;
    return address;
}

async function probeRoutes(fetchImpl) {
    const shop = await publicGet("/api/public/loja", fetchImpl);
    if (!shop.report.ok) return { performed: false, status: "failed", code: "PUBLIC_STORE_UNAVAILABLE" };
    const body = await jsonBody(shop.response);
    const address = body?.success === true && publicStoreAddress(body.data);
    if (!address) return { performed: false, status: "failed", code: "PUBLIC_STORE_ADDRESS_INVALID" };
    let response, payload;
    try {
        response = await fetchImpl(`${origin}/api/public/frete/cotar`, {
            method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json" },
            // Opt-in: uma cotacao anonima usa somente o endereco publico da loja.
            // A Routes API e chamada pelo Railway, validando sua conectividade e
            // IP de saida. Nao cria pedido/cliente, nao envia chaves nem comprova
            // o GPS fisico ou a autorizacao de Maps JavaScript no navegador.
            body: JSON.stringify({ endereco: address })
        });
        payload = await jsonBody(response);
    } catch { return { performed: true, status: "failed", code: "REMOTE_QUOTE_NETWORK_FAILED" }; }
    const httpStatus = Number.isInteger(response.status) ? response.status : 0;
    if (response.redirected || response.url !== `${origin}/api/public/frete/cotar`)
        return { performed: true, status: "failed", httpStatus, code: "REMOTE_QUOTE_FAILED" };
    // No contrato atual de freteService.quote, 422 so ocorre depois de Google
    // HTTP 200 sem rota/distancia valida. O inteiro zero omitido pelo proto e
    // normalizado pelo servico e retorna HTTP 200; nao explica mais um 422.
    // Esse 422 confirma acesso/autorizacao, mas nao uma rota utilizavel, mapa
    // ou GPS de entrega. A saida nao infere a causa pela mensagem do provedor.
    if (response.status === 422) return { performed: true, status: "inconclusive", httpStatus,
        code: "REMOTE_QUOTE_NO_ROUTE", providerReached: true, authorizationValidated: true };
    if (response.status !== 200)
        return { performed: true, status: "failed", httpStatus, code: "REMOTE_QUOTE_FAILED" };
    const distanceMeters = payload?.data?.distanciaMetros, value = payload?.data?.valor;
    if (payload?.success !== true || !Number.isInteger(distanceMeters) || distanceMeters < 0 || !Number.isFinite(value) || value < 0)
        return { performed: true, status: "inconclusive", httpStatus, code: "REMOTE_QUOTE_RESPONSE_INVALID" };
    // O token de cotacao e qualquer mensagem recebida ficam fora do relatorio.
    return { performed: true, status: "ok", httpStatus, distanceMeters, value,
        providerReached: true, authorizationValidated: true };
}

async function runChecks(args = [], { cliImpl = cli, fetchImpl = global.fetch } = {}) {
    const { probeRoutes: requested } = parseArgs(args);
    const variables = loadRemoteContext(cliImpl);
    const keys = keyStatus(variables);
    const results = await Promise.all(Object.entries(PUBLIC_PATHS).map(async ([name, path]) => [name, await publicGet(path, fetchImpl)]));
    const endpoints = {};
    for (const [name, result] of results) {
        endpoints[name] = result.report;
        if (["driver", "customerTracking", "adminTracking"].includes(name)) Object.assign(endpoints[name], mapPageHeaders(result.response));
        if (name === "health") {
            const body = await jsonBody(result.response);
            endpoints[name].databaseConnected = body?.database === "connected";
            endpoints[name].healthy = body?.success === true && body?.status === "ok";
        }
        if (name === "mapConfig") {
            const body = await jsonBody(result.response);
            endpoints[name].browserKeyMatches = Boolean(keys.browser && body?.success === true && body?.data?.browserKey === keys.browser);
            endpoints[name].serverKeyNotExposed = Boolean(keys.server && body && !JSON.stringify(body).includes(keys.server));
            endpoints[name].noStore = /(?:^|,)\s*no-store(?:\s|,|$)/.test(result.response?.headers?.get("cache-control") || "");
        }
    }
    let routes = { performed: false, status: "not_requested" };
    if (requested) routes = Object.values(keys.report).every(Boolean)
        ? await probeRoutes(fetchImpl)
        : { performed: false, status: "failed", code: "KEY_CONFIGURATION_INVALID" };
    const endpointReady = Object.values(endpoints).every(result => result.ok && Object.values(result).every(value => typeof value !== "boolean" || value));
    return { success: Object.values(keys.report).every(Boolean) && endpointReady && (!requested || routes.status === "ok"),
        targetVerified: true, mode: "read_only", keys: keys.report, endpoints,
        mapsJavaScript: { authorizationVerified: false, status: "manual_browser_validation_required" },
        gpsHardwareVerified: false, routes };
}

async function main(args = process.argv.slice(2), dependencies) {
    let report;
    try { report = await runChecks(args, dependencies); }
    catch (error) {
        const allowed = new Set(["INVALID_ARGUMENTS", "UNEXPECTED_TARGET", "RAILWAY_READ_FAILED", "RAILWAY_VARIABLES_INVALID"]);
        report = { success: false, code: allowed.has(error?.code) ? error.code : "GPS_DIAGNOSTIC_FAILED" };
    }
    console.log(JSON.stringify(report));
    return report;
}

if (require.main === module) main().then(report => { if (!report.success) process.exitCode = 1; });
module.exports = { parseArgs, validateRemoteContext, loadRemoteContext, publicStoreAddress, probeRoutes, runChecks, main };
