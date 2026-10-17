"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { canonicalMigrationSql, migrationChecksum, matchesMigrationChecksum } = require("./migration-checksum");

const SQL_DIR = path.join(__dirname, "..", "database", "sql");

async function applyMigration(client, file, sql, log = console.log) {
    const checksum = migrationChecksum(sql);
    const applied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE nome = $1", [file]
    );
    if (applied.rows[0]) {
        if (!matchesMigrationChecksum(sql, applied.rows[0].checksum)) {
            throw Object.assign(new Error(
                `A migracao ${file} foi alterada depois de aplicada. Crie um novo arquivo SQL em vez de editar a migracao existente.`
            ), { code: "MIGRATION_CHECKSUM_MISMATCH", migrationFile: file });
        }
        // Mantem o registro historico; reconhecer um formato legado nao altera o banco.
        log(`Ignorando ${file}: ja aplicado.`);
        return { applied: false, checksum };
    }

    log(`Aplicando ${file}...`);
    await client.query("BEGIN");
    try {
        await client.query(canonicalMigrationSql(sql));
        await client.query(
            "INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2)",
            [file, checksum]
        );
        await client.query("COMMIT");
        return { applied: true, checksum };
    } catch (error) {
        await client.query("ROLLBACK");
        error.migrationFile = file;
        throw error;
    }
}

async function run() {
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    const { buildDbOptions } = require("../config/dbOptions");
    const pool = new Pool(buildDbOptions());
    let client;
    try {
        const files = (await fs.readdir(SQL_DIR))
            .filter(file => file.endsWith(".sql"))
            .sort((a, b) => a.localeCompare(b));
        client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                nome VARCHAR(255) PRIMARY KEY,
                checksum VARCHAR(64) NOT NULL,
                aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        for (const file of files) {
            const sql = await fs.readFile(path.join(SQL_DIR, file), "utf8");
            await applyMigration(client, file, sql);
        }
        console.log("Banco de dados atualizado com sucesso.");
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

if (require.main === module) run().catch(error => {
    console.error("Erro ao atualizar o banco de dados.", {
        code: /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "UNKNOWN",
        ...(error.migrationFile ? { migration: error.migrationFile } : {})
    });
    if (error.code === "MIGRATION_CHECKSUM_MISMATCH") console.error(error.message);
    process.exitCode = 1;
});

module.exports = { applyMigration, run };
