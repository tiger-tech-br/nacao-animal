"use strict";

const { REQUIRED_MIGRATIONS, productionConfigurationChecks } = require("../config/productionReadiness");

async function runReleaseChecks(db, env = process.env, options = {}) {
    const checks = productionConfigurationChecks(env, options);
    const check = (name, passed, detail, integration = "database") => checks.push({ name, passed: Boolean(passed), detail, integration });
    try {
        const { rows: tables } = await db.query(`
            SELECT to_regclass('public.schema_migrations') IS NOT NULL AS migrations,
                   to_regclass('public.auditoria_admin') IS NOT NULL AS auditoria,
                   to_regclass('public.reservas_estoque') IS NOT NULL AS reservas,
                   to_regclass('public.lgpd_solicitacoes') IS NOT NULL AS lgpd,
                   to_regclass('public.solicitacoes_consumidor') IS NOT NULL AS atendimento
        `);
        check("Conexao PostgreSQL", true, "conectado");
        check("Controle de migracoes", tables[0].migrations, "schema_migrations");
        check("Auditoria administrativa", tables[0].auditoria, "auditoria_admin");
        check("Reserva de estoque", tables[0].reservas, "reservas_estoque");
        check("Estrutura LGPD", tables[0].lgpd, "lgpd_solicitacoes");
        check("Atendimento ao consumidor", tables[0].atendimento, "solicitacoes_consumidor");
        const applied = new Set();
        if (tables[0].migrations) {
            const { rows } = await db.query("SELECT nome FROM schema_migrations WHERE nome = ANY($1::text[])", [REQUIRED_MIGRATIONS]);
            rows.forEach(row => applied.add(row.nome));
        }
        for (const name of REQUIRED_MIGRATIONS) {
            check(`Migracao ${name}`, applied.has(name), "deve estar aplicada no banco publicado");
        }

        // A funcao get_petflow_empresa_id() pode inserir uma empresa em banco vazio.
        // A revisao usa a mesma selecao da loja publica, somente por leitura.
        const { rows: catalog } = await db.query(`
            WITH loja AS (SELECT id FROM empresas ORDER BY created_at ASC LIMIT 1)
            SELECT
              (SELECT COUNT(*)::int FROM loja) AS empresas,
              (SELECT COUNT(*)::int FROM usuarios u JOIN loja l ON l.id=u.empresa_id
               WHERE u.ativo=TRUE AND u.perfil='ADMIN') AS admins,
              (SELECT COUNT(*)::int FROM produtos p JOIN loja l ON l.id=p.empresa_id
               WHERE COALESCE(p.status,p.ativo,TRUE)=TRUE) AS produtos,
              (SELECT COUNT(*)::int FROM produtos p JOIN loja l ON l.id=p.empresa_id
               WHERE COALESCE(p.status,p.ativo,TRUE)=TRUE AND EXISTS (
                 SELECT 1 FROM estoque e WHERE e.produto_id=p.id AND e.empresa_id=l.id
               )) AS estoques,
              (SELECT COUNT(*)::int FROM produtos p JOIN loja l ON l.id=p.empresa_id
               JOIN estoque e ON e.produto_id=p.id AND e.empresa_id=l.id
               WHERE COALESCE(p.status,p.ativo,TRUE)=TRUE AND p.preco>0 AND e.quantidade>0) AS vendaveis
        `);
        const store = catalog[0];
        check("Empresa da loja cadastrada", store.empresas > 0, `${store.empresas} registro(s)`, "loja");
        check("Administrador da loja ativo", store.admins > 0, `${store.admins} administrador(es)`, "loja");
        check("Catalogo da loja ativo", store.produtos > 0, `${store.produtos} produto(s)`, "loja");
        check("Estoque da loja cadastrado", store.produtos > 0 && store.estoques === store.produtos, `${store.estoques}/${store.produtos} produto(s) com estoque`, "loja");
        check("Produtos disponiveis para venda", store.vendaveis > 0, `${store.vendaveis} produto(s) com preco e saldo positivos`, "loja");

        const { rows: legal } = await db.query(`
            SELECT ARRAY_REMOVE(ARRAY[
                CASE WHEN NULLIF(TRIM(nome),'') IS NULL THEN 'nome' END,
                CASE WHEN NULLIF(TRIM(cnpj),'') IS NULL THEN 'CNPJ' END,
                CASE WHEN NULLIF(TRIM(telefone),'') IS NULL THEN 'telefone' END,
                CASE WHEN NULLIF(TRIM(email),'') IS NULL THEN 'e-mail' END,
                CASE WHEN NULLIF(TRIM(endereco),'') IS NULL THEN 'endereco' END,
                CASE WHEN NULLIF(TRIM(numero),'') IS NULL THEN 'numero' END,
                CASE WHEN NULLIF(TRIM(bairro),'') IS NULL THEN 'bairro' END,
                CASE WHEN NULLIF(TRIM(cidade),'') IS NULL THEN 'cidade' END,
                CASE WHEN NULLIF(TRIM(estado),'') IS NULL THEN 'estado' END,
                CASE WHEN NULLIF(TRIM(cep),'') IS NULL THEN 'CEP' END
            ], NULL) AS pendentes FROM empresas ORDER BY created_at ASC LIMIT 1
        `);
        const missing = legal[0]?.pendentes;
        check("Dados publicos da loja", Array.isArray(missing) && missing.length === 0,
            Array.isArray(missing) ? (missing.length ? `pendente: ${missing.join(", ")}` : "identificacao, contato e endereco preenchidos") : "empresa da loja ausente", "loja");
    } catch (error) {
        check("Consulta PostgreSQL", false, /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "nao foi possivel verificar o banco");
    }
    return checks;
}

async function main() {
    require("dotenv").config({ quiet: true });
    let pool;
    let checks;
    try {
        const db = require("../database/connection");
        pool = require("../config/db").pool;
        const { isCloudinaryConfigured } = require("../config/cloudinary");
        checks = await runReleaseChecks(db, process.env, { cloudinaryConfigured: isCloudinaryConfigured() });
    } catch {
        checks = productionConfigurationChecks(process.env);
        checks.push({ name: "Inicializacao PostgreSQL", passed: false, detail: "confira a configuracao e o nome esperado do banco" });
    } finally {
        if (pool) await pool.end();
    }
    for (const item of checks) {
        console.log(`${item.passed ? "OK" : "FALHA"} - ${item.name}: ${item.detail}`);
    }
    const failed = checks.filter(item => !item.passed);
    console.log(`\n${checks.length - failed.length}/${checks.length} verificacoes aprovadas.`);
    console.log("Esta checagem valida configuracao e estrutura; confirme as credenciais e os fluxos reais dos provedores antes do lancamento.");
    if (failed.length) process.exitCode = 1;
}

if (require.main === module) main().catch(() => {
    console.error("Nao foi possivel concluir a verificacao de publicacao.");
    process.exitCode = 1;
});

module.exports = { runReleaseChecks };
