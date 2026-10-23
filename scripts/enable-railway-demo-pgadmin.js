"use strict";

// Acesso externo apenas ao PostgreSQL da demonstracao. Nao imprime senhas ou
// URLs de conexao e nao altera o banco local nem a conexao privada do site.
const { cli, api, target } = require("./configure-railway-demo");

function main() {
    const apply = process.argv.includes("--apply");
    const state = cli(["status", "--project", target.projectId, "--environment", target.environmentId, "--json"]);
    const services = state.environments.edges.find(item => item.node.id === target.environmentId)?.node.serviceInstances.edges || [];
    if (state.id !== target.projectId || !services.some(item => item.node.serviceId === target.postgresId && item.node.serviceName === "Postgres")) {
        throw new Error("PostgreSQL da demonstracao nao confirmado.");
    }
    const scope = ["--project", target.projectId, "--service", target.postgresId, "--environment", target.environmentId, "--json"];
    let proxies = cli(["tcp-proxy", "list", ...scope]).proxies || [];
    if (!proxies.some(item => Number(item.applicationPort) === 5432)) {
        if (!apply) { console.log("PostgreSQL ainda sem acesso publico para pgAdmin."); return; }
        cli(["tcp-proxy", "create", "--port", "5432", ...scope]);
        proxies = cli(["tcp-proxy", "list", ...scope]).proxies || [];
    }
    const proxy = proxies.find(item => Number(item.applicationPort) === 5432);
    if (!proxy || !proxy.domain || !proxy.proxyPort || !proxy.domain.endsWith(".proxy.rlwy.net")) {
        throw new Error("Proxy publico esperado nao confirmado; nenhuma URL foi alterada.");
    }
    if (!apply) { console.log(JSON.stringify({ publicHost: proxy.domain, publicPort: proxy.proxyPort })); return; }
    const pg = cli(["variable", "list", ...scope]);
    for (const key of ["PGUSER", "PGPASSWORD", "PGDATABASE"]) {
        if (!pg[key]) throw new Error("Credenciais geradas do PostgreSQL incompletas.");
    }
    const url = `postgresql://${encodeURIComponent(pg.PGUSER)}:${encodeURIComponent(pg.PGPASSWORD)}@${proxy.domain}:${proxy.proxyPort}/${encodeURIComponent(pg.PGDATABASE)}`;
    const query = "mutation PublicDatabaseVariable($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }";
    api(query, { input: { projectId: target.projectId, environmentId: target.environmentId,
        serviceId: target.postgresId, skipDeploys: true, replace: false, variables: { DATABASE_PUBLIC_URL: url } } });
    api(query, { input: { projectId: target.projectId, environmentId: target.environmentId,
        serviceId: target.serviceId, skipDeploys: true, replace: false,
        variables: { DATABASE_PUBLIC_URL: "${{Postgres.DATABASE_PUBLIC_URL}}" } } });
    const verified = cli(["variable", "list", ...scope]);
    if (verified.DATABASE_PUBLIC_URL !== url) throw new Error("Valor publico nao confirmado; nenhum segredo foi exibido.");
    console.log(JSON.stringify({ publicHost: proxy.domain, publicPort: proxy.proxyPort,
        database: pg.PGDATABASE, user: pg.PGUSER, variable: "DATABASE_PUBLIC_URL", passwordDisplayed: false }));
    console.log("Conexao publica pronta no Postgres > Variables. O site mantem a conexao privada.");
}

if (require.main === module) {
    try { main(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { main };
