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

test("acompanhamento público e administrativo compartilham IDs de status e endereço", () => {
    const publicIds = ids(storefront);
    for (const id of ids(original)) {
        assert.equal(publicIds.filter(value => value === id).length, 1, `Contrato preservado e único: ${id}`);
    }
    assert.match(storefront, /id="trackingDetails"[^>]*\bhidden/);
    assert.match(storefront, /id="trackingLogin"[^>]*\bhidden/);
    assert.doesNotMatch(storefront, /id="deliveryMap"|id="trackingLive"|id="trackingArrival"/);
});

test("público e administrador usam documentos separados sem carregar navegação ou mapas", () => {
    const publicRoute = app.match(/app\.get\("\/acompanhar-entrega",[\s\S]*?\n\}\);/)?.[0];
    const adminRoute = app.match(/app\.get\("\/admin\/acompanhar-entrega",[\s\S]*?\n\}\);/)?.[0];
    assert.match(publicRoute || "", /"public-tracking\.html"/);
    assert.match(adminRoute || "", /"tracking\.html"/);
    assert.doesNotMatch(adminRoute || "", /public-tracking/);
    assert.match(adminRoute || "", /Cache-Control.*no-store/);
    for (const html of [original, storefront]) {
        assert.match(html, /name="robots" content="noindex,nofollow"/);
        const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => new URL(match[1], "http://localhost").pathname);
        assert.ok(scripts.includes("/js/pages/delivery/tracking.js"));
        assert.ok(!scripts.includes("/js/pages/delivery/map.js"));
        assert.ok(!scripts.includes("/js/pages/delivery/navigation-engine.js"));
        assert.match(html, /O entregador usa o Google Maps/);
    }
    assert.match(storefront, /body class="storefront-page tracking-page tracking-storefront"/);
    assert.doesNotMatch(original, /storefront-theme|tracking-storefront/);
});

test("entregador abre apenas Google Maps sem dependências da navegação própria", () => {
    const driver = fs.readFileSync("views/delivery/driver.html", "utf8");
    assert.match(driver, /id="navigateGoogleMaps"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(driver, /referrerpolicy="no-referrer"/);
    assert.match(driver, /Esta página não compartilha sua localização/);
    assert.doesNotMatch(driver, /(?:map|navigation|navigation-engine|route-options)\.js|id="startGps"/);
});
