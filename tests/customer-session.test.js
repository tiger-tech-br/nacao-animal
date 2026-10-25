"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), jwt = require("jsonwebtoken");
const source = fs.readFileSync("public/js/customer-session.js", "utf8");
const KEY = "nacao_customer_session", TOKEN = "petflow_customer_token";
const start = Date.UTC(2026, 9, 25, 12), minute = 60000;
function token(at = start, extras = {}) {
    return jwt.sign({ type: "customer", id: "customer-a", empresaId: "store", sv: 1,
        nome: "José Teste", iat: at / 1000, ...extras }, "fixture-session-secret", { expiresIn: "30m" });
}
function browser({ local = new Map(), session = new Map(), now = start, request } = {}) {
    const listeners = {}, timers = new Map(), emitted = [], calls = [];
    let clock = now, sequence = 0, reloads = 0;
    const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
    class Clock extends Date { static now() { return clock; } }
    const context = { Date: Clock, atob, TextDecoder, Uint8Array, AbortSignal,
        localStorage: storage(local), sessionStorage: storage(session),
        setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: clock + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        CustomEvent: class { constructor(type) { this.type = type; } },
        document: { hidden: false, querySelector: () => null, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
            dispatchEvent(event) { emitted.push(event.type); for (const fn of listeners[event.type] || []) fn(event); } },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        location: { reload() { reloads++; } },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return request ? request(url, options) : { ok: true, status: 200, json: async () => ({ data: { token: token(clock) } }) };
        }
    };
    context.window = context;
    vm.createContext(context); vm.runInContext(source, context);
    return { context, local, session, calls, emitted, api: context.NacaoCustomerSession, reloads: () => reloads,
        setTime(value) { clock = value; },
        fire(type, event = {}) { for (const fn of listeners[type] || []) fn({ isTrusted: true, ...event }); },
        async tick() { for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); await timer.fn(); } },
        run(code) { return vm.runInContext(code, context); }
    };
}

test("login público persiste e reabrir o navegador antes do prazo restaura somente o nome", () => {
    const first = browser();
    vm.runInContext(fs.readFileSync("public/js/pages/auth/public-auth.js", "utf8"), first.context);
    first.context.saveCustomer({ token: token(), user: { nome: "José Teste", cpf: "fixture-private" } });
    assert.ok(first.local.has(KEY));
    assert.ok(!first.local.get(KEY).includes("fixture-private"));
    const reopened = browser({ local: first.local, now: start + 29 * minute });
    assert.equal(reopened.api.getToken(), token());
    assert.deepEqual(JSON.parse(reopened.session.get("petflow_customer_user")), { nome: "José Teste" });
    assert.equal(reopened.calls.length, 0, "Reabrir não renova sozinho");
});

test("com todas as abas fechadas, a sessão expira em 30 minutos e não é recuperada ao reabrir", () => {
    const closed = browser(); closed.api.save({ token: token() });
    // Fechar o navegador interrompe os timers da página anterior.
    const reopened = browser({ local: closed.local, now: start + 30 * minute });
    assert.equal(reopened.api.getToken(), null);
    assert.equal(reopened.local.has(KEY), false);
    assert.equal(reopened.calls.length, 0);
    assert.ok(reopened.emitted.includes("petflow:customer-logout"));
});

test("aba aberta mantém o login por horas sem cliques, com renovação automática no servidor", async () => {
    const page = browser(); page.api.save({ token: token() });
    for (let n = 1; n <= 120; n++) { page.setTime(start + n * minute); await page.tick(); assert.ok(page.api.getToken()); }
    assert.equal(page.calls.length, 120);
    assert.equal(page.calls[0].url, "/api/public/clientes/sessao/renovar");
    assert.equal(page.calls[0].options.headers.Authorization, `Bearer ${token()}`);
    assert.equal(page.api.isCurrent(token()), true, "Renovar o JWT não é trocar de conta");
    const returnEarly = browser({ local: new Map(page.local), now: start + 149 * minute });
    assert.ok(returnEarly.api.getToken());
    const returnLate = browser({ local: new Map(page.local), now: start + 150 * minute });
    assert.equal(returnLate.api.getToken(), null);
});

test("aba aberta em segundo plano também renova; não é necessário interagir", async () => {
    const page = browser(); page.api.save({ token: token() });
    page.context.document.hidden = true;
    for (let n = 1; n <= 45; n++) { page.setTime(start + n * minute); await page.tick(); }
    assert.ok(page.api.getToken());
    assert.equal(page.calls.length, 45);
    assert.equal(JSON.parse(page.local.get(KEY)).lastActivity, undefined);
});

test("sair limpa dados do cliente em ambas as memórias e preserva administrador", () => {
    const page = browser(); page.api.save({ token: token() });
    page.session.set("token", "staff"); page.local.set("token", "staff-other");
    page.session.set("petflow_delivery_address", "private");
    page.api.clear();
    const reopened = browser({ local: page.local });
    assert.equal(reopened.api.getToken(), null); assert.equal(page.session.has(TOKEN), false);
    assert.equal(page.session.has("petflow_delivery_address"), false);
    assert.equal(page.session.get("token"), "staff"); assert.equal(page.local.get("token"), "staff-other");
});

