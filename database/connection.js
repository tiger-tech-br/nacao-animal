"use strict";

/* ==================================================
   CONEXÃO COM O BANCO
================================================== */

const { pool } = require("../config/db");

/* ==================================================
   QUERY
================================================== */

async function query(text, params = []) {

    const result = await pool.query(

        text,

        params

    );

    return result;

}

/* ==================================================
   TRANSACTION
================================================== */

async function transaction(callback) {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const result = await callback(client);

        await client.query("COMMIT");

        return result;

    } catch (error) {

        await client.query("ROLLBACK");

        throw error;

    } finally {

        client.release();

    }

}

async function connect() {
    return pool.connect();
}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    query,

    transaction,

    connect

};
