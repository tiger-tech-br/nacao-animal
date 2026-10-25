"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness, response, address, settle } = require("./helpers/delivery-status-harness");

test("URL codificada que ultrapassa 2048 caracteres não é oferecida como navegação válida", async () => {
    const oversized = { ...address, endereco: "Á".repeat(700) };
    const h = harness("driver", { data: { status: "SAIU_PARA_ENTREGA", endereco_entrega: oversized } });
    await settle();
    assert.equal(h.elements.navigateGoogleMaps.hidden, true);
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.equal(h.elements.reloadDelivery.disabled, false, "Corrigir o endereço deve permitir uma nova consulta");
});

test("complemento permanece visível ao entregador, mas só o endereço de navegação é enviado ao Maps", async () => {
    const h = harness("driver", { data: { status: "SAIU_PARA_ENTREGA", endereco_entrega: { ...address, numero: 0, complemento: "Casa dos fundos, portão lateral" } } });
    await settle();
    const url = new URL(h.elements.navigateGoogleMaps.href);
    assert.match(h.elements.destinationAddress.textContent, /Casa dos fundos, portão lateral/);
    assert.doesNotMatch(url.searchParams.get("destination"), /Casa dos fundos|portão/);
    assert.match(url.searchParams.get("destination"), /, 0, /, "Número zero continua sendo endereço informado");
    assert.equal(url.searchParams.has("origin"), false);
    assert.equal(url.hash, "");
});

test("endereço de tipo inesperado bloqueia destino e permite tentar novamente após correção", async () => {
    for (const invalid of [[], "Rua exemplo", { ...address, endereco: {} }, { ...address, numero: [] }]) {
        const h = harness("driver", { data: { status: "SAIU_PARA_ENTREGA", endereco_entrega: invalid } });
        await settle();
        assert.equal(h.elements.navigateGoogleMaps.href, undefined);
        assert.equal(h.elements.reloadDelivery.disabled, false);
        h.data({ status: "SAIU_PARA_ENTREGA", endereco_entrega: address });
        await h.elements.reloadDelivery.events.click();
        assert.equal(h.elements.navigateGoogleMaps.hidden, false);
    }
});

test("inicialização, pageshow e clique repetido aguardam a mesma consulta pendente", async () => {
    let finish;
    const h = harness("driver", { responder: () => new Promise(resolve => { finish = resolve; }) });
    h.events.pageshow();
    await h.elements.reloadDelivery.events.click();
    assert.equal(h.calls.length, 1);
    assert.equal(h.elements.reloadDelivery.disabled, true);
    finish(response({ status: "SAIU_PARA_ENTREGA", endereco_entrega: address }));
    await settle();
    assert.equal(h.elements.navigateGoogleMaps.hidden, false);
    assert.equal(h.elements.reloadDelivery.disabled, false);
});

test("página de rota abre Maps por ação explícita com referrer protegido e explica status pelo site", () => {
    const html = fs.readFileSync("views/delivery/driver.html", "utf8");
    assert.match(html, /id="navigateGoogleMaps"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*referrerpolicy="no-referrer"/);
    assert.match(html, /name="referrer" content="no-referrer"/);
    assert.match(html, /Navegar no Google Maps/);
    assert.match(html, /status do pedido no site/);
    assert.doesNotMatch(html, /<script[^>]+(?:map|navigation|route-options)\.js/);
});
