"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const original = fs.readFileSync("views/delivery/tracking.html", "utf8");
const storefront = fs.readFileSync("views/delivery/public-tracking.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");

function ids(html) {
    return [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
}

test("rastreamento público preserva cada ID do mapa, resumo e controles administrativos originais", () => {
    const publicIds = ids(storefront);
    for (const id of ids(original)) {
        assert.equal(publicIds.filter(value => value === id).length, 1, `Contrato preservado e único: ${id}`);
    }
    assert.match(storefront, /id="trackingStage"[^>]*\bhidden/);
    assert.match(storefront, /id="deliveryMap"[^>]*\bhidden/);
    assert.match(storefront, /id="trackingLogin"[^>]*\bhidden/);
    assert.match(storefront, /id="expandTrackingMap"[^>]*aria-pressed="false"/);
});

test("público e administrador usam documentos separados mantendo os scripts de rastreamento", () => {
    const publicRoute = app.match(/app\.get\("\/acompanhar-entrega",[\s\S]*?\n\}\);/)?.[0];
    const adminRoute = app.match(/app\.get\("\/admin\/acompanhar-entrega",[\s\S]*?\n\}\);/)?.[0];
    assert.match(publicRoute || "", /"public-tracking\.html"/);
    assert.match(adminRoute || "", /"tracking\.html"/);
    assert.doesNotMatch(adminRoute || "", /public-tracking/);
    assert.match(adminRoute || "", /Cache-Control.*no-store/);
    for (const html of [original, storefront]) {
        assert.match(html, /name="robots" content="noindex,nofollow"/);
        const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => new URL(match[1], "http://localhost").pathname);
        assert.ok(scripts.includes("/js/pages/delivery/map.js"));
        assert.ok(scripts.includes("/js/pages/delivery/navigation-engine.js"));
        assert.ok(scripts.includes("/js/pages/delivery/tracking.js"));
        assert.ok(scripts.indexOf("/js/pages/delivery/map.js") < scripts.indexOf("/js/pages/delivery/navigation-engine.js"));
        assert.ok(scripts.indexOf("/js/pages/delivery/navigation-engine.js") < scripts.indexOf("/js/pages/delivery/tracking.js"));
    }
    assert.match(storefront, /body class="storefront-page tracking-page tracking-storefront"/);
    assert.doesNotMatch(original, /storefront-theme|tracking-storefront/);
});

test("páginas de rastreamento mantêm exceção de mapas e política de referrer existente", () => {
    const security = fs.readFileSync("middlewares/securityMiddleware.js", "utf8");
    const mapPages = security.match(/const mapPages = \[([^\]]+)\]/)?.[1] || "";
    assert.match(mapPages, /"\/acompanhar-entrega"/);
    assert.match(mapPages, /"\/admin\/acompanhar-entrega"/);
    assert.match(security, /setHeader\("Referrer-Policy", "strict-origin-when-cross-origin"\)/);
});
