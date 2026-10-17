"use strict";

require("dotenv").config({ quiet: true });
const path = require("path");
const {
    assertExpectedDatabase, getDatabaseTarget, postgresArgs,
    postgresEnv, run, safeBackupPath
} = require("./db-tools");

async function main() {
    const target = getDatabaseTarget();
    assertExpectedDatabase(target);
    const stamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
    const file = safeBackupPath(path.join(__dirname, "..", "backups", `${target.database}_${stamp}.dump`));
    const env = postgresEnv(target);

    await run("pg_dump", [
        ...postgresArgs(target), "--format=custom", "--no-owner", "--no-privileges", "--file", file
    ], { env });
    await run("pg_restore", ["--list", file], { env, capture: true });
    console.log(`Backup criado e validado: ${file}`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
