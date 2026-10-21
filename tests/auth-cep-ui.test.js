"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/pages/auth/public-auth.js", "utf8");
const address = { cep: "09060820", endereco: "Rua dos Testes", bairro: "Vila Teste", cidade: "Santo André", estado: "SP" };
const response = (data, status = 200) => ({
    ok: status >= 200 && status < 300, status, json: async () => status === 200 ? { data } : { message: data }
});
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function cepPage(fetch) {
    const timers = new Map();
    let timerId = 0;
    const document = { activeElement: null, addEventListener() {}, querySelectorAll: () => [fields.cep] };
    function element(name) {
        return {
            name, value: "", dataset: {}, attributes: {}, listeners: new Map(), disabled: false,
            addEventListener(event, callback) {
                if (!this.listeners.has(event)) this.listeners.set(event, []);
                this.listeners.get(event).push(callback);
            },
            emit(event, detail = {}) {
                return Promise.all((this.listeners.get(event) || []).map(callback => callback({ target: this, ...detail })));
            },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name] ?? null; },
            closest: () => form,
            focus() { document.activeElement = this; }
        };
    }
    const fields = Object.fromEntries(["cep", "endereco", "bairro", "cidade", "estado", "numero", "complemento"].map(name => [name, element(name)]));
    const status = { textContent: "" };
    const form = Object.assign(element("form"), { elements: fields, querySelector: () => status });
    const window = {
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
        clearTimeout: id => timers.delete(id)
    };
    const context = vm.createContext({ window, document, fetch, AbortController });
    vm.runInContext(source, context);
    context.setupCepLookup();
    return {
        fields, form, status, document, timers,
        inputCep(value) { fields.cep.value = value; return fields.cep.emit("input"); },
        async edit(name, value) { fields[name].value = value; await fields[name].emit("input"); },
        fireTimers(delay) {
            const promises = [];
            for (const [id, timer] of [...timers]) {
                if (timer.delay !== delay) continue;
                timers.delete(id);
                promises.push(timer.callback());
            }
            return Promise.all(promises);
        }
    };
}

test("cadastro/conta consultam CEP anônimo pela API local, sem duplicar input e blur", async () => {
    const pending = deferred();
    const requests = [];
    const page = cepPage((url, options) => { requests.push({ url, options }); return pending.promise; });
    page.fields.numero.value = "123";
    page.fields.complemento.value = "Casa 2";
    page.fields.cep.focus();
    await page.inputCep("0906082");
    await page.fireTimers(350);
    assert.equal(requests.length, 0);
    await page.inputCep("09060820");
    assert.equal(page.fields.cep.value, "09060-820");
    assert.equal(requests.length, 0);
    const lookup = page.fireTimers(350);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/public/frete/cep/09060820");
    assert.equal(requests[0].options.headers?.Authorization, undefined);
    assert.equal(page.fields.cep.getAttribute("aria-busy"), "true");
    await page.fields.cep.emit("blur");
    assert.equal(requests.length, 1, "Blur não duplica a busca que já está pendente");
    page.fields.numero.focus();
    pending.resolve(response(address));
    await lookup;
    for (const name of ["endereco", "bairro", "cidade", "estado"]) assert.equal(page.fields[name].value, address[name]);
    assert.equal(page.fields.cep.value, "09060-820");
    assert.equal(page.fields.numero.value, "123");
    assert.equal(page.fields.complemento.value, "Casa 2");
    assert.equal(page.document.activeElement, page.fields.numero);
    assert.match(page.status.textContent, /Endereço encontrado/);
    assert.equal(page.fields.cep.getAttribute("aria-busy"), "false");
    assert.equal(page.timers.size, 0);
});

test("resposta antiga nunca substitui o endereço do novo CEP", async () => {
    const first = deferred();
    const requests = [];
    const latest = { ...address, cep: "04101000", endereco: "Rua Nova", cidade: "São Paulo" };
    const page = cepPage((url, options) => {
        requests.push({ url, options });
        return requests.length === 1 ? first.promise : Promise.resolve(response(latest));
    });
    await page.inputCep(address.cep);
    const oldLookup = page.fireTimers(350);
    await page.inputCep(latest.cep);
    assert.equal(requests[0].options.signal.aborted, true);
    await page.fireTimers(350);
    const currentStatus = page.status.textContent;
    first.resolve(response(address));
    await oldLookup;
    assert.equal(page.fields.cep.value, "04101-000");
    assert.equal(page.fields.endereco.value, "Rua Nova");
    assert.equal(page.fields.cidade.value, "São Paulo");
    assert.equal(page.status.textContent, currentStatus);
    assert.equal(page.fields.cep.getAttribute("aria-busy"), "false");
});

