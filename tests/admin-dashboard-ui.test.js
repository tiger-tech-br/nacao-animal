"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/pages/dashboard/dashboard.js"), "utf8");
const currency = value => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function element() {
    const events = new Map();
    const classes = new Set();
    return {
        textContent: "", innerHTML: "",
        classList: {
            add(value) { classes.add(value); },
            remove(value) { classes.delete(value); },
            contains(value) { return classes.has(value); }
        },
        addEventListener(name, listener) {
            const listeners = events.get(name) || [];
            listeners.push(listener);
            events.set(name, listeners);
        },
        async emit(name, event = {}) {
            for (const listener of events.get(name) || []) await listener({ target: this, ...event });
        }
    };
}

function storage(entries = []) {
    const values = new Map(entries);
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    };
}

function dashboardPage({ token = "admin-session", payload = {}, fetcher } = {}) {
    const metrics = Array.from({ length: 4 }, () => {
        const parts = { span: element(), strong: element(), small: element() };
        return { ...parts, querySelector: selector => parts[selector] || null };
    });
    const sales = element(), suppliers = element(), ranking = element();
    const refresh = element(), logout = element(), profile = element(), date = element();
    const session = storage(token ? [["token", token], ["user", "session-user"]] : []);
    const local = storage([["token", "remembered-token"], ["user", "remembered-user"]]);
    const requests = [], intervals = [], timeouts = [];
    const document = element();
    const lists = {
        ".sales-list": sales,
        ".supplier-list": suppliers,
        ".best-sellers-list": ranking
    };
    document.querySelector = selector => lists[selector]
        || ({ ".admin-profile a": logout, ".admin-profile span": profile })[selector]
        || null;
    document.querySelectorAll = selector => {
        if (selector === ".metric-card") return metrics;
        if (selector === ".metric-card strong") return metrics.map(card => card.strong);
        return selector.split(",").map(value => lists[value.trim()]).filter(Boolean);
    };
    document.getElementById = id => ({ btnAtualizar: refresh, dashboardDate: date })[id] || null;

    const window = {
        location: { href: "/admin/pages/dashboard/dashboard.html" },
        setInterval(callback, delay) { intervals.push({ callback, delay }); },
        setTimeout(callback, delay) { timeouts.push({ callback, delay }); }
    };
    const context = vm.createContext({
        document, window, sessionStorage: session, localStorage: local, Intl, Date,
        async fetch(url, options = {}) {
            requests.push({ url, options });
            if (fetcher) return fetcher(url, options);
            return { ok: true, json: async () => ({ success: true, data: payload }) };
        }
    });
    vm.runInContext(source, context);
    return { context, document, window, metrics, sales, suppliers, ranking, refresh, logout, profile, date, session, local, requests, intervals, timeouts };
}

const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

test("painel preserva a ordem e o significado dos quatro indicadores comerciais", () => {
    const ui = dashboardPage();
    ui.context.renderSummary({
        vendas_hoje: "1250.90", vendas_mes: "8050.55", total_pedidos: 4,
        contas_receber: "430.10", total_produtos: 15, total_clientes: 7,
        estoque_baixo: 2, compras_mes: "150.49"
    });

    assert.deepEqual(ui.metrics.map(card => card.span.textContent), [
        "Faturamento hoje", "Pedidos recebidos", "Produtos cadastrados", "Reposição pendente"
    ]);
    assert.deepEqual(ui.metrics.map(card => card.strong.textContent), [currency(1250.90), "4", "15", "2"]);
    assert.deepEqual(ui.metrics.map(card => card.small.textContent), [
        `${currency(8050.55)} no mês`, `${currency(430.10)} a receber`,
        "7 clientes cadastrados", `${currency(150.49)} em compras no mês`
    ]);

    ui.context.renderSummary({});
    assert.deepEqual(ui.metrics.map(card => card.strong.textContent), [currency(0), "0", "0", "0"]);
});

