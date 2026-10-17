"use strict";
(() => {
    const id = new URLSearchParams(location.search).get("pedido"), map = window.PetFlowDeliveryMap({ mode: "tracking" });
    const status = document.getElementById("trackingStatus"), updated = document.getElementById("trackingUpdated"), login = document.getElementById("trackingLogin");
    const admin = location.pathname === "/admin/acompanhar-entrega";
    const stage = document.getElementById("trackingStage"), live = document.getElementById("trackingLive"), headline = document.getElementById("trackingHeadline");
    const distance = document.getElementById("trackingDistance"), duration = document.getElementById("trackingDuration"), arrival = document.getElementById("trackingArrival");
    const expand = document.getElementById("expandTrackingMap"), expandLabel = document.getElementById("expandTrackingLabel");
    const endpoint = admin ? "/api/vendas" : "/api/public/pedidos";
    if (admin) document.body?.classList.add("tracking-admin");
    login.href = admin ? "/admin/index.html" : `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    if (admin) {
        document.title = "PetFlow | Acompanhar entrega";
        document.getElementById("trackingTitle").textContent = "Acompanhar entrega";
        const back = document.getElementById("trackingBack");
        back.href = `/admin/pages/vendas/vendas.html${id ? `?pedido=${encodeURIComponent(id)}` : ""}`;
        back.textContent = "← Voltar ao pedido";
        document.getElementById("trackingDescription").textContent = "Veja a van na posição do entregador, a linha azul da rota e o destino da entrega. Atualizamos a posição a cada 5 segundos enquanto esta página estiver visível. Esta tela apenas acompanha a entrega.";
        login.textContent = "Entrar no painel administrativo";
    }
    function hideMap() { stage.hidden = true; live.hidden = true; map.hide(); updated.textContent = ""; }
    function seconds(value) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        const match = typeof value === "string" && value.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
        return match ? Number(match[1]) : null;
    }
    function formatDistance(value) {
        if (!Number.isFinite(value)) return "—";
        return value < 1000 ? `${Math.max(1, Math.round(value))} m` : `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
    }
    function updateSummary(data, stale) {
        const remainingSeconds = seconds(data.rota?.duracao);
        const calculatedAt = new Date(data.rota?.calculadaEm).getTime();
        headline.textContent = stale ? "Última posição conhecida" : "Entregador a caminho";
        distance.textContent = formatDistance(data.rota?.distanciaMetros);
        duration.textContent = remainingSeconds === null ? "Calculando" : `${Math.max(1, Math.ceil(remainingSeconds / 60))} min`;
        arrival.textContent = remainingSeconds === null ? "—" : new Date((Number.isFinite(calculatedAt) ? calculatedAt : Date.now()) + remainingSeconds * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    function setExpanded(expanded) {
        stage.classList.toggle("is-expanded", expanded); document.body?.classList.toggle("tracking-map-open", expanded);
        expand.setAttribute("aria-pressed", String(expanded)); expand.title = expanded ? "Fechar mapa ampliado" : "Expandir mapa";
        expandLabel.textContent = expanded ? "Fechar" : "Expandir";
        setTimeout(() => map.resize(), 0);
    }
    expand.addEventListener("click", () => setExpanded(!stage.classList.contains("is-expanded")));
    document.addEventListener("keydown", event => { if (event.key === "Escape" && stage.classList.contains("is-expanded")) setExpanded(false); });
    let pending = false, ended = false;
    async function refresh() {
        if (pending || ended || document.hidden) return;
        const token = sessionStorage.getItem(admin ? "token" : "petflow_customer_token");
        if (!token) { status.textContent = admin ? "Entre no painel administrativo para acompanhar a entrega." : "Entre na conta usada na compra para rastrear seu pedido."; login.hidden = false; hideMap(); return; }
        if (!id) { status.textContent = "Pedido não informado."; return; }
        pending = true;
        try {
            const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/rastreamento`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
            const payload = await response.json();
            if (!response.ok) { login.hidden = response.status !== 401; throw new Error(payload.message || "Não foi possível consultar a entrega."); }
            login.hidden = true;
            const data = payload.data;
            if (data.status !== "SAIU_PARA_ENTREGA") {
                status.textContent = ["ENTREGUE","FINALIZADA"].includes(data.status) ? (admin ? "Pedido entregue. Rastreamento encerrado." : "Pedido entregue. Obrigado por comprar com a PetFlow!") : `Este pedido não está em rota de entrega. Consulte o status ${admin ? "no painel de pedidos" : "em Meus pedidos"}.`;
                hideMap(); ended = ["ENTREGUE","FINALIZADA","CANCELADA"].includes(data.status); return;
            }
            if (data.latitude === null || data.longitude === null || !data.atualizado_em) {
                hideMap(); status.textContent = "Pedido saiu para entrega. Aguardando o entregador compartilhar o GPS."; return;
            }
            const stale = Date.now() - new Date(data.atualizado_em).getTime() > 120000;
            status.textContent = stale ? "Sem atualização recente. O mapa mostra a última posição conhecida, não a posição atual." : (admin ? "Entregador a caminho. Acompanhe a posição e a rota da entrega no mapa." : "Entregador a caminho! Acompanhe a rota no mapa e prepare-se para receber seu pedido.");
            updated.textContent = `${new Date(data.atualizado_em).toLocaleString("pt-BR")} · Precisão aproximada: ${Math.round(data.precisao_m)} m`;
            stage.hidden = false; live.hidden = false; updateSummary(data, stale);
            map.update(data);
        } catch (error) { status.textContent = `${error.message} A posição atual não pôde ser confirmada.`; hideMap(); }
        finally { pending = false; }
    }
    refresh(); setInterval(refresh,5000); document.addEventListener("visibilitychange",refresh);
})();
