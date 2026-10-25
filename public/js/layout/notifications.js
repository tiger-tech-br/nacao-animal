"use strict";
document.addEventListener("DOMContentLoaded", () => {
    if (window.PetFlowNotifications || (window.parent && window.parent !== window)) return;
    const admin = location.pathname.startsWith("/admin/");
    const tokenKey = admin ? "token" : "petflow_customer_token";
    const endpoint = admin ? "/api/dashboard/notificacoes" : "/api/public/clientes/notificacoes";
    const original = document.querySelector(admin ? "#notificationButton" : ".customer-notification-button");
    if (admin && !original) return;
    const host = admin ? original.closest(".notification-menu") : document.createElement("div");
    host.classList.add("pf-notifications");
    if (admin) host.querySelector("#notificationPanel")?.remove();
    else if (original) { original.before(host); host.appendChild(original); }
    else { host.classList.add("pf-notifications-floating"); document.body.appendChild(host); }
    const button = original || document.createElement("button");
    if (!host.contains(button)) host.appendChild(button);
    button.type = "button";
    if (!admin) button.classList.add("pf-notifications-button");
    if (!original) button.textContent = "Notificações";
    button.setAttribute("aria-label", "Abrir notificações");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "pfNotificationsPanel");
    const badge = (admin && button.querySelector("#notificationCount")) || document.createElement("span");
    badge.classList.add("pf-notifications-badge");
    badge.setAttribute("aria-hidden", "true");
    badge.hidden = true;
    if (!button.contains(badge)) button.appendChild(badge);
    const panel = document.createElement("section");
    panel.id = "pfNotificationsPanel";
    panel.className = "pf-notifications-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Notificações");
    panel.innerHTML = '<header><strong>Notificações</strong><button type="button" data-close aria-label="Fechar notificações">×</button></header><p role="status" aria-live="polite" aria-atomic="true"></p><div class="pf-notifications-actions"><button type="button" data-refresh>Atualizar</button><button type="button" data-read>Marcar exibidas como lidas</button></div><div class="pf-notifications-list"></div>';
    host.appendChild(panel);
    const list = panel.querySelector(".pf-notifications-list");
    const status = panel.querySelector('[role="status"]');
    const readButton = panel.querySelector("[data-read]");
    const closeButton = panel.querySelector("[data-close]");
    const labels = {
        AGUARDANDO_PAGAMENTO: "Aguardando pagamento", PAGAMENTO_APROVADO: "Pagamento aprovado",
        EM_SEPARACAO: "Preparando pedido", SAIU_PARA_ENTREGA: "Saiu para entrega",
        ENTREGUE: "Entregue", FINALIZADA: "Finalizado", CANCELADA: "Cancelado"
    };
    const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    let items = [], pending = false, readPending = false, session = "", sessionVersion = 0;
    let locallyRead = new Set(), displayedIds = new Set(), pendingRender = false;
    const token = () => (!admin && window.NacaoCustomerSession
        ? window.NacaoCustomerSession.getToken() : sessionStorage.getItem(tokenKey)) || "";
    const currentSession = (value, version) => (!admin && window.NacaoCustomerSession?.isCurrent
        ? window.NacaoCustomerSession.isCurrent(value) : value === token()) && version === sessionVersion;

    function setStatus(message) { if (status.textContent !== message) status.textContent = message; }
    function close(returnFocus = false) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        if (returnFocus && !button.hidden) button.focus();
    }
    function syncSession() {
        const value = token();
        const key = !admin && window.NacaoCustomerSession?.getSessionKey ? window.NacaoCustomerSession.getSessionKey() : value;
        if (key !== session) {
            session = key;
            sessionVersion++;
            items = [];
            locallyRead = new Set();
            displayedIds = new Set();
            list.replaceChildren();
            pendingRender = false;
            pending = readPending = false;
            close();
            render(false);
        }
        host.hidden = button.hidden = !value;
        return value;
    }
    function render(markVisible = true) {
        const unread = items.filter(item => !item.lida).length;
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.hidden = !unread;
        button.setAttribute("aria-label", "Notificações: " + unread + " não lidas");
        readButton.disabled = !unread || readPending;
        setStatus(items.length ? unread + " não lida(s) · " + items.length + " mais recentes" : "Nenhuma notificação por enquanto.");
        if (list.contains(document.activeElement)) { pendingRender = true; return; }
        pendingRender = false;
        list.replaceChildren();
        displayedIds = new Set(items.map(item => item.id));
        items.forEach(item => {
            const card = document.createElement("article");
            card.className = item.lida ? "" : "is-unread";
            const title = document.createElement("strong"), message = document.createElement("p"), date = document.createElement("small");
            title.textContent = item.titulo || "Atualização da Nação Animal";
            message.textContent = !admin && item.status_pedido === "SAIU_PARA_ENTREGA"
                ? (item.mensagem || "").replace(" Acompanhe o entregador e prepare-se para receber a entrega.", " Acompanhe o status do pedido e prepare-se para receber a entrega.")
                : item.mensagem || "";
            const timestamp = new Date(item.enviada_em);
            date.textContent = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString("pt-BR") : "Data não informada";
            card.append(title, message);
            if (labels[item.status_pedido]) {
                const label = document.createElement("span");
                label.className = "pf-notification-order-status";
                label.textContent = labels[item.status_pedido];
                card.appendChild(label);
            }
            card.appendChild(date);
            const order = uuid.test(item.venda_id || ""), client = uuid.test(item.cliente_id || "");
            if (order || (admin && client)) {
                const link = document.createElement("a");
                if (admin) {
                    link.href = order ? "/admin/pages/vendas/vendas.html?pedido=" + encodeURIComponent(item.venda_id) : "/admin/pages/clientes/clientes.html";
                    link.textContent = order ? "Abrir pedido" : "Ver clientes";
                } else {
                    const tracking = item.status_pedido === "SAIU_PARA_ENTREGA";
                    link.href = tracking ? "/acompanhar-entrega?pedido=" + encodeURIComponent(item.venda_id) : "/meus-pedidos";
                    link.textContent = tracking ? "Acompanhar pedido" : "Ver meus pedidos";
                }
                card.appendChild(link);
            }
            list.appendChild(card);
        });
        if (markVisible && !admin) void markDisplayedRead();
    }
    async function refresh() {
        const value = syncSession();
        if (!value || pending || document.hidden) return;
        const version = sessionVersion;
        pending = true;
        try {
            const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + value }, cache: "no-store", signal: AbortSignal.timeout(10000) });
            const payload = await response.json();
            if (!response.ok || payload.success === false) throw new Error();
            if (!currentSession(value, version)) return;
            items = (Array.isArray(payload.data) ? payload.data : []).map(item => locallyRead.has(item.id) ? { ...item, lida: true } : item);
            render();
        } catch {
            if (currentSession(value, version)) setStatus("Não foi possível atualizar os avisos. Use Atualizar para tentar novamente.");
        } finally { if (currentSession(value, version)) pending = false; }
    }
    async function markDisplayedRead() {
        const value = token(), version = sessionVersion;
        if (!value || value !== session || panel.hidden || document.hidden || readPending) return;
        const ids = items.filter(item => !item.lida && displayedIds.has(item.id) && uuid.test(item.id || "")).map(item => item.id);
        if (!ids.length) return;
        readPending = true;
        readButton.disabled = true;
        let saved = false;
        try {
            const response = await fetch(endpoint + "/lidas", {
                method: "PATCH", headers: { Authorization: "Bearer " + value, "Content-Type": "application/json" },
                body: JSON.stringify({ ids }), signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) throw new Error();
            if (!currentSession(value, version)) return;
            ids.forEach(id => locallyRead.add(id));
            items = items.map(item => locallyRead.has(item.id) ? { ...item, lida: true } : item);
            saved = true;
            render(false);
        } catch {
            if (currentSession(value, version)) setStatus("Não foi possível salvar a leitura. Tente novamente.");
        } finally {
            if (currentSession(value, version)) {
                readPending = false;
                readButton.disabled = !items.some(item => !item.lida);
                if (saved && !admin) void markDisplayedRead();
            }
        }
    }
    button.addEventListener("click", () => {
        const value = syncSession();
        if (!value) return;
        const open = panel.hidden;
        panel.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
        if (open) { closeButton.focus(); render(); void refresh(); }
    });
    closeButton.addEventListener("click", () => close(true));
    panel.querySelector("[data-refresh]").addEventListener("click", refresh);
    readButton.addEventListener("click", markDisplayedRead);
    list.addEventListener("focusout", event => { if (pendingRender && !list.contains(event.relatedTarget)) render(); });
    document.addEventListener("click", event => { if (!host.contains(event.target)) close(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) { event.preventDefault(); close(true); } });
    window.PetFlowNotifications = { refresh, close };
    document.addEventListener("petflow:customer-logout", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    setInterval(refresh, 15000);
});
