"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/layout/customer-logout-dialog.js", "utf8");
const title = "Deseja sair da sua conta?";
const description = "Os dados desta sessão serão removidos deste navegador. Seu cadastro e seus pedidos continuam salvos.";

function page(options = {}) {
    const elements = [];
    const confirmations = [];
    const externalAccess = [];
    const document = { activeElement: null };

    class Element {
        constructor(tag) {
            this.tagName = tag.toUpperCase();
            this.children = [];
            this.attributes = {};
            this.listeners = new Map();
            this.dataset = {};
            this.textContent = "";
            this.className = "";
            this.parentElement = null;
            this.open = false;
            this.focusCount = 0;
            this.showCount = 0;
            this.closeCount = 0;
            this.removeCount = 0;
            if (tag === "dialog" && options.native === false) this.showModal = undefined;
            elements.push(this);
        }
        get isConnected() {
            return this === document.body || Boolean(this.parentElement?.isConnected);
        }
        appendChild(child) {
            child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1);
            child.parentElement = this;
            this.children.push(child);
            return child;
        }
        append(...children) { children.forEach(child => this.appendChild(child)); }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        getAttribute(name) { return this.attributes[name] ?? null; }
        addEventListener(name, callback, settings) {
            if (!this.listeners.has(name)) this.listeners.set(name, []);
            this.listeners.get(name).push({ callback, once: settings?.once === true });
        }
        removeEventListener(name, callback) {
            this.listeners.set(name, (this.listeners.get(name) || []).filter(listener => listener.callback !== callback));
        }
        emit(name, extra = {}) {
            const event = {
                target: this,
                defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; },
                ...extra
            };
            for (const listener of [...(this.listeners.get(name) || [])]) {
                if (listener.once) this.removeEventListener(name, listener.callback);
                listener.callback(event);
            }
            return event;
        }
        focus() {
            ++this.focusCount;
            document.activeElement = this;
        }
        showModal() {
            ++this.showCount;
            if (options.showThrows) throw new Error("Dialog indisponível");
            this.open = true;
            find(this, element => element.autofocus || element.attributes.autofocus !== undefined)?.focus();
        }
        close(value = "") {
            ++this.closeCount;
            this.returnValue = value;
            this.open = false;
            this.emit("close");
        }
        remove() {
            ++this.removeCount;
            if (this.parentElement) {
                this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
                this.parentElement = null;
            }
        }
    }

    function find(root, predicate) {
        if (predicate(root)) return root;
        for (const child of root.children) {
            const result = find(child, predicate);
            if (result) return result;
        }
        return null;
    }

    document.body = new Element("body");
    document.createElement = tag => new Element(tag);
    const trigger = document.body.appendChild(new Element("button"));
    trigger.focus();
    const window = {};
    if (options.confirmAvailable !== false) {
        window.confirm = message => {
            confirmations.push(message);
            if (options.confirmThrows) throw new Error("Confirm indisponível");
            return options.confirmResult ?? false;
        };
    }
    const globals = { window, document: options.documentAvailable === false ? undefined : document };
    for (const target of [window, globals]) {
        for (const storage of ["sessionStorage", "localStorage"]) {
            Object.defineProperty(target, storage, {
                get() { externalAccess.push(storage); throw new Error("Storage não pertence à interface de confirmação"); }
            });
        }
        target.fetch = () => { externalAccess.push("fetch"); throw new Error("Rede não pertence à interface de confirmação"); };
    }
    vm.runInNewContext(source, globals);

    return {
        window, document, trigger, confirmations, externalAccess,
        confirm: triggerElement => window.NacaoAnimalLogoutDialog.confirm(triggerElement),
        dialogs: () => elements.filter(element => element.tagName === "DIALOG" && element.isConnected),
        button: text => find(document.body, element => element.tagName === "BUTTON" && element.textContent === text),
        find: predicate => find(document.body, predicate),
        secondTrigger: () => document.body.appendChild(new Element("button"))
    };
}

test("logout abre diálogo acessível e inicia foco em Continuar na conta", async () => {
    const h = page();
    const pending = h.confirm(h.trigger);
    const [dialog] = h.dialogs();
    assert.ok(dialog.open);
    assert.equal(dialog.showCount, 1);
    assert.match(dialog.className, /(?:^|\s)customer-logout-dialog(?:\s|$)/);
    const heading = h.find(element => element.id === dialog.getAttribute("aria-labelledby"));
    const message = h.find(element => element.id === dialog.getAttribute("aria-describedby"));
    assert.equal(heading?.textContent, title);
    assert.equal(message?.textContent, description);
    assert.equal(h.document.activeElement, h.button("Continuar na conta"));
    assert.equal(h.button("Continuar na conta").type, "button");
    assert.equal(h.button("Sim, sair").type, "button");
    h.button("Continuar na conta").emit("click");
    assert.equal(await pending, false);
    assert.deepEqual(h.externalAccess, []);
});

