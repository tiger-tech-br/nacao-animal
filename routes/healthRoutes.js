"use strict";

const router = require("express").Router();
const db = require("../database/connection");
const { isCloudinaryConfigured } = require("../config/cloudinary");
const { configurationStatus } = require("../config/productionReadiness");
const { runReleaseChecks } = require("../scripts/release-check");

router.get("/health", async (_request, response) => {
    try {
        const { rows } = await db.query(`
            SELECT NOW() AS database_time,
                   to_regclass('public.schema_migrations') IS NOT NULL AS migrations_ready
        `);
        const migrationsReady = rows[0]?.migrations_ready === true;
        return response.status(migrationsReady ? 200 : 503).json({
            success: migrationsReady,
            status: migrationsReady ? "ok" : "migrations_pending",
            database: "connected",
            timestamp: new Date().toISOString()
        });
    } catch (_error) {
        return response.status(503).json({
            success: false,
            status: "database_unavailable",
            timestamp: new Date().toISOString()
        });
    }
});

router.get("/readiness", async (_request, response) => {
    try {
        const checks = await runReleaseChecks(db, process.env, { cloudinaryConfigured: isCloudinaryConfigured() });
        const integrations = configurationStatus(checks);
        const databaseChecks = checks.filter(check => check.integration === "database");
        const storeChecks = checks.filter(check => check.integration === "loja");
        const databaseReady = databaseChecks.length > 0 && databaseChecks.every(check => check.passed);
        const storeReady = storeChecks.length === 6 && storeChecks.every(check => check.passed);
        const ready = checks.every(check => check.passed) && storeReady;
        return response.status(ready ? 200 : 503).json({
            success: ready,
            status: !databaseReady ? "database_unavailable" : ready ? "ready" : "attention_required",
            database: databaseReady,
            store: storeReady,
            integrations,
            timestamp: new Date().toISOString()
        });
    } catch (_error) {
        return response.status(503).json({
            success: false,
            status: "database_unavailable",
            database: false,
            store: false,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
