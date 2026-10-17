"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const service = require("../services/cupomService");
const coupon = { codigo: "PETFLOW10", tipo: "PERCENTUAL", valor: "10", ativo: true, minimo_compra: "0", inicia_em: "2020-01-01", expira_em: null };

test("cupom arredonda em centavos, respeita teto e não ultrapassa os produtos", () => {
    assert.equal(service.calcularDesconto(coupon, 329), 33);
    assert.equal(service.calcularDesconto(coupon, 5980), 598);
    assert.equal(service.calcularDesconto({ ...coupon, desconto_maximo: "5" }, 5980), 500);
    assert.equal(service.calcularDesconto({ ...coupon, tipo: "FIXO", valor: "100" }, 329), 329);
});

test("cupons inválidos, inativos, futuros, expirados e abaixo do mínimo são rejeitados", () => {
    for (const invalid of [null, { ...coupon, ativo: false }, { ...coupon, inicia_em: "2100-01-01" },
        { ...coupon, expira_em: "2021-01-01" }, { ...coupon, minimo_compra: "100" }]) {
        assert.throws(() => service.calcularDesconto(invalid, 329), error => error.status === 400);
    }
    assert.throws(() => service.calcularDesconto(coupon, 0));
    assert.equal(service.normalizarCodigo(" petflow10 "), "PETFLOW10");
    for (const invalid of [[], {}, "", "A".repeat(41), "CODE';--"]) assert.throws(() => service.normalizarCodigo(invalid));
});

test("prévia ignora preços enviados e soma produtos repetidos com escopo da empresa", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const db = { query: async (sql, args) => {
        assert.match(sql, /empresa_id=\$1/);
        assert.deepEqual(args, ["loja", [id]]);
        return { rows: [{ id, preco: "3.29" }] };
    } };
    const itens = [{ produto_id: id, quantidade: 1, preco: .01 }, { produto_id: id, quantidade: 2, preco: .01 }];
    assert.equal(await service.subtotalSacola(db, "loja", itens), 987);
    await assert.rejects(service.subtotalSacola(db, "loja", [{ produto_id: id, quantidade: 1.5 }]));
    await assert.rejects(service.subtotalSacola({ query: async () => ({ rows: [] }) }, "loja", itens));
});

test("validação final bloqueia edição concorrente e consulta cupom da empresa", async () => {
    const db = { query: async (sql, args) => {
        assert.match(sql, /FOR SHARE/);
        assert.deepEqual(args, ["loja", "PETFLOW10"]);
        return { rows: [coupon] };
    } };
    assert.equal((await service.validar(db, "loja", " petflow10 ", 329, true)).desconto, .33);
    await assert.rejects(service.validar({ query: async () => ({ rows: [] }) }, "outra-loja", "PETFLOW10", 329));
});
