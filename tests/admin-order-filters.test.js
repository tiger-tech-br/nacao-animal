"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const filters = require("../public/js/pages/admin/order-filters");

test("helper de pedidos exporta a mesma API em CommonJS e no navegador", () => {
    const window = {};
    const source = fs.readFileSync(path.join(__dirname, "../public/js/pages/admin/order-filters.js"), "utf8");
    vm.runInNewContext(source, { window });
    assert.deepEqual(Object.keys(window.NacaoAnimalOrderFilters).sort(), Object.keys(filters).sort());
    assert.equal(window.NacaoAnimalOrderFilters.dateKey("2026-10-21T01:00:00Z"), "2026-10-20");
});

test("busca sem acentos combina campos JSON, status e período inclusivo", () => {
    const records = [
        { id: "inicio", cliente_nome: "João", status: "EM_SEPARACAO", data_venda: "2026-10-20T03:00:00Z" },
        { id: "fim", cliente_nome: "João", status: "EM_SEPARACAO", data_venda: "2026-10-22T02:59:59.999Z" },
        { id: "antes", cliente_nome: "João", status: "EM_SEPARACAO", data_venda: "2026-10-20T02:59:59.999Z" },
        { id: "depois", cliente_nome: "João", status: "EM_SEPARACAO", data_venda: "2026-10-22T03:00:00Z" },
        { id: "outro-status", cliente_nome: "João", status: "CANCELADA", data_venda: "2026-10-20" },
        { id: "outra-busca", cliente_nome: "Maria", status: "EM_SEPARACAO", data_venda: "2026-10-20" }
    ];

    assert.deepEqual(filters.filter(records, {
        query: " JOAO ", status: "EM_SEPARACAO", from: "2026-10-20", to: "2026-10-21"
    }).map(record => record.id), ["inicio", "fim"]);
});

test("busca reconhece os rótulos completos dos status configurados", () => {
    const labels = {
        AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
        PAGAMENTO_APROVADO: "Pedido recebido",
        EM_SEPARACAO: "Preparando",
        SAIU_PARA_ENTREGA: "Saiu para entrega",
        ENTREGUE: "Entregue",
        FINALIZADA: "Finalizado",
        CANCELADA: "Cancelado"
    };
    for (const [status, query] of Object.entries(labels)) {
        const record = { id: status, status };
        assert.deepEqual(filters.filter([record], { query: query.toUpperCase() }), [record]);
    }
    assert.deepEqual(filters.filter([{ id: "aninhado", observacoes: { detalhe: "Separação prioritária" } }], {
        query: "separacao prioritaria"
    }).map(record => record.id), ["aninhado"]);
});

test("datas de instantes respeitam a virada do dia em São Paulo, inclusive Date e offset", () => {
    assert.equal(filters.dateKey("2026-10-21T02:59:59.999Z"), "2026-10-20");
    assert.equal(filters.dateKey("2026-10-21T03:00:00Z"), "2026-10-21");
    assert.equal(filters.dateKey(new Date("2026-10-21T01:00:00Z")), "2026-10-20");
    assert.equal(filters.dateKey("2026-10-20T23:59:59-03:00"), "2026-10-20");
    assert.equal(filters.dateKey("2026-10-21T02:00:00+02:00"), "2026-10-20");
    assert.equal(filters.dateKey("2026-01-01T01:00:00Z"), "2025-12-31");
});

test("datas literais permanecem no dia informado e seguem o calendário", () => {
    assert.equal(filters.dateKey("2026-10-21"), "2026-10-21");
    assert.equal(filters.dateKey("2024-02-29"), "2024-02-29");
    assert.equal(filters.dateKey("2026-02-29"), "");
    assert.equal(filters.dateKey("2026-02-30T12:00:00Z"), "");
    assert.equal(filters.dateKey("2026-04-31"), "");
    assert.equal(filters.dateKey("2026-13-01"), "");
});

test("datas inválidas ou sem fuso não inventam um dia para o pedido", () => {
    for (const value of [null, undefined, "", "inválida", "2026-10-21T01:00:00", "2026-10-21T25:00:00Z", new Date(NaN)]) {
        assert.equal(filters.dateKey(value), "", String(value));
    }
    const records = [
        { id: "sem-data", status: "CANCELADA" },
        { id: "invalida", data_venda: "inválida" },
        { id: "valida", data_venda: "2026-10-20" }
    ];
    assert.deepEqual(filters.filter(records), records);
    assert.deepEqual(filters.filter(records, { from: "2026-10-20" }).map(record => record.id), ["valida"]);
    assert.deepEqual(filters.filter(records, { to: "2026-10-20" }).map(record => record.id), ["valida"]);
});

test("período rejeita datas inválidas ou invertidas sem retornar registros", () => {
    const records = [{ id: "pedido", data_venda: "2026-10-20" }];
    assert.equal(filters.validateRange(), "");
    assert.equal(filters.validateRange("2026-10-20", "2026-10-20"), "");
    assert.equal(filters.validateRange("2024-02-29", ""), "");
    for (const [from, to] of [
        ["2026-02-29", ""], ["", "inválida"], ["2026-10-22", "2026-10-21"],
        ["2026-10-20T00:00:00Z", ""], ["0000-01-01", ""]
    ]) {
        assert.notEqual(filters.validateRange(from, to), "");
        assert.deepEqual(filters.filter(records, { from, to }), []);
    }
});

test("filtros preservam a ordem e os objetos originais sem alterar a entrada", () => {
    const records = Object.freeze([
        Object.freeze({ id: "terceiro", status: "EM_SEPARACAO", data_venda: "2026-10-21" }),
        Object.freeze({ id: "primeiro", status: "ENTREGUE", data_venda: "2026-10-20" }),
        Object.freeze({ id: "segundo", status: "EM_SEPARACAO", data_venda: "2026-10-20" })
    ]);
    const result = filters.filter(records, { status: "EM_SEPARACAO" });
    assert.deepEqual(result.map(record => record.id), ["terceiro", "segundo"]);
    assert.equal(result[0], records[0]);
    assert.equal(result[1], records[2]);
    assert.notEqual(result, records);
    assert.deepEqual(records.map(record => record.id), ["terceiro", "primeiro", "segundo"]);
});

test("entregues, finalizados e cancelados são filtros individuais", () => {
    const records = ["ENTREGUE", "FINALIZADA", "CANCELADA", "PAGAMENTO_APROVADO"]
        .map(status => ({ id: status, status }));
    for (const { status } of records) {
        assert.deepEqual(filters.filter(records, { status }).map(record => record.status), [status]);
    }
    assert.equal(filters.matchesStatus("ENTREGUE", "FINALIZADA"), false);
    assert.equal(filters.matchesStatus("EM_SEPARACAO", " em_separacao "), true);
    assert.deepEqual(filters.filter(records, { status: "CONCLUIDOS" }), []);
});

test("status desconhecido ou ausente permanece em todos e não ganha rótulo conhecido", () => {
    const records = [{ id: "legado", status: "LEGADO" }, { id: "sem-status" }];
    assert.deepEqual(filters.filter(records), records);
    assert.equal(filters.matchesStatus("LEGADO", ""), true);
    assert.equal(filters.matchesStatus(undefined, ""), true);
    assert.equal(filters.matchesStatus("LEGADO", "CANCELADA"), false);
    assert.deepEqual(filters.filter(records, { status: "LEGADO" }), [records[0]]);
    assert.deepEqual(filters.filter(records, { query: "legado" }), [records[0]]);
    assert.deepEqual(filters.filter(records, { query: "cancelado" }), []);
});