test("consulta preserva endereço manual anterior e edições feitas durante a busca", async () => {
    const pending = deferred();
    const page = cepPage(() => pending.promise);
    await page.edit("endereco", "Rua preenchida manualmente");
    page.fields.numero.value = "7B";
    page.fields.complemento.value = "Fundos";
    await page.inputCep(address.cep);
    const lookup = page.fireTimers(350);
    await page.edit("bairro", "Meu bairro");
    page.fields.cidade.value = "Cidade editada sem evento";
    page.fields.complemento.focus();
    pending.resolve(response(address));
    await lookup;
    assert.equal(page.fields.endereco.value, "Rua preenchida manualmente");
    assert.equal(page.fields.bairro.value, "Meu bairro");
    assert.equal(page.fields.cidade.value, "Cidade editada sem evento");
    assert.equal(page.fields.estado.value, "SP");
    assert.equal(page.fields.numero.value, "7B");
    assert.equal(page.fields.complemento.value, "Fundos");
    assert.equal(page.document.activeElement, page.fields.complemento);
    assert.match(page.status.textContent, /Mantivemos os campos que você editou/);
});

test("CEP inválido/não encontrado avisa e mantém o endereço editável", async () => {
    let calls = 0;
    const page = cepPage(async () => { ++calls; return response("CEP não encontrado.", 404); });
    await page.inputCep("09060");
    await page.fields.cep.emit("blur");
    assert.equal(calls, 0);
    assert.match(page.status.textContent, /8 dígitos/);
    await page.edit("endereco", "Rua Manual");
    await page.inputCep("99999999");
    await page.fireTimers(350);
    assert.equal(calls, 1);
    assert.match(page.status.textContent, /CEP não encontrado/);
    assert.match(page.status.textContent, /manualmente/);
    assert.equal(page.fields.endereco.value, "Rua Manual");
    for (const field of Object.values(page.fields)) assert.equal(field.disabled, false);
});

test("timeout do CEP informa como continuar e libera nova tentativa", async () => {
    let calls = 0;
    const page = cepPage((_url, options) => {
        ++calls;
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
        }));
    });
    await page.inputCep(address.cep);
    const lookup = page.fireTimers(350);
    await page.fireTimers(15000);
    await lookup;
    assert.match(page.status.textContent, /demorou demais/);
    assert.match(page.status.textContent, /manualmente/);
    assert.equal(page.fields.cep.getAttribute("aria-busy"), "false");
    const retry = page.fields.cep.emit("blur");
    assert.equal(calls, 2);
    await page.fireTimers(15000);
    await retry;
});

test("falha de rede permite repetir o mesmo CEP sem bloquear a digitação", async () => {
    let calls = 0;
    const page = cepPage(async () => {
        if (++calls === 1) throw new TypeError("Failed to fetch");
        return response(address);
    });
    await page.inputCep(address.cep);
    await page.fireTimers(350);
    assert.match(page.status.textContent, /Não foi possível consultar o CEP/);
    let prevented = false;
    await page.fields.cep.emit("keydown", { key: "Enter", preventDefault() { prevented = true; } });
    // O handler de teclado inicia a operação sem aguardar o envio do formulário.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prevented, true);
    assert.equal(calls, 2);
    assert.equal(page.fields.endereco.value, address.endereco);
    assert.match(page.status.textContent, /Endereço encontrado/);
});

test("reset do cadastro cancela consulta pendente e impede preencher o formulário limpo", async () => {
    const pending = deferred();
    let signal;
    const page = cepPage((_url, options) => { signal = options.signal; return pending.promise; });
    await page.inputCep(address.cep);
    const lookup = page.fireTimers(350);
    await page.form.emit("reset");
    for (const field of Object.values(page.fields)) field.value = "";
    assert.equal(signal.aborted, true);
    pending.resolve(response(address));
    await lookup;
    assert.equal(page.fields.endereco.value, "");
    assert.equal(page.fields.cep.value, "");
    assert.equal(page.status.textContent, "");
    assert.equal(page.fields.cep.getAttribute("aria-busy"), "false");
});

test("CEP genérico mantém campos manuais e orienta completar o endereço", async () => {
    const page = cepPage(async () => response({ cep: address.cep, endereco: "", bairro: "", cidade: "Santo André", estado: "SP" }));
    await page.edit("endereco", "Estrada Manual");
    await page.edit("bairro", "Bairro Manual");
    await page.inputCep(address.cep);
    await page.fireTimers(350);
    assert.equal(page.fields.endereco.value, "Estrada Manual");
    assert.equal(page.fields.bairro.value, "Bairro Manual");
    assert.equal(page.fields.cidade.value, "Santo André");
    assert.match(page.status.textContent, /Complete ou confira/);
});

test("cadastro e conta ligam o CEP a uma mensagem acessível; conta oferece nova tentativa", () => {
    for (const [file, status] of [["login", "registerCepStatus"], ["account", "accountCepStatus"]]) {
        const html = fs.readFileSync(`views/auth/${file}.html`, "utf8");
        assert.ok(html.includes(`aria-describedby="${status}"`));
        assert.match(html, new RegExp(`id="${status}"[^>]*data-cep-status[^>]*role="status"[^>]*aria-live="polite"`));
    }
    const account = fs.readFileSync("views/auth/account.html", "utf8");
    assert.match(account, /id="publicAccountRetry"[^>]*type="button"[^>]*hidden>Tentar novamente/);
    assert.match(account, /id="accountStatus"[^>]*role="status"[^>]*aria-live="polite"/);
});