test("ranking apresenta quantidades reais e barras proporcionais sem valores negativos ou não finitos", () => {
    const ui = dashboardPage();
    ui.context.renderBestSellers([
        { nome: "Ração para cães", quantidade: "12" },
        { nome: "Petisco", quantidade: "3" },
        { nome: "Brinquedo", quantidade: 1 },
        { nome: "Quantidade negativa", quantidade: -4 },
        { nome: "Quantidade não finita", quantidade: Infinity }
    ]);

    assert.match(ui.ranking.innerHTML, /12 unidades vendidas/);
    assert.match(ui.ranking.innerHTML, /3 unidades vendidas/);
    assert.match(ui.ranking.innerHTML, /1 unidade vendida/);
    const widths = [...ui.ranking.innerHTML.matchAll(/--dashboard-bar-size:\s*([^%]+)%/g)].map(match => Number(match[1]));
    assert.deepEqual(widths, [100, 25, 8, 0, 0]);
    assert.ok(widths.every(value => Number.isFinite(value) && value >= 0 && value <= 100));
    assert.doesNotMatch(ui.ranking.innerHTML, /NaN|Infinity|-4 unidades/);

    ui.context.renderBestSellers([{ nome: "Sem quantidade", quantidade: "não numérico" }]);
    assert.match(ui.ranking.innerHTML, /0 unidades vendidas/);
    assert.match(ui.ranking.innerHTML, /--dashboard-bar-size:\s*0%/);
});

test("nomes de clientes e produtos são escapados e status desconhecido não injeta marcação", () => {
    const ui = dashboardPage();
    const attack = '</strong><img src=x onerror="alert(1)"> & texto';
    const unknownStatus = '\" data-attack-status=\"bad\"><script>alert(1)</script>';

    ui.context.renderSales([{
        id: "pedido-teste", cliente: attack, valor_total: 10,
        status: unknownStatus, data_venda: "2026-10-27T15:00:00Z"
    }]);
    assert.match(ui.sales.innerHTML, /&lt;\/strong&gt;&lt;img/);
    assert.match(ui.sales.innerHTML, /&amp; texto/);
    assert.match(ui.sales.innerHTML, /Status não informado/);
    assert.doesNotMatch(ui.sales.innerHTML, /<img|<script|data-attack-status/);

    ui.context.renderBestSellers([{ nome: attack, quantidade: 2 }]);
    assert.match(ui.ranking.innerHTML, /&lt;img/);
    assert.match(ui.ranking.innerHTML, /&quot;alert\(1\)&quot;/);
    assert.doesNotMatch(ui.ranking.innerHTML, /<img|<script/);
});

test("pedidos mostram o status e a data recebidos sem inventar uma etapa ou horário", () => {
    const ui = dashboardPage();
    ui.context.renderSales([{
        id: "pedido-real", cliente: "Cliente de teste", valor_total: "19.90",
        status: "SAIU_PARA_ENTREGA", data_venda: "2026-10-27T15:00:00Z"
    }]);
    assert.match(ui.sales.innerHTML, /Saiu para entrega/);
    assert.match(ui.sales.innerHTML, /27\/10/);
    assert.match(ui.sales.innerHTML, /12:00/);
    assert.ok(ui.sales.innerHTML.includes(currency(19.90)));

    ui.context.renderSales([{ id: "sem-data", status: "ENTREGUE", data_venda: "inválida" }]);
    assert.match(ui.sales.innerHTML, /Entregue/);
    assert.match(ui.sales.innerHTML, /Data não informada/);
    assert.doesNotMatch(ui.sales.innerHTML, /Invalid Date|NaN/);
});

test("resposta vazia substitui dados anteriores por estados vazios honestos", () => {
    const ui = dashboardPage();
    ui.context.renderSales([{ id: "anterior", cliente: "Cliente anterior", status: "ENTREGUE" }]);
    ui.context.renderBestSellers([{ nome: "Produto anterior", quantidade: 5 }]);
    ui.context.renderSuppliers([{ nome: "Reposição anterior", quantidade: 1 }], []);

    ui.context.renderSales([]);
    ui.context.renderBestSellers([]);
    ui.context.renderSuppliers([], []);

    assert.match(ui.sales.innerHTML, /Nenhum pedido registrado/);
    assert.match(ui.ranking.innerHTML, /quando houver vendas confirmadas/);
    assert.match(ui.suppliers.innerHTML, /Sem alertas de fornecedor ou estoque/);
    for (const node of [ui.sales, ui.ranking, ui.suppliers]) assert.doesNotMatch(node.innerHTML, /anterior/);
    assert.doesNotMatch(ui.ranking.innerHTML, /dashboard-ranking-meter/);
});

