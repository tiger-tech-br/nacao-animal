"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const admin = location.pathname.startsWith("/admin/"), tokenKey = admin ? "token" : "petflow_customer_token";
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
    button.setAttribute("aria-label", "Abrir notificações"); button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "pfNotificationsPanel");
    const badge = admin ? button.querySelector("#notificationCount") : document.createElement("span");
    badge.classList.add("pf-notifications-badge"); badge.hidden = true;
    if (!button.contains(badge)) button.appendChild(badge);
    const panel = document.createElement("section"); panel.id = "pfNotificationsPanel"; panel.className = "pf-notifications-panel"; panel.hidden = true; panel.setAttribute("aria-label", "Notificações");
    panel.innerHTML = '<header><strong>Notificações</strong><button type="button" data-close aria-label="Fechar notificações">×</button></header><p role="status"></p><button type="button" data-read>Marcar exibidas como lidas</button><div class="pf-notifications-list"></div>';
    host.appendChild(panel);
    const list = panel.querySelector(".pf-notifications-list"), status = panel.querySelector('[role="status"]'), readButton = panel.querySelector("[data-read]");
    let items = [], pending = false, session = "";
    function close() { panel.hidden = true; button.setAttribute("aria-expanded", "false"); }
    function render() {
        const unread = items.filter(item => !item.lida).length;
        badge.textContent = String(unread); badge.hidden = !unread;
        button.setAttribute("aria-label", `Notificações: ${unread} não lidas`);
        readButton.disabled = !unread;
        status.textContent = items.length ? `${unread} não lida(s) · ${items.length} mais recentes` : "Nenhuma notificação por enquanto.";
        list.replaceChildren();
        items.forEach(item => {
            const card = document.createElement("article"); card.className = item.lida ? "" : "is-unread";
            const title = document.createElement("strong"), message = document.createElement("p"), date = document.createElement("small");
            title.textContent = item.titulo; message.textContent = item.mensagem; date.textContent = new Date(item.enviada_em).toLocaleString("pt-BR");
            card.append(title,message,date);
            const order = /^[0-9a-f-]{36}$/i.test(item.venda_id || ""), client = /^[0-9a-f-]{36}$/i.test(item.cliente_id || "");
            if (order || (admin && client)) {
                const link = document.createElement("a");
                if (admin) { link.href = order ? `/admin/pages/vendas/vendas.html?pedido=${encodeURIComponent(item.venda_id)}` : "/admin/pages/clientes/clientes.html"; link.textContent = order ? "Abrir pedido" : "Ver clientes"; }
                else { const tracking = item.status_pedido === "SAIU_PARA_ENTREGA"; link.href = tracking ? `/acompanhar-entrega?pedido=${encodeURIComponent(item.venda_id)}` : "/meus-pedidos"; link.textContent = tracking ? "Rastrear pedido" : "Ver meus pedidos"; }
                card.appendChild(link);
            }
            list.appendChild(card);
        });
    }
    async function refresh() {
        const token = sessionStorage.getItem(tokenKey);
        host.hidden = !token;
        if (token !== session) { session = token; items = []; close(); render(); }
        if (!token || pending || document.hidden) return;
        pending = true;
        try {
            const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.message || "Não foi possível consultar as notificações.");
            if (token !== sessionStorage.getItem(tokenKey)) return;
            items = Array.isArray(payload.data) ? payload.data : []; render();
        } catch { status.textContent = "Não foi possível atualizar os avisos. Tentaremos novamente em alguns segundos."; }
        finally { pending = false; }
    }
    button.addEventListener("click", () => { const open = panel.hidden; panel.hidden = !open; button.setAttribute("aria-expanded", String(open)); if (open) refresh(); });
    panel.querySelector("[data-close]").addEventListener("click", () => { close(); button.focus(); });
    document.addEventListener("click", event => { if (!host.contains(event.target)) close(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) { close(); button.focus(); } });
    readButton.addEventListener("click", async () => {
        const ids = items.filter(item => !item.lida).map(item => item.id); readButton.disabled = true;
        try {
            const response = await fetch(`${endpoint}/lidas`, { method: "PATCH", headers: { Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids }), signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error();
            items = items.map(item => ids.includes(item.id) ? { ...item, lida: true } : item); render();
        } catch { status.textContent = "Não foi possível salvar a leitura. Tente novamente."; readButton.disabled = false; }
    });
    window.PetFlowNotifications = { refresh, close };
    document.addEventListener("petflow:customer-logout", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh(); setInterval(refresh,15000);
});
