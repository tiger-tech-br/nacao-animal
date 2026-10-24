"use strict";
// Medidas locais de qualidade. Não recebe nem conserva coordenadas, rotas ou IDs.
((root) => {
    const reasons = new Set(["animated", "first-fix", "resume", "unsupported", "reduced-motion", "imprecise", "no-timestamp", "old-fix", "sample-gap", "receipt-gap", "large-jump", "stationary", "fast-catch-up", "paused"]);
    const finite = value => typeof value === "number" && Number.isFinite(value);
    const positiveTime = value => finite(value) && value > 0 && value <= 8640000000000000;
    const nonnegative = value => finite(value) && value >= 0 ? value : null;
    const aggregate = () => ({ count: 0, mean: 0, max: 0 });
    function add(stats, value) {
        if (nonnegative(value) === null) return;
        stats.count++;
        stats.mean += (value-stats.mean)/stats.count;
        stats.max = Math.max(stats.max, value);
    }
    function create() {
        let reads, previousTimestamp, previousReceipt, latest, sensor, receipt, age, accuracy, speed, heading, motion, animating, paused, finished;
        function reset() {
            reads = 0; previousTimestamp = previousReceipt = null;
            latest = { sensorIntervalMs: null, receiptIntervalMs: null, sampleAgeMs: null, accuracyM: null };
            sensor = aggregate(); receipt = aggregate(); age = aggregate();
            accuracy = { upTo10: 0, upTo25: 0, upTo50: 0, over50: 0 };
            speed = { missing: 0, zero: 0, moving: 0 };
            heading = { available: 0, missing: 0 };
            motion = { samples: 0, animated: 0, immediate: 0, paused: 0, completed: 0, maxDurationMs: 0, maxRenderDelayMs: 0, reasons: {}, lastReason: null };
            animating = paused = finished = false;
        }
        function recordFix(fix, receivedAtMs = Date.now()) {
            if (finished) return false;
            const timestamp = fix?.timestamp, accuracyM = fix?.accuracy;
            if (!positiveTime(timestamp) || !positiveTime(receivedAtMs) || nonnegative(accuracyM) === null || accuracyM > 10000 ||
                previousTimestamp !== null && timestamp <= previousTimestamp) return false;
            const sensorIntervalMs = previousTimestamp === null ? null : timestamp-previousTimestamp;
            const receiptIntervalMs = previousReceipt === null ? null : Math.max(0, receivedAtMs-previousReceipt);
            const sampleAgeMs = Math.max(0, receivedAtMs-timestamp);
            latest = { sensorIntervalMs, receiptIntervalMs, sampleAgeMs, accuracyM };
            add(sensor, sensorIntervalMs); add(receipt, receiptIntervalMs); add(age, sampleAgeMs);
            accuracy[accuracyM <= 10 ? "upTo10" : accuracyM <= 25 ? "upTo25" : accuracyM <= 50 ? "upTo50" : "over50"]++;
            speed[!finite(fix.speed) || fix.speed < 0 ? "missing" : fix.speed === 0 ? "zero" : "moving"]++;
            heading[finite(fix.heading) && fix.heading >= 0 && fix.heading < 360 ? "available" : "missing"]++;
            reads++; previousTimestamp = timestamp; previousReceipt = receivedAtMs;
            return true;
        }
        function recordMotion(event = {}) {
            if (finished) return;
            if (nonnegative(event.durationMs) !== null) motion.maxDurationMs = Math.max(motion.maxDurationMs, event.durationMs);
            if (nonnegative(event.renderDelayMs) !== null) motion.maxRenderDelayMs = Math.max(motion.maxRenderDelayMs, event.renderDelayMs);
            if (event.phase === "sample") {
                const reason = reasons.has(event.reason) ? event.reason : "unknown";
                motion.samples++; motion[event.active === true ? "animated" : "immediate"]++;
                motion.reasons[reason] = (motion.reasons[reason] || 0)+1;
                motion.lastReason = reason;
                animating = event.active === true; paused = false;
            } else if (event.phase === "frame" && event.active === false && animating) {
                motion.completed++; animating = false;
            } else if (event.phase === "paused") {
                if (!paused) motion.paused++;
                animating = false; paused = true;
            }
        }
        function snapshot() {
            return { version: 1, reads, latest: { ...latest },
                intervals: { sensorMeanMs: sensor.mean, sensorMaxMs: sensor.max, receiptMeanMs: receipt.mean, receiptMaxMs: receipt.max },
                age: { meanMs: age.mean, maxMs: age.max }, accuracy: { ...accuracy }, speed: { ...speed }, heading: { ...heading },
                motion: { ...motion, reasons: { ...motion.reasons } } };
        }
        function finish() {
            finished = true; previousTimestamp = previousReceipt = null;
            animating = false; paused = true;
        }
        reset();
        return { recordFix, recordMotion, snapshot, reset, finish };
    }
    const api = { create };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.PetFlowGpsQuality = api;
})(typeof window !== "undefined" ? window : globalThis);
