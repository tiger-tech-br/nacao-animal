"use strict";

const crypto = require("node:crypto");
const BOM = "\uFEFF";

function canonicalMigrationSql(sql) {
    if (typeof sql !== "string") throw new TypeError("O SQL da migracao deve ser texto UTF-8.");
    if (sql.startsWith(BOM + BOM)) throw new TypeError("O SQL possui mais de um BOM inicial.");
    // Somente o BOM inicial e CRLF sao formatos de arquivo intercambiaveis.
    // Espacos, comentarios, ultima quebra, CR isolado e BOM interno permanecem.
    return sql.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

function sha256(sql) {
    return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

function migrationChecksum(sql) {
    return sha256(canonicalMigrationSql(sql));
}

function legacyMigrationChecksums(sql) {
    const canonical = canonicalMigrationSql(sql);
    const crlf = canonical.replace(/\n/g, "\r\n");
    const originalWithoutBom = sql.replace(/^\uFEFF/, "");
    // Lista finita de formatos equivalentes; nunca normaliza SQL ou espacos.
    return new Set([
        sql, originalWithoutBom, BOM + originalWithoutBom,
        canonical, crlf, BOM + canonical, BOM + crlf
    ].map(sha256));
}

function matchesMigrationChecksum(sql, storedChecksum) {
    if (typeof storedChecksum !== "string" || !/^[a-f0-9]{64}$/i.test(storedChecksum)) return false;
    return legacyMigrationChecksums(sql).has(storedChecksum.toLowerCase());
}

module.exports = { canonicalMigrationSql, migrationChecksum, legacyMigrationChecksums, matchesMigrationChecksum };