test("saída em outra aba limpa o cache e renovação da mesma conta não recarrega a página", async () => {
    const first = browser(); first.api.save({ token: token() });
    const second = browser({ local: first.local });
    first.setTime(start + 2 * minute); first.fire("pointerdown"); await first.tick();
    second.setTime(start + 2 * minute); second.fire("storage", { key: KEY });
    assert.equal(second.reloads(), 0); assert.equal(second.api.getToken(), first.api.getToken());
    first.api.clear(); second.fire("storage", { key: KEY });
    assert.equal(second.reloads(), 1); assert.equal(second.api.getToken(), null);
    assert.equal(second.session.has(TOKEN), false);
});

test("resposta de renovação após Sair não recria a sessão", async () => {
    let finish;
    const page = browser({ request: () => new Promise(resolve => { finish = resolve; }) });
    page.api.save({ token: token() }); page.setTime(start + 2 * minute); page.fire("input");
    const pending = page.tick(); page.api.clear();
    finish({ ok: true, status: 200, json: async () => ({ data: { token: token(start + 2 * minute) } }) });
    await pending; assert.equal(page.api.getToken(), null); assert.equal(page.local.has(KEY), false);
});

test("falha temporária não encerra a sessão; autenticação rejeitada encerra", async () => {
    for (const status of [503, 401, 403]) {
        const page = browser({ request: async () => ({ ok: false, status }) });
        page.api.save({ token: token() }); page.setTime(start + 2 * minute); page.fire("wheel"); await page.tick();
        assert.equal(Boolean(page.api.getToken()), status === 503);
    }
});

test("falha de rede não estende credenciais vencidas nem autentica outra conta", async () => {
    const unavailable = browser({ request: async () => { throw new Error("offline"); } });
    unavailable.api.save({ token: token() });
    for (let n = 1; n <= 30; n++) { unavailable.setTime(start + n * minute); await unavailable.tick(); }
    assert.equal(unavailable.api.getToken(), null);
    const other = browser({ request: async () => ({ ok: true, status: 200,
        json: async () => ({ data: { token: token(start + 2 * minute, { id: "customer-b" }) } }) }) });
    other.api.save({ token: token() }); other.setTime(start + 2 * minute); await other.tick();
    assert.equal(other.api.getToken(), token());
});

test("renovação entre abas preserva os dados desta conta; mudança de conta descarta o cache anterior", async () => {
    const first = browser(); first.api.save({ token: token() });
    const second = browser({ local: first.local });
    second.session.set("petflow_public_cart", "cart-a");
    second.session.set("petflow_customer_user", JSON.stringify({ nome: "José", endereco: "fixture-private" }));
    first.setTime(start + minute); await first.tick();
    second.setTime(start + minute); second.fire("storage", { key: KEY });
    assert.equal(second.session.get("petflow_public_cart"), "cart-a");
    assert.match(second.session.get("petflow_customer_user"), /fixture-private/);
    first.api.save({ token: token(start + minute, { id: "customer-b", nome: "Maria" }) });
    second.fire("storage", { key: KEY });
    assert.equal(second.reloads(), 1);
    assert.equal(second.session.has("petflow_public_cart"), false);
    assert.deepEqual(JSON.parse(second.session.get("petflow_customer_user")), { nome: "Maria" });
});

test("Sair confirmado após renovar usa a credencial atual e encerra o acesso", async () => {
    const page = browser(); page.api.save({ token: token() });
    vm.runInContext(fs.readFileSync("public/js/pages/auth/public-auth.js", "utf8"), page.context);
    let answer;
    page.context.NacaoAnimalLogoutDialog = { confirm: () => new Promise(resolve => { answer = resolve; }) };
    const pending = page.context.handlePublicLogout({ preventDefault() {}, currentTarget: {} });
    page.setTime(start + minute); await page.tick();
    const latest = page.api.getToken();
    assert.notEqual(latest, token());
    answer(true); await pending;
    const logout = page.calls.find(call => call.url.endsWith("/clientes/logout"));
    assert.equal(logout.options.headers.Authorization, `Bearer ${latest}`);
    assert.equal(page.api.getToken(), null);
});

test("todas as páginas públicas com login carregam o módulo antes dos consumidores", () => {
    for (const file of fs.readdirSync("views", { recursive: true }).filter(file => file.endsWith(".html"))) {
        const html = fs.readFileSync(`views/${file}`, "utf8");
        const consumer = html.search(/\/js\/(?:layout\/public-header|pages\/home\/catalog)\.js/);
        if (consumer < 0) continue;
        const index = html.indexOf('/js/customer-session.js?v=20261025-1');
        assert.ok(index >= 0 && index < consumer, file);
    }
});
