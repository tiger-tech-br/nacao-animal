"use strict";
(() => {
    const id = new URLSearchParams(location.search).get("pedido");
    const admin = location.pathname === "/admin/acompanhar-entrega";
    const status = document.getElementById("trackingStatus"), login = document.getElementById("trackingLogin");
    const details = document.getElementById("trackingDetails"), headline = document.getElementById("trackingHeadline");
    const destination = document.getElementById("destinationAddress"), updated = document.getElementById("trackingUpdated");
    const retry = document.getElementById("refreshTracking");
    const endpoint = admin ? "/api/vendas" : "/api/public/pedidos";
    const states = {
        AGUARDANDO_PAGAMENTO: ["Aguardando pagamento", "Seu pedido aguarda a confirmação do pagamento."],
        PAGAMENTO_APROVADO: ["Pagamento aprovado", "O pagamento foi confirmado. Aguarde a preparação do pedido."],
        EM_SEPARACAO: ["Preparando pedido", "Seu pedido está sendo separado pela loja."],
        SAIU_PARA_ENTREGA: ["Saiu para entrega", "O pedido está a caminho do endereço de entrega."],
        ENTREGUE: ["Entregue", "Pedido entregue. Obrigado por comprar com a Nação Animal!"],
        FINALIZADA: ["Finalizado", "Este pedido foi finalizado pela loja."],
        CANCELADA: ["Cancelado", "Este pedido foi cancelado. Consulte os detalhes em Meus pedidos."]
    };
    const sessionToken = () => !admin && window.NacaoCustomerSession
        ? window.NacaoCustomerSession.getToken() : sessionStorage.getItem(admin ? "token" : "petflow_customer_token");
    const sameSession = token => !admin && window.NacaoCustomerSession?.isCurrent
        ? window.NacaoCustomerSession.isCurrent(token) : sessionToken() === token;
    let version = 0, controller, pendingToken, dataToken, ended = false;
    login.href = admin ? "/admin/index.html" : `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    if (admin) {
        document.title = "Nação Animal | Status da entrega";
        document.getElementById("trackingTitle").textContent = "Status da entrega";
        const back = document.getElementById("trackingBack");
        back.href = `/admin/pages/vendas/vendas.html${id ? `?pedido=${encodeURIComponent(id)}` : ""}`;
        back.textContent = "← Voltar ao pedido";
        document.getElementById("trackingDescription").textContent = "Consulte o status registrado pela loja. O entregador usa o Google Maps para navegar, sem compartilhar localização com esta tela.";
        login.textContent = "Entrar no painel administrativo";
    }
    function clear() {
        details.hidden = true;
        headline.textContent = destination.textContent = updated.textContent = "";
    }
    function cancel() {
        version++; controller?.abort(); controller = null; pendingToken = null;
        retry.disabled = false;
    }
    async function refresh() {
        if (document.hidden) return;
        const token = sessionToken();
        if (token !== dataToken) { ended = false; clear(); dataToken = token; }
        if (!token) {
            cancel(); clear(); login.hidden = false;
            status.textContent = admin ? "Entre no painel administrativo para acompanhar a entrega." : "Entre na conta usada na compra para acompanhar seu pedido.";
            return;
        }
        if (ended) return;
        if (controller) { if (sameSession(pendingToken)) return; cancel(); }
        if (!id) { clear(); status.textContent = "Pedido não informado."; return; }
        const current = ++version;
        controller = new AbortController(); pendingToken = token; retry.disabled = true;
        try {
            const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/rastreamento`, {
                headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
            });
            const payload = await response.json();
            if (current !== version || document.hidden) return;
            if (!sameSession(token)) {
                clear(); login.hidden = Boolean(sessionToken());
                status.textContent = "A sessão foi alterada. Entre na conta do pedido para acompanhar a entrega.";
                return;
            }
            login.hidden = true;
            if (!response.ok) {
                login.hidden = ![401, 403].includes(response.status);
                throw new Error(payload.message || "Não foi possível consultar o pedido.");
            }
            const data = payload.data;
            const state = data && Object.hasOwn(states, data.status) ? states[data.status] : null;
            if (!state) throw new Error("Não foi possível confirmar o status deste pedido.");
            headline.textContent = state[0];
            status.textContent = admin && data.status === "CANCELADA" ? "Este pedido foi cancelado. Consulte os detalhes no painel de pedidos." : state[1];
            const address = data.endereco_entrega || {};
            destination.textContent = ["endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep"]
                .map(key => typeof address[key] === "string" || typeof address[key] === "number" ? String(address[key]).trim() : "")
                .filter(Boolean).join(", ") || "Consulte o endereço nos detalhes do pedido.";
            updated.textContent = `Status consultado em ${new Date().toLocaleString("pt-BR")}.`;
            details.hidden = false;
            ended = ["ENTREGUE", "FINALIZADA", "CANCELADA"].includes(data.status);
        } catch (error) {
            if (current === version && !document.hidden) {
                clear(); status.textContent = `${error.message || "Falha na consulta."} O status atual não pôde ser confirmado.`;
            }
        } finally {
            if (current === version) { controller = null; pendingToken = null; retry.disabled = ended; }
        }
    }
    retry.addEventListener("click", refresh);
    if (!admin) document.addEventListener("petflow:customer-logout", () => {
        cancel(); clear(); ended = false; dataToken = null;
        login.hidden = false; status.textContent = "Entre na conta usada na compra para acompanhar seu pedido.";
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); else refresh(); });
    window.addEventListener("pagehide", cancel);
    window.addEventListener("pageshow", refresh);
    refresh(); setInterval(refresh, 15000);
})();
