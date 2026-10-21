"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/pages/auth/public-auth.js", "utf8");
const steps = [
    ["AGUARDANDO_PAGAMENTO", "Pedido criado"],
    ["PAGAMENTO_APROVADO", "Pedido recebido"],
    ["EM_SEPARACAO", "Preparando"],
    ["SAIU_PARA_ENTREGA", "Saiu para entrega"],
    ["ENTREGUE", "Entregue"]
];

function ordersPage() {
    const context = vm.createContext({ document: { addEventListener() {} } });
    vm.runInContext(source, context);
    return context;
}

function timelineItems(markup) {
    return [...markup.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)]
        .map(([, attributes, content]) => ({ attributes, content }));
}

for (const [currentIndex, [status]] of steps.entries()) {
    test(`linha do tempo mantém a progressão de ${status}`, () => {
        const markup = ordersPage().renderOrderTimeline(status);
        const items = timelineItems(markup);
        assert.equal(items.length, steps.length);
        assert.match(markup, /<ol class="order-timeline" aria-label="Andamento do pedido">/);
        for (const [index, item] of items.entries()) {
            const done = index <= currentIndex;
            assert.equal(item.attributes.includes('class="is-done"'), done, steps[index][1]);
            assert.equal(item.content.includes("✓"), done, steps[index][1]);
            assert.ok(item.attributes.includes(`aria-label="${steps[index][1]}: ${done ? "concluído" : "aguardando"}"`));
            assert.match(item.content, /<span aria-hidden="true">/);
        }
    });
}

test("pedido finalizado mostra todas as etapas concluídas e identifica o encerramento", () => {
    const markup = ordersPage().renderOrderTimeline("FINALIZADA");
    const items = timelineItems(markup);
    assert.equal(items.length, steps.length);
    assert.match(markup, /aria-label="Andamento do pedido: finalizado"/);
    assert.doesNotMatch(markup, /aguardando/);
    for (const item of items) {
        assert.match(item.attributes, /class="is-done"/);
        assert.match(item.attributes, /: concluído"/);
        assert.match(item.content, /✓/);
    }
});

test("pedido cancelado é terminal e não apresenta etapas futuras ou concluídas", () => {
    const markup = ordersPage().renderOrderTimeline("CANCELADA");
    assert.match(markup, /class="order-timeline-state is-canceled"/);
    assert.match(markup, /Pedido cancelado/);
    assert.match(markup, /acompanhamento deste pedido foi encerrado/);
    assert.doesNotMatch(markup, /<ol\b|<li\b|is-done|✓|aguardando/i);
    for (const [, label] of steps) assert.ok(!markup.includes(label));
});

test("status desconhecido ou ausente não inventa progresso nem interpola conteúdo externo", () => {
    const page = ordersPage();
    for (const status of ["NOVO_STATUS", "PENDENTE", "", null, undefined, '<img src=x onerror="alert(1)">']) {
        const markup = page.renderOrderTimeline(status);
        assert.match(markup, /Andamento do pedido indisponível/);
        assert.doesNotMatch(markup, /<ol\b|<li\b|is-done|is-canceled|✓|<img\b|onerror/);
    }
});

test("cartão de pedido aplica a linha do tempo sem alterar pagamento e atendimento", () => {
    const page = ordersPage();
    for (const status of ["AGUARDANDO_PAGAMENTO", "FINALIZADA", "CANCELADA", "NOVO_STATUS"]) {
        const list = { innerHTML: "" };
        page.renderOrders(list, [{
            id: "pedido-teste", status, itens: [], valor_final: 20, valor_frete: 0
        }]);
        assert.ok(list.innerHTML.includes(page.renderOrderTimeline(status)));
        assert.equal(list.innerHTML.includes("data-continue-payment="), status === "AGUARDANDO_PAGAMENTO");
        assert.match(list.innerHTML, /data-request-order="pedido-teste"/);
        if (status === "FINALIZADA") assert.match(list.innerHTML, /Solicitar devolução/);
        if (status === "CANCELADA") {
            assert.match(list.innerHTML, /data-cancel-available="false"/);
            assert.match(list.innerHTML, /Solicitar atendimento/);
        }
    }
});
