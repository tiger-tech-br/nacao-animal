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
    const fileArg = process.argv.find(arg => arg.startsWith("--file="))?.slice(7);
    const confirmation = process.argv.find(arg => arg.startsWith("--confirm="))?.slice(10);
    if (!fileArg) throw new Error("Informe --file=backups/arquivo.dump.");
    if (confirmation !== target.database) {
        throw new Error(`Restauracao bloqueada. Confirme o destino com --confirm=${target.database}.`);
    }
    const file = safeBackupPath(path.resolve(process.cwd(), fileArg));
    const env = postgresEnv(target);
    await run("pg_restore", ["--list", file], { env, capture: true });
    await run("pg_restore", [
        ...postgresArgs(target), "--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", file
    ], { env });
    console.log(`Backup restaurado no banco ${target.database}. Execute npm run db:migrate em seguida.`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
