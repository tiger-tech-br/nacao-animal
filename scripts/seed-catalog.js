"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { buildDbOptions } = require("../config/dbOptions");
require("dotenv").config({ quiet: true });
async function run() {
    const pool = new Pool({ ...buildDbOptions(), connectionTimeoutMillis: 10000 });
    let client;
    try {
        client = await pool.connect();
        client.on("notice", notice => console.log(notice.message));
        const results = await client.query(fs.readFileSync(path.join(__dirname, "../database/catalogo-exemplo.sql"), "utf8"));
        const rows = (Array.isArray(results) ? results.at(-1) : results).rows;
        console.table(rows);
        console.log("Catálogo cadastrado. Produtos e estoques preexistentes foram preservados.");
    } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("Falha ao cadastrar catálogo:", error.code || error.name);
        process.exitCode = 1;
    } finally {
        client?.release();
        await pool.end();
    }
}
run();
