"use strict";

// A validade vem do JWT emitido pelo servidor; ler o payload aqui só controla a UI.
// A assinatura e a revogação continuam sendo verificadas em cada API protegida.
(() => {
    const KEY = "nacao_customer_session";
    const TOKEN = "petflow_customer_token";
    const USER = "petflow_customer_user";
    const CUSTOMER_KEYS = [TOKEN, USER, "petflow_public_cart", "petflow_public_favorites",
        "petflow_delivery_address", "petflow_cart_coupon"];
    const MAX_AGE_SECONDS = 30 * 60;
    const RENEWAL_INTERVAL = 60 * 1000;
    let activeToken = null, timer = null, renewalTimer = null, renewing = false;

    function read(storage, key) {
        try { return window[storage].getItem(key); } catch { return null; }
    }
    function write(storage, key, value) {
        try { window[storage].setItem(key, value); return true; } catch { return false; }
    }
    function remove(storage, key) {
        try { window[storage].removeItem(key); } catch { /* Armazenamento bloqueado. */ }
    }
    function claims(token, allowExpired = false) {
        try {
            const parts = token.split(".");
            if (parts.length !== 3) return null;
            const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), char => char.charCodeAt(0));
            const data = JSON.parse(new TextDecoder().decode(bytes));
            if (data.type !== "customer" || !Number.isFinite(data.exp) || !Number.isFinite(data.iat)) return null;
            const expiresAt = Math.min(data.exp, data.iat + MAX_AGE_SECONDS) * 1000;
            return allowExpired || expiresAt > Date.now() ? { ...data, expiresAt } : null;
        } catch { return null; }
    }
    function clear() {
        clearTimeout(timer);
        clearTimeout(renewalTimer);
        timer = renewalTimer = null;
        activeToken = null;
        remove("localStorage", KEY);
        remove("sessionStorage", KEY);
        for (const key of CUSTOMER_KEYS) {
            remove("sessionStorage", key);
            remove("localStorage", key);
        }
    }
    function notifyLogout() {
        window.PetFlowPublicHeader?.update();
        document.dispatchEvent(new CustomEvent("petflow:customer-logout"));
    }
    function stored() {
        const value = read("localStorage", KEY) || read("sessionStorage", KEY);
        if (!value) return null;
        try {
            const session = JSON.parse(value);
            return typeof session === "string" ? { token: session } : session;
        }
        // Compatibilidade com a primeira versão, que guardava só o JWT.
        catch { return value.split(".").length === 3 ? { token: value } : null; }
    }
    function persist(session) {
        const value = JSON.stringify(session);
        if (write("localStorage", KEY, value)) remove("sessionStorage", KEY);
        else { remove("localStorage", KEY); write("sessionStorage", KEY, value); }
    }
    function identity(token) {
        const data = token && claims(token, true);
        return data ? JSON.stringify([data.id, data.empresaId, data.sv]) : null;
    }
    function getToken() {
        const session = stored(), token = session?.token;
        const data = token && claims(token);
        const deadline = data?.expiresAt || 0;
        if (!data || deadline <= Date.now()) {
            if (read("localStorage", KEY) || read("sessionStorage", KEY) || activeToken) { clear(); notifyLogout(); }
            return null;
        }
        if (activeToken !== token) {
            const sameCustomer = identity(activeToken) === identity(token);
            activeToken = token;
            write("sessionStorage", TOKEN, token);
            // Só o nome é restaurado; CPF, endereço e contato vêm novamente da API.
            if (!sameCustomer) write("sessionStorage", USER, JSON.stringify({ nome: data.nome || "Cliente" }));
        }
        clearTimeout(timer);
        timer = setTimeout(getToken, Math.min(deadline - Date.now(), 2147483647));
        scheduleRenewal();
        return token;
    }
    function isCurrent(token) {
        const current = getToken();
        return Boolean(current && token && identity(current) === identity(token));
    }
    function save(data) {
        if (!claims(data?.token)) throw new Error("A sessão recebida é inválida. Entre novamente.");
        const previous = stored()?.token;
        if (previous && identity(previous) !== identity(data.token)) {
            for (const key of CUSTOMER_KEYS) { remove("sessionStorage", key); remove("localStorage", key); }
        }
        // Em modo restrito, mantém ao menos a sessão desta aba.
        persist({ token: data.token });
        getToken();
        if (data.user) write("sessionStorage", USER, JSON.stringify(data.user));
    }
    async function renew() {
        if (renewing) return;
        renewalTimer = null;
        renewing = true;
        try {
            const token = getToken();
            if (!token) return;
            const response = await fetch("/api/public/clientes/sessao/renovar", {
                method: "POST", headers: { Authorization: `Bearer ${token}` },
                cache: "no-store", signal: AbortSignal.timeout(10000)
            });
            if (getToken() !== token) return;
            if ([401, 403].includes(response.status)) { clear(); notifyLogout(); return; }
            if (!response.ok) return;
            const payload = await response.json();
            if (getToken() !== token || !claims(payload.data?.token) || identity(payload.data.token) !== identity(token)) return;
            persist({ token: payload.data.token });
            getToken();
        } catch { /* Falha temporária não encerra nem prolonga o acesso. */ }
        finally { renewing = false; getToken(); }
    }
    function scheduleRenewal() {
        if (renewing || renewalTimer !== null || !activeToken) return;
        const data = claims(activeToken);
        if (!data) return;
        // A aba aberta mantém a sessão, mesmo sem interação ou em segundo plano.
        // Sem abas abertas, não há renovação: o servidor encerra o JWT em 30 minutos.
        const delay = Math.max(1000, Math.min(RENEWAL_INTERVAL, data.expiresAt - Date.now() - 10000));
        renewalTimer = setTimeout(renew, delay);
    }
    window.NacaoCustomerSession = { getToken, save, clear, isCurrent, getSessionKey: () => identity(getToken()) };

    // Migra somente a sessão da aba já aberta, sem prolongar a validade original.
    const legacy = read("sessionStorage", TOKEN);
    if (!read("localStorage", KEY) && !read("sessionStorage", KEY) && legacy) {
        if (claims(legacy)) save({ token: legacy });
        else clear();
    }
    getToken();
    window.addEventListener("storage", event => {
        if (event.key !== KEY && event.key !== null) return;
        // Outra aba saiu ou mudou de conta: descarta os dados da conta anterior.
        const next = stored()?.token;
        if (next && identity(next) === identity(activeToken)) { getToken(); return; }
        activeToken = null;
        clearTimeout(timer); clearTimeout(renewalTimer);
        timer = renewalTimer = null;
        remove("sessionStorage", KEY);
        for (const key of CUSTOMER_KEYS) remove("sessionStorage", key);
        getToken();
        window.location.reload();
    });
    window.addEventListener("pageshow", getToken);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) getToken(); });
})();
