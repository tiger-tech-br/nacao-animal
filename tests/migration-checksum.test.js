"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { canonicalMigrationSql, migrationChecksum, matchesMigrationChecksum } = require("../scripts/migration-checksum");
const { applyMigration } = require("../scripts/migrate");

const SQL = "-- Produto\nCREATE TABLE exemplo (nome TEXT);\n";
const rawHash = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const quiet = () => {};

function databaseClient(stored, failure) {
    const calls = [];
    return { calls, query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.startsWith("SELECT checksum")) return { rows: stored ? [{ checksum: stored }] : [] };
        if (failure && sql === SQL) throw failure;
        return { rows: [] };
    } };
}

test("hash canonico e identico em Linux, Windows e UTF-8 com BOM", () => {
    const expected = rawHash(SQL);
    const crlf = SQL.replaceAll("\n", "\r\n");
    for (const source of [SQL, crlf, "\uFEFF" + SQL, "\uFEFF" + crlf, SQL.replace("\n", "\r\n")]) {
        assert.equal(migrationChecksum(source), expected);
        assert.equal(canonicalMigrationSql(source), SQL);
    }
});

test("001 local coincide com o checksum LF aplicado, preservando a migracao imutavel", () => {
    const source = fs.readFileSync(path.join(__dirname, "../database/sql/001_extensions.sql"), "utf8");
    assert.equal(migrationChecksum(source), "3c8d78eb9dc8d201dcbe730d7ec85c56cd92eb0836c534b9d597e1eef6563504");
});

test("checksums legados aceitam somente representacoes CRLF, LF e BOM equivalentes", () => {
    const crlf = SQL.replaceAll("\n", "\r\n");
    const representations = [SQL, crlf, "\uFEFF" + SQL, "\uFEFF" + crlf];
    for (const source of representations) {
        for (const previouslyApplied of representations) {
            assert.equal(matchesMigrationChecksum(source, rawHash(previouslyApplied)), true);
        }
    }
    const mixed = SQL.replace("\n", "\r\n");
    assert.equal(matchesMigrationChecksum(mixed, rawHash(mixed)), true);
    assert.equal(matchesMigrationChecksum(mixed, rawHash(SQL)), true);
});

test("conteudo, espacos, comentarios e ultima quebra alterados continuam bloqueados", () => {
    const stored = rawHash(SQL);
    for (const changed of [SQL.replace("TEXT", "INTEGER"), SQL.replace("-- Produto", "-- Alterado"), SQL.replace("nome TEXT", "nome  TEXT"), SQL.trimEnd(), SQL + "\n", SQL.replace("-- Produto", "-- Produto\uFEFF"), SQL.replace("Produto", "Pro\rduto")]) {
        assert.equal(matchesMigrationChecksum(changed, stored), false, changed);
    }
    assert.throws(() => matchesMigrationChecksum("\uFEFF\uFEFF" + SQL, stored), TypeError);
});

test("checksum ausente, malformado ou de outro SQL nunca e aceito", () => {
    for (const stored of [null, undefined, "", "a".repeat(63), "g".repeat(64), " " + rawHash(SQL), rawHash("SELECT 1;")]) {
        assert.equal(matchesMigrationChecksum(SQL, stored), false);
    }
    assert.throws(() => migrationChecksum(Buffer.from(SQL)), TypeError);
});

test("migração aplicada com hash legado e ignorada sem atualizacao ou reaplicacao", async () => {
    const client = databaseClient(rawHash("\uFEFF" + SQL.replaceAll("\n", "\r\n")));
    const result = await applyMigration(client, "001_fixture.sql", SQL, quiet);
    assert.equal(result.applied, false);
    assert.equal(result.checksum, rawHash(SQL));
    assert.equal(client.calls.length, 1);
    assert.ok(client.calls[0].sql.startsWith("SELECT checksum"));
});

test("migração nova executa SQL sem BOM e grava checksum canonico em transacao", async () => {
    const client = databaseClient();
    const result = await applyMigration(client, "113_fixture.sql", "\uFEFF" + SQL.replaceAll("\n", "\r\n"), quiet);
    assert.equal(result.applied, true);
    assert.deepEqual(client.calls.map(call => call.sql), [
        "SELECT checksum FROM schema_migrations WHERE nome = $1", "BEGIN", SQL,
        "INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2)", "COMMIT"
    ]);
    assert.deepEqual(client.calls[3].params, ["113_fixture.sql", rawHash(SQL)]);
});

test("drift real aborta antes de iniciar transacao ou modificar banco", async () => {
    const client = databaseClient(rawHash(SQL));
    await assert.rejects(applyMigration(client, "001_fixture.sql", SQL.replace("TEXT", "INTEGER"), quiet), {
        code: "MIGRATION_CHECKSUM_MISMATCH", migrationFile: "001_fixture.sql"
    });
    assert.equal(client.calls.length, 1);
});

test("erro no SQL novo desfaz transacao e nao grava checksum", async () => {
    const client = databaseClient(undefined, Object.assign(new Error("invalid SQL"), { code: "42601" }));
    await assert.rejects(applyMigration(client, "113_fixture.sql", SQL, quiet), { code: "42601", migrationFile: "113_fixture.sql" });
    assert.deepEqual(client.calls.map(call => call.sql), [
        "SELECT checksum FROM schema_migrations WHERE nome = $1", "BEGIN", SQL, "ROLLBACK"
    ]);
});

