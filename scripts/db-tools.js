"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function getDatabaseTarget() {
    const connection = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PUBLIC_URL;
    if (connection) {
        const url = new URL(connection);
        return {
            host: url.hostname,
            port: url.port || "5432",
            database: decodeURIComponent(url.pathname.slice(1)),
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            ssl: process.env.DB_SSL === "true" || url.searchParams.get("sslmode") === "require"
        };
    }
    return {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || "5432",
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === "true"
    };
}

function assertExpectedDatabase(target) {
    const expected = process.env.DB_EXPECTED_NAME || "petflow_v2";
    if (!target.database || target.database !== expected) {
        throw new Error(`Operacao bloqueada: o banco configurado nao corresponde a DB_EXPECTED_NAME (${expected}).`);
    }
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
            env: { ...process.env, ...options.env },
            windowsHide: true
        });
        let output = "";
        let errorOutput = "";
        child.stdout?.on("data", chunk => { output += chunk; });
        child.stderr?.on("data", chunk => { errorOutput += chunk; });
        child.on("error", error => reject(new Error(
            error.code === "ENOENT"
                ? `${command} nao foi encontrado. Instale as ferramentas cliente do PostgreSQL e tente novamente.`
                : error.message
        )));
        child.on("close", code => code === 0
            ? resolve(output)
            : reject(new Error(errorOutput.trim() || `${command} terminou com codigo ${code}.`)));
    });
}

function postgresArgs(target) {
    return ["--host", target.host, "--port", target.port, "--username", target.user, "--dbname", target.database];
}

function postgresEnv(target) {
    return {
        PGPASSWORD: target.password || "",
        ...(target.ssl ? { PGSSLMODE: "require" } : {})
    };
}

function safeBackupPath(value) {
    const backupRoot = path.resolve(__dirname, "..", "backups");
    const resolved = path.resolve(value);
    if (resolved !== backupRoot && !resolved.startsWith(`${backupRoot}${path.sep}`)) {
        throw new Error("O arquivo de backup deve ficar dentro da pasta backups do projeto.");
    }
    fs.mkdirSync(backupRoot, { recursive: true });
    return resolved;
}

module.exports = {
    assertExpectedDatabase,
    getDatabaseTarget,
    postgresArgs,
    postgresEnv,
    run,
    safeBackupPath
};