test("falha de atualização limpa indicadores e todas as listas, inclusive ranking, sem deixar dados antigos", async () => {
    const ui = dashboardPage({ fetcher: async () => ({ ok: false, status: 503 }) });
    ui.context.renderSummary({ vendas_hoje: 500, total_pedidos: 3, total_produtos: 7, estoque_baixo: 2 });
    ui.context.renderSales([{ id: "antigo", cliente: "Cliente anterior", status: "ENTREGUE" }]);
    ui.context.renderBestSellers([{ nome: "Produto anterior", quantidade: 8 }]);
    ui.context.renderSuppliers([], [{ fornecedor: "Fornecedor anterior", valor_total: 50 }]);

    await ui.context.loadDashboard();

    assert.deepEqual(ui.metrics.map(card => card.strong.textContent), ["-", "-", "-", "-"]);
    for (const node of [ui.sales, ui.ranking, ui.suppliers]) {
        assert.match(node.innerHTML, /Erro 503/);
        assert.doesNotMatch(node.innerHTML, /anterior|dashboard-ranking-meter/);
    }

    ui.context.renderDashboardError("Falha <temporária> & conexão");
    for (const node of [ui.sales, ui.ranking, ui.suppliers]) {
        assert.match(node.innerHTML, /Falha &lt;temporária&gt; &amp; conexão/);
        assert.doesNotMatch(node.innerHTML, /<temporária>/);
    }
});

test("inicialização autenticada consulta o endpoint existente e mantém atualização automática de 30 segundos", async () => {
    const ui = dashboardPage({ payload: { resumo: { total_pedidos: 6 }, produtosMaisVendidos: [{ nome: "Ração", quantidade: 2 }] } });
    await ui.document.emit("DOMContentLoaded");
    await settle();

    assert.equal(ui.window.location.href, "/admin/pages/dashboard/dashboard.html");
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.requests[0].url, "/api/dashboard");
    assert.equal(ui.requests[0].options.headers.Authorization, "Bearer admin-session");
    assert.equal(ui.metrics[1].strong.textContent, "6");
    assert.match(ui.ranking.innerHTML, /2 unidades vendidas/);
    assert.equal(ui.intervals.length, 1);
    assert.equal(ui.intervals[0].delay, 30000);
    await ui.intervals[0].callback();
    assert.equal(ui.requests.length, 2);
    assert.ok(ui.requests.every(request => request.url === "/api/dashboard"));
});

test("sem sessão ou com resposta 401 o painel mantém o redirecionamento ao login administrativo", async () => {
    const anonymous = dashboardPage({ token: null });
    anonymous.context.requireDashboardAuth();
    assert.equal(anonymous.window.location.href, "/admin/index.html");

    const expired = dashboardPage({ fetcher: async () => ({ ok: false, status: 401 }) });
    await expired.context.loadDashboard();
    assert.equal(expired.window.location.href, "/admin/index.html");
});

test("botões existentes continuam atualizando o painel e encerrando a sessão no servidor e no navegador", async () => {
    const ui = dashboardPage({ payload: { resumo: { total_pedidos: 9 } } });
    ui.context.bindDashboardActions();
    await ui.refresh.emit("click");
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.requests[0].url, "/api/dashboard");
    assert.equal(ui.metrics[1].strong.textContent, "9");
    assert.equal(ui.refresh.classList.contains("is-loading"), true);
    assert.equal(ui.timeouts.length, 1);
    ui.timeouts[0].callback();
    assert.equal(ui.refresh.classList.contains("is-loading"), false);

    await ui.logout.emit("click");
    assert.equal(ui.requests.length, 2);
    assert.equal(ui.requests[1].url, "/api/auth/logout");
    assert.equal(ui.requests[1].options.method, "POST");
    assert.equal(ui.requests[1].options.headers.Authorization, "Bearer admin-session");
    assert.equal(ui.requests[1].options.keepalive, true);
    for (const store of [ui.session, ui.local]) {
        assert.equal(store.getItem("token"), null);
        assert.equal(store.getItem("user"), null);
    }
});
