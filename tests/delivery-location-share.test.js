"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const links = require("../public/js/pages/delivery/location-share-link");

const valid = "https://maps.app.goo.gl/AbCdEf12345";

test("link de localização usa somente HTTPS oficial e preserva o identificador compartilhado", () => {
    const parsed = new URL(links.parse(`  ${valid}  `));
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.hostname, "maps.app.goo.gl");
    assert.equal(parsed.pathname, "/AbCdEf12345");
    assert.equal(parsed.username, "");
    assert.equal(parsed.password, "");
});

test("compartilhamento recusa protocolos executáveis, HTTP e links externos disfarçados", () => {
    for (const input of [
        "http://maps.app.goo.gl/AbCdEf12345", "javascript:alert(1)", "data:text/html,hello",
        "https://example.invalid/AbCdEf12345", "https://maps.app.goo.gl.example.invalid/AbCdEf12345",
        "https://maps.app.goo.gl@evil.invalid/AbCdEf12345", "https://evil.invalid@maps.app.goo.gl/AbCdEf12345",
        "https://maps.app.goo.gl:444/AbCdEf12345", "//maps.app.goo.gl/AbCdEf12345"
    ]) assert.throws(() => links.parse(input), undefined, input);
});

test("link compartilhado não aceita credenciais, fragmento privado nem caracteres de controle", () => {
    for (const input of [
        valid + "#private-token", "https://user:secret@maps.app.goo.gl/AbCdEf12345",
        "https://maps.app.goo.gl/AbCd\nEf12345", "https://maps.app.goo.gl/AbCd\tEf12345"
    ]) assert.throws(() => links.parse(input), undefined, input);
});

test("entrada vazia, objeto ou link incompleto não vira destino compartilhado", () => {
    for (const input of [null, undefined, {}, [], "", "   ", "maps.app.goo.gl/AbCdEf12345", "https://maps.app.goo.gl/"])
        assert.throws(() => links.parse(input));
});

test("limite de URL bloqueia payload excessivo antes de armazenar ou expor o link", () => {
    assert.throws(() => links.parse("https://maps.app.goo.gl/" + "a".repeat(2100)));
});

test("Google Maps legado e endereço longo aceitam somente o domínio esperado", () => {
    for (const input of ["https://goo.gl/maps/AbCdEf12345", "https://www.google.com/maps/@-23.66,-46.55,15z/data=!4m5!7m4!1m2!1sshared-test"])
        assert.equal(links.parse(input),input);
});

test("link visivelmente estático de rota, pesquisa ou estabelecimento não vira acompanhamento ao vivo", () => {
    for (const path of ["dir/?api=1&destination=store", "search/?api=1&query=store", "place/store", "embed?x=1", "d/u/0/viewer?mid=test", "preview?x=1"])
        assert.throws(() => links.parse("https://www.google.com/maps/" + path));
});
