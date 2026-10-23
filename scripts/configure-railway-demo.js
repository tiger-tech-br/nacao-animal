"use strict";

// Configura exclusivamente a demonstracao autorizada. Nao altera .env nem
// conexoes locais. Valores privados sao enviados pela entrada padrao da CLI,
// nunca por argumentos, arquivos temporarios, logs ou saida do terminal.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { parse } = require("dotenv");
const { buildRailwayDemoVariables } = require("./railway-demo-config");

const target = {
    projectId: "69f7f38b-5d4c-4e40-9d7f-8417786a8883",
    environmentId: "05621372-8739-427e-9a5b-ce4bc49c815e",
    serviceId: "a258d23c-2278-4053-aae5-62fe5b0c4675",
    postgresId: "746e33f5-3596-4d17-b14c-12cadec7b071",
    domain: "nacao-animal-production.up.railway.app"
};

function cli(args, input) {
    const launcher = path.join(process.env.APPDATA || "", "npm/node_modules/@railway/cli/bin/railway.js");
    if (!fs.existsSync(launcher)) throw new Error("Railway CLI nao localizada nesta instalacao.");
    const result = spawnSync(process.execPath, [launcher, ...args], {
        cwd: path.join(__dirname, ".."), encoding: "utf8", input,
        timeout: 90000, windowsHide: true, maxBuffer: 8 * 1024 * 1024
    });
    if (result.status !== 0 || result.error) {
        throw new Error(`Railway CLI nao concluiu ${args[0]} (codigo ${result.status ?? "indisponivel"}).`);
    }
    try { return JSON.parse(result.stdout); }
    catch { throw new Error("Resposta inesperada da Railway CLI; valores privados nao foram exibidos."); }
}

function api(query, variables) {
    const result = cli(["api", query, "--variables", "@-", "--compact"], JSON.stringify(variables));
    if (result.errors?.length) throw new Error("Railway recusou a operacao; valores privados nao foram exibidos.");
    return result.data || result;
}

function parseArgs(args) {
    if (args.length > 1 || args.some(arg => !["--apply", "--dry-run"].includes(arg))) {
        throw new Error("Use node scripts/configure-railway-demo.js [--dry-run | --apply].");
    }
    return { apply: args.includes("--apply") };
}

function main(args = process.argv.slice(2)) {
    const { apply } = parseArgs(args);
    const state = cli(["status", "--project", target.projectId, "--environment", target.environmentId, "--json"]);
    const environment = state.environments.edges.find(item => item.node.id === target.environmentId)?.node;
    const services = environment?.serviceInstances?.edges.map(item => item.node) || [];
    const app = services.find(item => item.serviceId === target.serviceId);
    const postgres = services.find(item => item.serviceId === target.postgresId);
    if (state.id !== target.projectId || !app || !postgres ||
        app.serviceName !== "nacao-animal" || postgres.serviceName !== "Postgres" ||
        app.source?.repo !== "tiger-tech-br/nacao-animal") {
        throw new Error("Destino diferente da demonstracao autorizada; nenhuma variavel foi enviada.");
    }
    const domain = app.domains?.serviceDomains.find(item => item.domain === target.domain);
    if (!domain) throw new Error("Dominio esperado nao encontrado; nenhuma variavel foi enviada.");
    const existing = cli(["variable", "list", "--project", target.projectId,
        "--service", target.serviceId, "--environment", target.environmentId, "--json"]);
    const postgresVariables = cli(["variable", "list", "--project", target.projectId,
        "--service", target.postgresId, "--environment", target.environmentId, "--json"]);
    for (const name of ["DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
        if (!postgresVariables[name]) throw new Error(`Referencia PostgreSQL ausente: ${name}.`);
    }
    const envPath = path.join(__dirname, "..", ".env");
    const before = fs.readFileSync(envPath);
    const local = parse(before);
    const variables = buildRailwayDemoVariables(local, {
        appUrl: `https://${target.domain}`,
        hasPublicDatabaseUrl: Boolean(postgresVariables.DATABASE_PUBLIC_URL),
        jwtSecret: existing.JWT_SECRET?.trim() || crypto.randomBytes(48).toString("base64url")
    });
    console.log(JSON.stringify({ project: state.name, service: app.serviceName,
        localVariableCount: Object.keys(local).length, remoteVariableCount: Object.keys(existing).length,
        appStatus: app.latestDeployment?.status, postgresStatus: postgres.latestDeployment?.status,
        domain: target.domain, currentPort: domain.targetPort, intendedPort: 4600,
        paymentEnabled: false, mode: apply ? "aplicar" : "conferir" }));
    if (!apply) return;

    const updated = api("mutation ImportDemoVariables($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }", {
        input: { projectId: target.projectId, environmentId: target.environmentId,
            serviceId: target.serviceId, skipDeploys: true, replace: false, variables }
    });
    if (!updated.variableCollectionUpsert) throw new Error("Importacao nao confirmada.");
    console.log(`${Object.keys(variables).length} variaveis enviadas sem exibir valores e sem iniciar deploy.`);
    if (state.name !== "nacao-animal") {
        api("mutation RenameDemoProject($id: String!, $input: ProjectUpdateInput!) { projectUpdate(id: $id, input: $input) { id name } }", {
            id: target.projectId, input: { name: "nacao-animal" }
        });
        console.log("Projeto renomeado para nacao-animal.");
    }
    if (domain.targetPort !== 4600) {
        cli(["domain", "update", target.domain, "--port", "4600", "--project", target.projectId,
            "--service", target.serviceId, "--environment", target.environmentId, "--json"]);
        console.log("Dominio configurado para a porta 4600.");
    }
    const configured = api("mutation ConfigureDemoStart($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }", {
        serviceId: target.serviceId, environmentId: target.environmentId,
        input: { startCommand: "npm start", preDeployCommand: ["npm run db:migrate"],
            healthcheckPath: "/api/health", healthcheckTimeout: 100 }
    });
    if (configured.serviceInstanceUpdate !== true) throw new Error("Configuracao de migracoes e saude nao confirmada.");
    console.log("Migracao antes do deploy e verificacao de saude configuradas no Railway.");
    const current = cli(["variable", "list", "--project", target.projectId,
        "--service", target.serviceId, "--environment", target.environmentId, "--json"]);
    const missing = Object.keys(variables).filter(name => !(name in current));
    if (missing.length) throw new Error(`Variaveis ainda ausentes: ${missing.join(", ")}.`);
    if (current.PAYMENTS_ENABLED !== "false" || current.PAYMENT_ENVIRONMENT !== "sandbox") {
        throw new Error("Configuracao de pagamentos inesperada.");
    }
    if (!fs.readFileSync(envPath).equals(before)) throw new Error("O arquivo local mudou durante a operacao; confira antes de continuar.");
    console.log("Importacao conferida; .env local preservado e pagamentos desativados.");
}

if (require.main === module) {
    try { main(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { cli, api, target, parseArgs };
