"use strict";

/* ==================================================
   DOTENV
================================================== */

require("dotenv").config();

/* ==================================================
   POSTGRESQL
================================================== */

const { Pool } = require("pg");
const { buildDbOptions } = require("./dbOptions");

/* ==================================================
   POOL
================================================== */

const pool = new Pool({

    ...buildDbOptions(),

    max: 20,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 5000

});

/* ==================================================
   TESTE DE CONEXÃO
================================================== */

async function connectDatabase() {

    try {

        await pool.query("SELECT NOW()");

        console.log("✅ PostgreSQL conectado.");

    } catch (error) {

        console.error("❌ Erro ao conectar no PostgreSQL.");

        console.error(error);

        process.exit(1);

    }

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    pool,

    connectDatabase

};