test("somente Sim, sair confirma e remove o diálogo restaurando o foco", async () => {
    const h = page();
    const pending = h.confirm(h.trigger);
    const [dialog] = h.dialogs();
    h.button("Sim, sair").emit("click");
    assert.equal(await pending, true);
    assert.equal(h.dialogs().length, 0);
    assert.equal(dialog.open, false);
    assert.equal(dialog.removeCount, 1);
    assert.equal(h.document.activeElement, h.trigger);
    assert.equal(h.trigger.focusCount, 2);
    assert.deepEqual(h.externalAccess, []);
});

for (const action of ["Continuar na conta", "fechar", "Escape", "fechamento externo"]) {
    test(`logout cancelado por ${action} retorna false e restaura o foco`, async () => {
        const h = page();
        const pending = h.confirm(h.trigger);
        const [dialog] = h.dialogs();
        if (action === "Continuar na conta") h.button(action).emit("click");
        if (action === "fechar") {
            const close = h.find(element => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "Fechar");
            assert.ok(close);
            close.emit("click");
        }
        if (action === "Escape") assert.equal(dialog.emit("cancel").defaultPrevented, true);
        if (action === "fechamento externo") dialog.close("true");
        assert.equal(await pending, false);
        assert.equal(h.dialogs().length, 0);
        assert.equal(h.document.activeElement, h.trigger);
        assert.deepEqual(h.externalAccess, []);
    });
}

test("cliques concorrentes compartilham um diálogo e a mesma Promise", async () => {
    const h = page();
    const other = h.secondTrigger();
    const first = h.confirm(h.trigger);
    const second = h.confirm(other);
    assert.equal(first, second);
    assert.equal(h.dialogs().length, 1);
    h.button("Sim, sair").emit("click");
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(h.document.activeElement, h.trigger);
    assert.equal(other.focusCount, 0);
});

test("uma nova tentativa após finalizar cria outra confirmação independente", async () => {
    const h = page();
    const first = h.confirm(h.trigger);
    const [firstDialog] = h.dialogs();
    h.button("Sim, sair").emit("click");
    assert.equal(await first, true);
    const second = h.confirm(h.trigger);
    const [secondDialog] = h.dialogs();
    assert.notEqual(first, second);
    assert.notEqual(firstDialog, secondDialog);
    assert.equal(h.dialogs().length, 1);
    h.button("Continuar na conta").emit("click");
    assert.equal(await second, false);
    assert.equal(h.dialogs().length, 0);
});

test("não tenta devolver o foco a um acionador removido", async () => {
    const h = page();
    const pending = h.confirm(h.trigger);
    h.trigger.remove();
    h.button("Continuar na conta").emit("click");
    assert.equal(await pending, false);
    assert.equal(h.trigger.focusCount, 1);
});

test("sem acionador explícito devolve o foco ao elemento anteriormente ativo", async () => {
    const h = page();
    const pending = h.confirm();
    h.button("Continuar na conta").emit("click");
    assert.equal(await pending, false);
    assert.equal(h.document.activeElement, h.trigger);
});

for (const answer of [true, false]) {
    test(`sem showModal usa a confirmação nativa com resposta ${answer}`, async () => {
        const h = page({ native: false, confirmResult: answer });
        const pending = h.confirm(h.trigger);
        assert.equal(await pending, answer);
        assert.deepEqual(h.confirmations, [title + "\n\n" + description]);
        assert.equal(h.dialogs().length, 0);
        assert.equal(h.document.activeElement, h.trigger);
        assert.deepEqual(h.externalAccess, []);
    });
}

test("fallback também compartilha uma única confirmação em chamadas imediatas", async () => {
    const h = page({ native: false, confirmResult: true });
    const first = h.confirm(h.trigger);
    const second = h.confirm(h.trigger);
    assert.equal(first, second);
    assert.equal(await first, true);
    assert.equal(h.confirmations.length, 1);
    assert.equal(h.dialogs().length, 0);
});

test("showModal que falha não deixa modal preso e permite fallback", async () => {
    const h = page({ showThrows: true, confirmResult: true });
    assert.equal(await h.confirm(h.trigger), true);
    assert.equal(h.confirmations.length, 1);
    assert.equal(h.dialogs().length, 0);
});

for (const options of [
    { native: false, confirmAvailable: false },
    { native: false, confirmThrows: true },
    { native: false, confirmResult: "true" }
]) {
    test(`fallback sem confirmação booleana explícita falha fechado: ${JSON.stringify(options)}`, async () => {
        const h = page(options);
        assert.equal(await h.confirm(h.trigger), false);
        assert.equal(h.dialogs().length, 0);
        assert.deepEqual(h.externalAccess, []);
    });
}

test("documento indisponível usa fallback sem acessar storage nem rede", async () => {
    const h = page({ documentAvailable: false, confirmResult: true });
    assert.equal(await h.confirm(h.trigger), true);
    assert.equal(h.confirmations.length, 1);
    assert.deepEqual(h.externalAccess, []);
});
