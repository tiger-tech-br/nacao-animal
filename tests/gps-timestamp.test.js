"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { capturedAt } = require("../services/gpsTimestamp");

test("horario do sensor permanece intacto e publicacao legada continua compativel", () => {
    const now=Date.parse("2026-10-23T12:00:00.000Z"), value="2026-10-23T11:59:58.000Z";
    assert.equal(capturedAt(value,now),value);
    assert.equal(capturedAt(undefined,now),null);
});
test("rejeita leitura antiga, futura ou calendario invalido sem expor seu conteudo", () => {
    const now=Date.parse("2026-10-23T12:00:00.000Z");
    for(const value of [null,0,{},"invalid-private-content","2026-10-23T11:59:29.999Z","2026-10-23T12:00:05.001Z","2026-02-30T12:00:00.000Z"]) {
        assert.throws(()=>capturedAt(value,now),error=>error.status===400 && !error.message.includes(String(value)));
    }
    assert.equal(capturedAt("2026-10-23T11:59:30.000Z",now),"2026-10-23T11:59:30.000Z");
    assert.equal(capturedAt("2026-10-23T12:00:05.000Z",now),"2026-10-23T12:00:05.000Z");
});
