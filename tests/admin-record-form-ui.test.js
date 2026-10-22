"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/js/pages/admin/admin-page.js"), "utf8");
const instrumented = source.replace(/\}\)\(\);\s*$/, `
    window.__recordTest = {
        buildForm, setupRecordFormNavigation, editRecord, resetForm, saveRecord,
        setRecords(value) { records = value; },
        getEditingId() { return editingId; }
    };
})();`);

function deferred() {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

function node(extra = {}) {
    const listeners = new Map();
    return {
        value: "", textContent: "", innerHTML: "", disabled: false, hidden: false,
        dataset: {}, attributes: {}, children: [], focusCount: 0,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
        focus(options) { this.focusCount++; this.focusOptions = options; },
        addEventListener(name, listener) { listeners.set(name, listener); },
        async dispatch(name, event = {}) { await listeners.get(name)?.({ preventDefault() {}, ...event }); },
        appendChild(child) { this.children.push(child); },
        ...extra
    };
}

function page({ config = {}, apiPost, apiPut, apiGet = async () => [], reducedMotion = false } = {}) {
    const settings = {
        key: "produtos", endpoint: "/produtos", formTitle: "Novo produto",
        columns: [{ key: "nome", label: "Nome" }], fields: [{ name: "nome", label: "Nome" }],
        allowEdit: true, allowDelete: false, ...config
    };
    const nodes = Object.fromEntries(["recordForm", "formTitle", "tableTitle", "statusLine", "tableHead", "tableBody", "pageSearch"]
        .map(id => [id, node()]));
    const scrolls = [];
    const formHeader = node();
    const formPanel = node({
        scrollIntoView(options) { scrolls.push({ section: "form", options }); },
        querySelector: selector => selector === ".panel-header" ? formHeader : null
    });
    const tablePanel = node({ scrollIntoView(options) { scrolls.push({ section: "list", options }); } });
    nodes.formTitle.closest = () => formPanel;
    nodes.tableTitle.closest = () => tablePanel;
    nodes.recordForm.closest = () => formPanel;

    function append(parent, child) {
        parent.children.push(child);
        if (child.id) nodes[child.id] = child;
    }
    formHeader.appendChild = child => append(formHeader, child);
    const toolbar = node();
    toolbar.appendChild = child => append(toolbar, child);

    let markup = "";
    Object.defineProperty(nodes.recordForm, "innerHTML", {
        get() { return markup; },
        set(value) {
            markup = value;
            for (const id of ["cancelEdit", "saveRecord", "recordFormStatus"]) delete nodes[id];
            nodes.recordForm.elements = {};
            const controls = [];
            for (const [, attributes] of value.matchAll(/<input\b([^>]+)>/g)) {
                const name = attributes.match(/\bname="([^"]+)"/)?.[1];
                if (!name) continue;
                const input = node({ value: attributes.match(/\bvalue="([^"]*)"/)?.[1] || "", disabled: /\bdisabled\b/.test(attributes) });
                nodes.recordForm.elements[name] = input;
                controls.push(input);
            }
            for (const id of ["cancelEdit", "saveRecord"]) {
                if (value.includes(`id="${id}"`)) { nodes[id] = node(); controls.push(nodes[id]); }
            }
            if (value.includes('id="recordFormStatus"')) nodes.recordFormStatus = node({ hidden: true });
            nodes.recordForm.querySelectorAll = () => controls;
        }
    });
    const document = node({
        getElementById: id => nodes[id] || null,
        querySelector(selector) {
            if (selector === ".toolbar") return toolbar;
            const name = selector.match(/^\[name="([^"]+)"\]$/)?.[1];
            return name ? nodes.recordForm.elements?.[name] || null : null;
        },
        createElement: () => node()
    });
    const mutations = [];
    const window = { PetFlowAdminPage: settings, matchMedia: () => ({ matches: reducedMotion }) };
    vm.runInNewContext(instrumented, {
        document, window,
        apiGet,
        apiPost: async (endpoint, payload) => {
            mutations.push({ method: "POST", endpoint, payload: { ...payload } });
            return apiPost?.(endpoint, payload);
        },
        apiPut: async (endpoint, payload) => {
            mutations.push({ method: "PUT", endpoint, payload: { ...payload } });
            return apiPut?.(endpoint, payload);
        }
    });
    if (settings.key !== "vendas") window.__recordTest.buildForm();
    return { hooks: window.__recordTest, nodes, mutations, toolbar, formHeader, scrolls };
}

test("atalho abre o formulário sem apagar valores e retorno leva à lista", async () => {
    const ui = page();
    ui.hooks.setupRecordFormNavigation();
    ui.hooks.setupRecordFormNavigation();
    assert.equal(ui.toolbar.children.length, 1);
    assert.equal(ui.nodes.openRecordForm.textContent, "Novo produto");
    assert.equal(ui.nodes.openRecordForm.attributes["aria-controls"], "recordForm");
    ui.nodes.recordForm.elements.nome.value = "Produto ainda não salvo";
    await ui.nodes.openRecordForm.dispatch("click");
    assert.equal(ui.nodes.recordForm.elements.nome.value, "Produto ainda não salvo");
    assert.equal(ui.scrolls[0].section, "form");
    assert.equal(ui.nodes.formTitle.focusCount, 1);
    assert.equal(ui.nodes.formTitle.focusOptions.preventScroll, true);
    await ui.formHeader.children[0].dispatch("click");
    assert.equal(ui.scrolls[1].section, "list");
    assert.equal(ui.nodes.tableTitle.focusCount, 1);
});

test("editar preenche o registro, destaca as ações e leva até o formulário sem animação quando solicitada", () => {
    const ui = page({ reducedMotion: true });
    ui.hooks.setupRecordFormNavigation();
    ui.hooks.setRecords([{ id: "produto-1", nome: "Bola" }]);
    ui.hooks.editRecord("produto-1");
    assert.equal(ui.hooks.getEditingId(), "produto-1");
    assert.equal(ui.nodes.recordForm.elements.nome.value, "Bola");
    assert.equal(ui.nodes.openRecordForm.textContent, "Continuar edição");
    assert.equal(ui.nodes.cancelEdit.textContent, "Cancelar edição");
    assert.equal(ui.nodes.saveRecord.textContent, "Salvar alterações");
    assert.equal(ui.scrolls[0].options.behavior, "auto");
    ui.hooks.editRecord("inexistente");
    assert.equal(ui.scrolls.length, 1);
    ui.hooks.resetForm();
    assert.equal(ui.hooks.getEditingId(), null);
    assert.equal(ui.nodes.recordForm.elements.nome.value, "");
    assert.equal(ui.nodes.openRecordForm.textContent, "Novo produto");
});

test("envios repetidos geram só uma compra e bloqueiam controles enquanto a API aguarda", async () => {
    const pending = deferred();
    const ui = page({ config: { key: "compras", endpoint: "/compras", formTitle: "Registrar compra" }, apiPost: () => pending.promise });
    ui.hooks.setupRecordFormNavigation();
    ui.nodes.recordForm.elements.nome.value = "Reposição de teste";
    const first = ui.hooks.saveRecord({ preventDefault() {} });
    await ui.hooks.saveRecord({ preventDefault() {} });
    assert.equal(ui.mutations.length, 1);
    assert.equal(ui.mutations[0].endpoint, "/compras");
    assert.equal(ui.nodes.recordForm.attributes["aria-busy"], "true");
    assert.equal(ui.nodes.recordForm.elements.nome.disabled, true);
    assert.equal(ui.nodes.saveRecord.disabled, true);
    assert.equal(ui.nodes.saveRecord.textContent, "Salvando...");
    assert.equal(ui.nodes.openRecordForm.disabled, true);
    await ui.nodes.openRecordForm.dispatch("click");
    assert.equal(ui.scrolls.length, 0);
    pending.resolve({});
    await first;
    assert.equal(ui.nodes.recordForm.attributes["aria-busy"], "false");
    assert.equal(ui.nodes.saveRecord.disabled, false);
    assert.equal(ui.nodes.openRecordForm.disabled, false);
    assert.equal(ui.nodes.recordFormStatus.dataset.state, "success");
    assert.equal(ui.nodes.recordFormStatus.textContent, "Registro salvo com sucesso.");
});

test("falha preserva dados e registro em edição, restaura controles e permite tentar de novo", async () => {
    const pending = deferred();
    let attempts = 0;
    const ui = page({ apiPut: () => ++attempts === 1 ? pending.promise : Promise.resolve({}) });
    ui.hooks.setupRecordFormNavigation();
    ui.hooks.setRecords([{ id: "produto-1", nome: "Bola" }, { id: "produto-2", nome: "Coleira" }]);
    ui.hooks.editRecord("produto-1");
    const input = ui.nodes.recordForm.elements.nome;
    input.value = "Bola atualizada";
    input.disabled = true;
    const first = ui.hooks.saveRecord({ preventDefault() {} });
    ui.hooks.editRecord("produto-2");
    assert.equal(ui.hooks.getEditingId(), "produto-1");
    pending.reject(new Error("Não foi possível salvar <produto>."));
    await first;
    assert.equal(ui.nodes.recordForm.elements.nome, input);
    assert.equal(input.value, "Bola atualizada");
    assert.equal(input.disabled, true, "estado originalmente desabilitado é preservado");
    assert.equal(ui.nodes.cancelEdit.disabled, false);
    assert.equal(ui.nodes.recordFormStatus.dataset.state, "error");
    assert.equal(ui.nodes.recordFormStatus.textContent, "Não foi possível salvar <produto>.");
    assert.equal(ui.nodes.recordFormStatus.innerHTML, "");
    await ui.hooks.saveRecord({ preventDefault() {} });
    assert.equal(ui.mutations.length, 2);
    assert.ok(ui.mutations.every(call => call.method === "PUT" && call.endpoint === "/produtos/produto-1"));
    assert.equal(ui.hooks.getEditingId(), null);
});

test("registro já salvo não é apresentado como falha quando só a atualização da lista falha", async () => {
    const ui = page({ apiGet: async () => { throw new Error("Lista indisponível"); } });
    ui.nodes.recordForm.elements.nome.value = "Bola";
    await ui.hooks.saveRecord({ preventDefault() {} });
    assert.equal(ui.mutations.length, 1);
    assert.equal(ui.nodes.recordFormStatus.dataset.state, "info");
    assert.match(ui.nodes.recordFormStatus.textContent, /^Registro salvo\. Não foi possível atualizar a lista/);
    assert.equal(ui.nodes.saveRecord.disabled, false);
});

test("configurações salvam por PUT sem ID e mantêm texto de alterações", async () => {
    const ui = page({ config: { key: "configuracoes", mode: "single", endpoint: "/empresa", formTitle: "Editar empresa" }, apiGet: async () => [{ nome: "Nação Animal" }] });
    ui.hooks.setupRecordFormNavigation();
    assert.equal(ui.formHeader.children[0].textContent, "Ver dados atuais");
    ui.nodes.recordForm.elements.nome.value = "Nação Animal";
    await ui.hooks.saveRecord({ preventDefault() {} });
    assert.equal(ui.mutations[0].method, "PUT");
    assert.equal(ui.mutations[0].endpoint, "/empresa");
    assert.equal(ui.nodes.saveRecord.textContent, "Salvar alterações");
    assert.equal(ui.nodes.recordForm.elements.nome.value, "Nação Animal");
});

for (const config of [{ key: "clientes", readOnly: true }, { key: "vendas" }]) {
    test(`${config.key}: navegação de cadastro e salvamento genérico não alteram página de consulta`, async () => {
        const ui = page({ config });
        ui.hooks.setupRecordFormNavigation();
        await ui.hooks.saveRecord({ preventDefault() {} });
        assert.equal(ui.toolbar.children.length, 0);
        assert.equal(ui.mutations.length, 0);
    });
}
