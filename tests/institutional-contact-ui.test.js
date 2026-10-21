"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function contactPage(data, options = {}) {
    const elements = Object.fromEntries(["address", "map", "phone", "email", "email-note", "hours"].map(name => [
        name,
        { textContent: `initial-${name}`, href: `initial-${name}`, hidden: name === "email" }
    ]));
    let requests = 0;
    const context = {
        document: {
            addEventListener() {},
            querySelector(selector) {
                const name = selector.match(/^\[data-contact-(.+)\]$/)?.[1];
                return elements[name] || null;
            }
        },
        async fetch(url) {
            assert.equal(url, "/api/public/loja");
            requests++;
            if (options.failure) throw new Error("API indisponível");
            return { ok: options.ok !== false, json: async () => ({ success: options.success !== false, data }) };
        }
    };
    vm.runInNewContext(fs.readFileSync("public/js/pages/institutional/contact.js", "utf8"), context);
    return { elements, load: () => context.loadContactStoreInfo(), requests: () => requests };
}

test("contato aplica dados reais sem HTML e monta links de mapa, telefone e e-mail", async () => {
    const street = '<script>alert("endereço")</script>';
    const email = "contato+loja@example.com";
    const page = contactPage({
        endereco: street, numero: 256, bairro: "Sacadura Cabral", cidade: "Santo André", estado: "SP", cep: "09060-820",
        telefone: "(11) 4421-5284", email, horario_abertura: "09:00:00", horario_fechamento: "18:30:00"
    });
    await page.load();
    assert.equal(page.requests(), 1);
    const address = `${street}, 256, Sacadura Cabral, Santo André, SP, 09060-820`;
    assert.equal(page.elements.address.textContent, address);
    assert.equal(page.elements.map.href, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
    assert.equal(page.elements.phone.textContent, "(11) 4421-5284");
    assert.equal(page.elements.phone.href, "tel:+551144215284");
    assert.equal(page.elements.email.textContent, email);
    assert.equal(page.elements.email.href, `mailto:${encodeURIComponent(email)}`);
    assert.equal(page.elements.email.hidden, false);
    assert.equal(page.elements["email-note"].hidden, true);
    assert.equal(page.elements.hours.textContent, "Das 09:00 às 18:30. Consulte os dias de atendimento com a loja.");
});

test("contato preserva dados conhecidos quando a consulta falha ou retorna payload inválido", async () => {
    for (const data of [null, [], "loja", undefined]) {
        const page = contactPage(data);
        await page.load();
        assert.equal(page.elements.address.textContent, "initial-address");
        assert.equal(page.elements.phone.href, "initial-phone");
        assert.equal(page.elements.email.hidden, true);
    }
    for (const options of [{ failure: true }, { ok: false }, { success: false }]) {
        const page = contactPage({ endereco: "Não aplicar", email: "contato@example.com" }, options);
        await page.load();
        assert.equal(page.elements.address.textContent, "initial-address");
        assert.equal(page.elements.email.hidden, true);
    }
});

test("contato não inventa horários ou links quando os dados estão ausentes ou inválidos", async () => {
    for (const data of [
        {},
        { email: "inválido", telefone: "123", horario_abertura: "25:00", horario_fechamento: "12:80" },
        { email: "loja@example.com?body=texto com espaço", telefone: null, horario_abertura: "08:00", horario_fechamento: null }
    ]) {
        const page = contactPage(data);
        await page.load();
        assert.equal(page.elements.address.textContent, "initial-address");
        assert.equal(page.elements.map.href, "initial-map");
        assert.equal(page.elements.phone.href, "initial-phone");
        assert.equal(page.elements.email.hidden, true);
        assert.equal(page.elements.hours.textContent, "initial-hours");
    }
    const page = contactPage({ telefone: "+55 (11) 91571-2903" });
    await page.load();
    assert.equal(page.elements.phone.href, "tel:+5511915712903");
});
