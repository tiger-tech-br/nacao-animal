"use strict";

function buildDbOptions() {
    const databaseUrl =
        process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.DATABASE_PUBLIC_URL;

    // Esta copia nunca deve acessar o banco do PetFlow original.
    // No Railway, DB_EXPECTED_NAME deve referenciar PGDATABASE do Postgres
    // criado dentro deste projeto.
    const expectedDatabaseName =
        process.env.DB_EXPECTED_NAME ||
        "petflow_v2";
    const databaseName = databaseUrl
        ? decodeURIComponent(new URL(databaseUrl).pathname.slice(1))
        : process.env.DB_NAME;
    if (!databaseName || databaseName !== expectedDatabaseName) {
        throw new Error("O banco configurado nao corresponde a DB_EXPECTED_NAME. Confira a conexao do PetFlow v2.");
    }

    if (databaseUrl) {
        return {
            connectionString: databaseUrl,
            ...(process.env.DB_SSL === "true"
                ? { ssl: { rejectUnauthorized: false } }
                : {})
        };
    }

    return {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    };
}

module.exports = {
    buildDbOptions
};
