"use strict";

function buildRailwayDemoVariables(localVariables, { appUrl, jwtSecret, hasPublicDatabaseUrl = false }) {
    const url = new URL(appUrl);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".up.railway.app") ||
        url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/") {
        throw new Error("Informe a origem HTTPS da demonstracao no Railway.");
    }
    if (!jwtSecret || jwtSecret.length < 32) throw new Error("Segredo exclusivo da demonstracao invalido.");

    // O .env local continua ativo e inalterado. Somente a copia remota recebe
    // estas substituicoes; localhost segue usando seu proprio PostgreSQL.
    return {
        ...localVariables,
        NODE_ENV: "production",
        PORT: "4600",
        APP_URL: url.origin,
        FRONTEND_URL: url.origin,
        DATABASE_URL: "${{Postgres.DATABASE_URL}}",
        POSTGRES_URL: "${{Postgres.DATABASE_URL}}",
        DATABASE_PUBLIC_URL: hasPublicDatabaseUrl ? "${{Postgres.DATABASE_PUBLIC_URL}}" : "",
        DB_HOST: "${{Postgres.PGHOST}}",
        DB_PORT: "${{Postgres.PGPORT}}",
        DB_NAME: "${{Postgres.PGDATABASE}}",
        DB_EXPECTED_NAME: "${{Postgres.PGDATABASE}}",
        DB_USER: "${{Postgres.PGUSER}}",
        DB_PASSWORD: "${{Postgres.PGPASSWORD}}",
        DB_SSL: "false",
        JWT_SECRET: jwtSecret,
        PAYMENTS_ENABLED: "false",
        PAYMENT_PROVIDER: "pending",
        PAYMENT_ENVIRONMENT: "sandbox"
    };
}

module.exports = { buildRailwayDemoVariables };
