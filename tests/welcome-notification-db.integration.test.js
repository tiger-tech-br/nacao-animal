"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");

test("boas-vindas reaproveita leitura legada, atende contas existentes e permanece única após novo cadastro/reexecução", {
    skip: process.env.RUN_DB_TESTS !== "1"
}, async () => {
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    const options = require("../config/dbOptions").buildDbOptions();
    const url = options.connectionString ? new URL(options.connectionString) : null;
    assert.ok(["localhost", "127.0.0.1"].includes(url?.hostname || options.host), "Somente PostgreSQL local");
    assert.equal(url ? decodeURIComponent(url.pathname.slice(1)) : options.database, "nacao-animal");
    const schema = `test_welcome_${randomBytes(8).toString("hex")}`;
    const admin = new Pool(options);
    let pool;
    const ids = Array.from({ length: 5 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    try {
        await admin.query(`CREATE SCHEMA "${schema}"`);
        pool = new Pool({ ...options, options: `-c search_path=${schema},public` });
        await pool.query(`
            CREATE TABLE clientes (id UUID PRIMARY KEY, nome TEXT NOT NULL);
            CREATE TABLE usuarios_clientes (cliente_id UUID PRIMARY KEY REFERENCES clientes(id));
            CREATE TABLE notificacoes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cliente_id UUID NOT NULL REFERENCES clientes(id),
                titulo TEXT NOT NULL, mensagem TEXT NOT NULL,
                tipo TEXT NOT NULL CHECK (tipo IN ('CONSULTA','PROMOCAO','SISTEMA','ATENDIMENTO')),
                venda_id UUID, lida BOOLEAN NOT NULL DEFAULT FALSE,
                data_leitura TIMESTAMPTZ, enviada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        await pool.query("INSERT INTO clientes(id,nome) SELECT x,'Cliente isolado' FROM unnest($1::uuid[]) x", [ids.slice(0, 4)]);
        await pool.query("INSERT INTO usuarios_clientes(cliente_id) VALUES($1),($2)", ids.slice(0, 2));
        const legacy = (await pool.query(`
            INSERT INTO notificacoes(cliente_id,titulo,mensagem,tipo,lida,data_leitura,enviada_em)
            VALUES($1,'Bem-vindo à Nação Animal','Cadastro anterior.','SISTEMA',TRUE,'2026-01-02','2026-01-01')
            RETURNING *`, [ids[0]])).rows[0];
        const unrelated = (await pool.query(`
            INSERT INTO notificacoes(cliente_id,titulo,mensagem,tipo,venda_id)
            VALUES($1,'Pedido atualizado','Pedido existente.','SISTEMA',$2) RETURNING *`, [ids[0], ids[4]])).rows[0];
        const sql = fs.readFileSync("database/sql/117_boas_vindas_cliente.sql", "utf8");
        await pool.query(sql);
        const first = (await pool.query("SELECT * FROM notificacoes ORDER BY cliente_id,id")).rows;
        const legacyAfter = first.find(row => row.id === legacy.id);
        assert.deepEqual(legacyAfter, { ...legacy, tipo: "BOAS_VINDAS" }, "Não recria ID nem reabre mensagem lida");
        assert.deepEqual(first.find(row => row.id === unrelated.id), unrelated, "Pedido existente não é alterado");
        const welcome = first.filter(row => row.tipo === "BOAS_VINDAS");
        assert.equal(welcome.length, 2);
        assert.equal(welcome.find(row => row.cliente_id === ids[1]).lida, false);
        assert.ok(!first.some(row => row.cliente_id === ids[2]), "Cliente sem conta não recebe aviso");

        await pool.query("UPDATE notificacoes SET lida=TRUE,data_leitura=NOW() WHERE cliente_id=$1 AND tipo='BOAS_VINDAS'", [ids[1]]);
        const beforeRepeat = (await pool.query("SELECT * FROM notificacoes ORDER BY cliente_id,id")).rows;
        await pool.query(sql);
        assert.deepEqual((await pool.query("SELECT * FROM notificacoes ORDER BY cliente_id,id")).rows, beforeRepeat);

        await pool.query("INSERT INTO usuarios_clientes(cliente_id) VALUES($1)", [ids[3]]);
        let newest = (await pool.query("SELECT * FROM notificacoes WHERE cliente_id=$1", [ids[3]])).rows;
        assert.equal(newest.length, 1);
        assert.equal(newest[0].tipo, "BOAS_VINDAS");
        assert.equal(newest[0].lida, false);
        await pool.query(`INSERT INTO notificacoes(cliente_id,titulo,mensagem,tipo)
            VALUES($1,'Bem-vindo à Nação Animal','Cadastro.','BOAS_VINDAS') ON CONFLICT DO NOTHING`, [ids[3]]);
        newest = (await pool.query("SELECT * FROM notificacoes WHERE cliente_id=$1", [ids[3]])).rows;
        assert.equal(newest.length, 1, "Trigger e cadastro da aplicação não duplicam a mensagem");
        await assert.rejects(pool.query(`INSERT INTO notificacoes(cliente_id,titulo,mensagem,tipo)
            VALUES($1,'Duplicada','Não pode duplicar.','BOAS_VINDAS')`, [ids[3]]), { code: "23505" });
    } finally {
        if (pool) await pool.end();
        if (/^test_welcome_[a-f0-9]{16}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
    }
});
