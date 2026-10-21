"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const orderFilters = require("../public/js/pages/admin/order-filters");

const source = fs.readFileSync(path.join(__dirname, "../public/js/pages/admin/admin-page.js"), "utf8");
const closingIife = /\}\)\(\);\s*$/;
assert.match(source, closingIife);
// Os hooks existem apenas nesta cópia em memória, sem expor estado no produto.
const instrumentedSource = source.replace(closingIife, `
    window.__ordersTest = {
        readSalesFilters, getFilteredRecords, setupSalesFilters, renderTable,
        exportCsv, showSaleDetails, renderSaleEmptyState, bindEvents,
        setRecords(value) { records = value; },
        setPage(value) { currentPage = value; },
        getPage() { return currentPage; },
        getSelectedSaleId() { return selectedSaleId; }
    };
})();`);

function element(extra = {}) {
    const listeners = new Map();
    return {
        value: "", innerHTML: "", textContent: "", hidden: false, disabled: false,
        dataset: {}, attributes: {}, validationMessage: "",
        setAttribute(name, value) { this.attributes[name] = String(value); },
        setCustomValidity(message) { this.validationMessage = message; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        closest() { return null; },
        addEventListener(name, callback) {
            const callbacks = listeners.get(name) || [];
            callbacks.push(callback);
            listeners.set(name, callbacks);
        },
        async dispatch(name, event = {}) {
            const dispatched = { target: this, preventDefault() {}, ...event };
            for (const callback of listeners.get(name) || []) await callback(dispatched);
        },
        ...extra
    };
}

function adminPage({ key = "vendas", apiGet = () => assert.fail("Consulta inesperada"), dateConstructor = Date } = {}) {
    const elements = Object.fromEntries([
        "pageSearch", "orderFilters", "orderStatusFilter", "orderDateFrom", "orderDateTo",
        "clearOrderFilters", "orderFilterError", "orderFilterSummary", "tableHead", "tableBody",
        "recordForm", "formTitle", "statusLine"
    ].map(id => [id, element()]));
    elements.orderFilterError.hidden = true;
    elements.orderFilterError.setAttribute("role", "alert");
    elements.orderFilters.reset = () => {
        for (const id of ["orderStatusFilter", "orderDateFrom", "orderDateTo"]) elements[id].value = "";
    };
    const pipeline = ["EM_SEPARACAO", "CANCELADA"].map(status => element({
        dataset: { pipelineStatus: status }, attributes: { "aria-pressed": "false" }
    }));
    const exportButton = element();
    const pagination = element();
    const wrap = element({ parentElement: { querySelector: () => pagination } });
    let scrolls = 0;
    elements.recordForm.closest = selector => selector === ".panel"
        ? { scrollIntoView() { scrolls++; } }
        : null;
    const downloads = [];
    const blobs = [];
    const revokedUrls = [];
    const document = element({
        getElementById: id => elements[id] || null,
        querySelector: selector => ({
            "[data-export-csv]": exportButton, ".table-wrap": wrap
        })[selector] || null,
        querySelectorAll: selector => selector === "button[data-pipeline-status]" ? pipeline : [],
        createElement(tag) {
            assert.equal(tag, "a");
            return element({ click() { downloads.push({ href: this.href, filename: this.download }); } });
        }
    });
    const columns = key === "vendas"
        ? [{ key: "id", label: "ID" }, { key: "cliente_nome", label: "Cliente" },
            { key: "status", label: "Status" }, { key: "data_venda", label: "Data" }]
        : [{ key: "id", label: "ID" }, { key: "nome", label: "Nome" }];
    const window = {
        PetFlowAdminPage: { key, endpoint: `/${key}`, columns, allowEdit: false, allowDelete: false },
        NacaoAnimalOrderFilters: orderFilters
    };
    vm.runInNewContext(instrumentedSource, {
        window, document, Blob, apiGet, Date: dateConstructor,
        URL: {
            createObjectURL(blob) { blobs.push(blob); return `blob:teste-${blobs.length}`; },
            revokeObjectURL(url) { revokedUrls.push(url); }
        }
    });
    return {
        hooks: window.__ordersTest, elements, document, pipeline, exportButton, pagination,
        downloads, blobs, revokedUrls, scrolls: () => scrolls
    };
}

function order(id, extra = {}) {
    return {
        id, cliente_nome: "João de Teste", status: "EM_SEPARACAO",
        data_venda: "2026-10-21T12:00:00Z", valor_final: 20, quantidade_itens: 1,
        forma_pagamento: "PIX", ...extra
    };
}

function shownOrderIds(ui) {
    return [...ui.elements.tableBody.innerHTML.matchAll(/\bdata-id="([^"]+)"/g)].map(match => match[1]);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

test("filtros combinados exibem e exportam os mesmos pedidos de todas as páginas", async () => {
    const ui = adminPage();
    const expected = Array.from({ length: 32 }, (_, index) => order(`pedido-${String(index).padStart(2, "0")}`));
    expected[0].data_venda = "2026-10-20T03:00:00Z";
    expected.at(-1).data_venda = "2026-10-22T02:59:59.999Z";
    ui.hooks.setRecords([
        ...expected,
        order("cliente-diferente", { cliente_nome: "Maria de Teste" }),
        order("status-diferente", { status: "CANCELADA" }),
        order("antes-do-periodo", { data_venda: "2026-10-20T02:59:59.999Z" }),
        order("depois-do-periodo", { data_venda: "2026-10-22T03:00:00Z" })
    ]);
    ui.elements.pageSearch.value = " JOAO ";
    ui.elements.orderStatusFilter.value = "EM_SEPARACAO";
    ui.elements.orderDateFrom.value = "2026-10-20";
    ui.elements.orderDateTo.value = "2026-10-21";
    assert.deepEqual({ ...ui.hooks.readSalesFilters() }, {
        query: " JOAO ", status: "EM_SEPARACAO", from: "2026-10-20", to: "2026-10-21"
    });
    assert.deepEqual(ui.hooks.getFilteredRecords(), expected);
    ui.hooks.setPage(2);
    ui.hooks.renderTable();
    assert.deepEqual(shownOrderIds(ui), expected.slice(25).map(item => item.id));
    assert.equal(ui.hooks.getPage(), 2);
    assert.match(ui.pagination.innerHTML, /32 registro\(s\) · página 2 de 2/);
    assert.equal(ui.elements.orderFilterSummary.textContent, "32 de 36 pedidos exibidos.");
    assert.equal(ui.pipeline[0].attributes["aria-pressed"], "true");

    ui.hooks.exportCsv();
    assert.equal(ui.downloads.length, 1);
    assert.match(ui.downloads[0].filename, /^vendas-\d{4}-\d{2}-\d{2}\.csv$/);
    const rows = (await ui.blobs[0].text()).replace(/^\uFEFF/, "").split("\r\n");
    assert.equal(rows.shift(), '"ID";"Cliente";"Status";"Data"');
    assert.deepEqual(rows.map(row => row.split(";")[0].slice(1, -1)), expected.map(item => item.id));
    assert.deepEqual(ui.revokedUrls, [ui.downloads[0].href]);
    assert.equal(ui.hooks.getPage(), 2, "Exportar não muda a página selecionada");
});

for (const id of ["orderStatusFilter", "orderDateFrom", "orderDateTo"]) {
    test(`alterar ${id} reinicia a primeira página mesmo com várias páginas restantes`, async () => {
        const ui = adminPage();
        ui.hooks.setRecords(Array.from({ length: 80 }, (_, index) => order(`pedido-${index}`)));
        ui.hooks.setupSalesFilters();
        ui.hooks.setPage(3);
        ui.elements[id].value = {
            orderStatusFilter: "EM_SEPARACAO", orderDateFrom: "2026-10-20", orderDateTo: "2026-10-22"
        }[id];
        await ui.elements[id].dispatch("change");
        assert.equal(ui.hooks.getPage(), 1);
        assert.equal(shownOrderIds(ui).length, 25);
        assert.match(ui.pagination.innerHTML, /página 1 de 4/);
    });
}

test("pipeline alterna o status, atualiza estado acessível e volta à primeira página", async () => {
    const ui = adminPage();
    ui.hooks.setRecords(Array.from({ length: 80 }, (_, index) => order(`pedido-${index}`)));
    ui.hooks.setupSalesFilters();
    ui.hooks.setPage(3);
    await ui.pipeline[0].dispatch("click");
    assert.equal(ui.elements.orderStatusFilter.value, "EM_SEPARACAO");
    assert.equal(ui.pipeline[0].attributes["aria-pressed"], "true");
    assert.equal(ui.pipeline[1].attributes["aria-pressed"], "false");
    assert.equal(ui.hooks.getPage(), 1);
    ui.hooks.setPage(3);
    await ui.pipeline[0].dispatch("click");
    assert.equal(ui.elements.orderStatusFilter.value, "");
    assert.equal(ui.pipeline[0].attributes["aria-pressed"], "false");
    assert.equal(ui.hooks.getPage(), 1);
});

test("limpar filtros remove busca, status e datas e volta à primeira página", async () => {
    const ui = adminPage();
    ui.hooks.setRecords(Array.from({ length: 80 }, (_, index) => order(`pedido-${index}`)));
    ui.hooks.setupSalesFilters();
    ui.elements.pageSearch.value = "João";
    ui.elements.orderStatusFilter.value = "EM_SEPARACAO";
    ui.elements.orderDateFrom.value = "2026-10-20";
    ui.elements.orderDateTo.value = "2026-10-22";
    ui.hooks.setPage(3);
    await ui.elements.clearOrderFilters.dispatch("click");
    assert.deepEqual({ ...ui.hooks.readSalesFilters() }, { query: "", status: "", from: "", to: "" });
    assert.equal(ui.hooks.getPage(), 1);
    assert.equal(ui.elements.orderFilterSummary.textContent, "80 de 80 pedidos exibidos.");
    assert.equal(ui.pipeline[0].attributes["aria-pressed"], "false");
});

test("busca e envio do formulário reiniciam a primeira página sem enviar a tela", async () => {
    const ui = adminPage();
    ui.hooks.setRecords(Array.from({ length: 80 }, (_, index) => order(`pedido-${index}`)));
    ui.hooks.setupSalesFilters();
    ui.hooks.bindEvents();
    ui.hooks.setPage(3);
    ui.elements.pageSearch.value = "João";
    await ui.elements.pageSearch.dispatch("input");
    assert.equal(ui.hooks.getPage(), 1);
    let prevented = false;
    ui.hooks.setPage(3);
    await ui.elements.orderFilters.dispatch("submit", { preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(ui.hooks.getPage(), 1);
});

test("período invertido exibe alerta, bloqueia CSV e se recupera após corrigir a data", async () => {
    const ui = adminPage();
    ui.hooks.setRecords([order("pedido-valido")]);
    ui.hooks.setupSalesFilters();
    ui.elements.orderDateFrom.value = "2026-10-22";
    ui.elements.orderDateTo.value = "2026-10-21";
    ui.hooks.renderTable();
    const error = ui.elements.orderFilterError;
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /data inicial não pode ser posterior à data final/);
    assert.equal(ui.elements.orderDateTo.validationMessage, error.textContent);
    assert.equal(ui.exportButton.disabled, true);
    assert.match(ui.elements.orderFilterSummary.textContent, /Ajuste o período/);
    assert.match(ui.elements.tableBody.innerHTML, /Confira o período selecionado/);
    ui.hooks.exportCsv();
    assert.equal(ui.downloads.length, 0, "A função também impede exportação fora do botão");
    assert.equal(ui.blobs.length, 0);

    ui.elements.orderDateFrom.value = "2026-10-20";
    await ui.elements.orderDateFrom.dispatch("change");
    assert.equal(error.hidden, true);
    assert.equal(error.textContent, "");
    assert.equal(ui.elements.orderDateTo.validationMessage, "");
    assert.equal(ui.exportButton.disabled, false);
    assert.deepEqual(shownOrderIds(ui), ["pedido-valido"]);
});

for (const deviceZone of ["UTC", "Pacific/Honolulu"]) {
    test(`datas dos pedidos usam Brasília mesmo com dispositivo em ${deviceZone}`, () => {
        const displayedZones = [];
        class DeviceDate extends Date {
            toLocaleString(locale, options) {
                displayedZones.push(options.timeZone);
                return super.toLocaleString(locale, { timeZone: deviceZone, ...options });
            }
        }
        const ui = adminPage({ dateConstructor: DeviceDate });
        ui.hooks.setRecords([
            order("meia-noite-utc", { data_venda: "2026-10-21T00:00:00Z" }),
            order("antes-da-virada", { data_venda: "2026-10-21T02:59:59Z" }),
            order("depois-da-virada", { data_venda: "2026-10-21T03:00:00Z" }),
            order("data-literal", { data_venda: "2026-10-21" }),
            order("data-invalida", { data_venda: "2026-02-30" }),
            order("sem-data", { data_venda: null })
        ]);
        ui.hooks.renderTable();
        const dates = [...ui.elements.tableBody.innerHTML.matchAll(/<dt>Data<\/dt>\s*<dd>([^<]+)<\/dd>/g)]
            .map(match => match[1]);
        assert.equal(dates.length, 6);
        assert.match(dates[0], /^20\/10\/2026.*21:00$/);
        assert.match(dates[1], /^20\/10\/2026.*23:59$/);
        assert.match(dates[2], /^21\/10\/2026.*00:00$/);
        assert.equal(dates[3], "21/10/2026", "Data literal conserva o dia sem criar horário");
        assert.equal(dates[4], "Data inválida");
        assert.equal(dates[5], "Data não informada");
        assert.deepEqual(displayedZones, Array(3).fill("America/Sao_Paulo"));
    });
}

for (const staleResult of ["sucesso", "erro"]) {
    test(`detalhes de B continuam selecionados após ${staleResult} tardio de A`, async () => {
        const a = deferred();
        const b = deferred();
        const requests = [];
        const ui = adminPage({ apiGet(url) {
            requests.push(url);
            assert.ok(["/vendas/A", "/vendas/B"].includes(url));
            return url.endsWith("/A") ? a.promise : b.promise;
        } });
        const first = ui.hooks.showSaleDetails("A");
        assert.equal(ui.elements.recordForm.attributes["aria-busy"], "true");
        const second = ui.hooks.showSaleDetails("B");
        b.resolve({ ...order("B"), cliente: { nome: "Cliente B de Teste" } });
        await second;
        const selectedMarkup = ui.elements.recordForm.innerHTML;
        assert.match(selectedMarkup, /Cliente B de Teste/);
        assert.equal(ui.hooks.getSelectedSaleId(), "B");
        if (staleResult === "sucesso") a.resolve({ ...order("A"), cliente: { nome: "Cliente A de Teste" } });
        else a.reject(new Error("Falha antiga de A"));
        await first;
        assert.equal(ui.elements.recordForm.innerHTML, selectedMarkup);
        assert.equal(ui.hooks.getSelectedSaleId(), "B");
        assert.equal(ui.elements.recordForm.attributes["aria-busy"], "false");
        assert.equal(ui.scrolls(), 1);
        assert.deepEqual(requests, ["/vendas/A", "/vendas/B"]);
    });
}

test("resposta antiga não encerra indicador enquanto o pedido atual aguarda", async () => {
    const a = deferred();
    const b = deferred();
    const ui = adminPage({ apiGet: url => url.endsWith("/A") ? a.promise : b.promise });
    const first = ui.hooks.showSaleDetails("A");
    const second = ui.hooks.showSaleDetails("B");
    a.resolve(order("A"));
    await first;
    assert.match(ui.elements.recordForm.innerHTML, /Carregando pedido/);
    assert.equal(ui.elements.recordForm.attributes["aria-busy"], "true");
    assert.equal(ui.hooks.getSelectedSaleId(), "B");
    b.resolve(order("B"));
    await second;
    assert.equal(ui.elements.recordForm.attributes["aria-busy"], "false");
});

for (const staleResult of ["sucesso", "erro"]) {
    test(`fechar detalhes invalida ${staleResult} de consulta que ainda aguarda`, async () => {
        const pending = deferred();
        const ui = adminPage({ apiGet: () => pending.promise });
        ui.hooks.bindEvents();
        const loading = ui.hooks.showSaleDetails("A");
        await ui.document.dispatch("click", {
            target: { closest: selector => selector === "[data-action='clear-details']" ? {} : null }
        });
        const emptyMarkup = ui.elements.recordForm.innerHTML;
        assert.match(emptyMarkup, /Selecione um pedido/);
        assert.equal(ui.hooks.getSelectedSaleId(), null);
        assert.equal(ui.elements.recordForm.attributes["aria-busy"], "false");
        if (staleResult === "sucesso") pending.resolve(order("A"));
        else pending.reject(new Error("Falha após fechar"));
        await loading;
        assert.equal(ui.elements.recordForm.innerHTML, emptyMarkup);
        assert.equal(ui.hooks.getSelectedSaleId(), null);
        assert.equal(ui.elements.recordForm.attributes["aria-busy"], "false");
        assert.equal(ui.scrolls(), 0);
    });
}

test("outras páginas preservam busca genérica, paginação e CSV sem aplicar filtros de pedidos", async () => {
    const ui = adminPage({ key: "clientes" });
    const expected = { id: "cliente-1", nome: "São Bernardo de Teste" };
    ui.hooks.setRecords([expected, { id: "cliente-2", nome: "Outro Cliente de Teste" }]);
    ui.hooks.setupSalesFilters();
    ui.hooks.bindEvents();
    ui.elements.orderStatusFilter.value = "CANCELADA";
    ui.elements.orderDateFrom.value = "2026-10-22";
    ui.elements.orderDateTo.value = "2026-10-21";
    ui.elements.pageSearch.value = " SAO BERNARDO ";
    ui.hooks.setPage(3);
    await ui.elements.pageSearch.dispatch("input");
    assert.deepEqual(ui.hooks.getFilteredRecords(), [expected]);
    assert.equal(ui.hooks.getPage(), 1);
    assert.match(ui.elements.tableBody.innerHTML, /São Bernardo de Teste/);
    assert.doesNotMatch(ui.elements.tableBody.innerHTML, /Outro Cliente/);
    assert.equal(ui.exportButton.disabled, false);
    assert.equal(ui.elements.orderFilterError.hidden, true);
    ui.hooks.exportCsv();
    const csv = await ui.blobs[0].text();
    assert.match(csv, /"cliente-1";"São Bernardo de Teste"/);
    assert.doesNotMatch(csv, /cliente-2/);
});
