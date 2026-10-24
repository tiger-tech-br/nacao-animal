"use strict";
(() => {
    const id = new URLSearchParams(location.search).get("pedido"), map = window.PetFlowDeliveryMap({ mode: "tracking" });
    const status = document.getElementById("trackingStatus"), updated = document.getElementById("trackingUpdated"), login = document.getElementById("trackingLogin");
    const admin = location.pathname === "/admin/acompanhar-entrega";
    const stage = document.getElementById("trackingStage"), live = document.getElementById("trackingLive"), headline = document.getElementById("trackingHeadline");
    const distance = document.getElementById("trackingDistance"), duration = document.getElementById("trackingDuration"), arrival = document.getElementById("trackingArrival");
    const expand = document.getElementById("expandTrackingMap"), expandLabel = document.getElementById("expandTrackingLabel");
    const endpoint = admin ? "/api/vendas" : "/api/public/pedidos";
    document.body?.classList.add(admin ? "tracking-admin" : "tracking-storefront");
    login.href = admin ? "/admin/index.html" : `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    if (admin) {
        document.title = "Nação Animal | Acompanhar entrega";
        document.getElementById("trackingTitle").textContent = "Acompanhar entrega";
        const back = document.getElementById("trackingBack");
        back.href = `/admin/pages/vendas/vendas.html${id ? `?pedido=${encodeURIComponent(id)}` : ""}`;
        back.textContent = "← Voltar ao pedido";
        document.getElementById("trackingDescription").textContent = "Veja a van na posição do entregador, a linha azul da rota e o destino da entrega. Atualizamos a posição a cada 2 segundos enquanto esta página estiver visível. Esta tela apenas acompanha a entrega.";
        login.textContent = "Entrar no painel administrativo";
    }
    function hideMap() {
        stage.hidden = true; live.hidden = true; map.hide(); updated.textContent = "";
        if (stage.classList.contains("is-expanded")) setExpanded(false);
    }
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
        const arrivalAt = calculatedAt + remainingSeconds * 1000;
        arrival.textContent = stale || remainingSeconds === null || !Number.isFinite(calculatedAt) || arrivalAt < Date.now() ? "—" : new Date(arrivalAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    function setExpanded(expanded) {
        stage.classList.toggle("is-expanded", expanded); document.body?.classList.toggle("tracking-map-open", expanded);
        expand.setAttribute("aria-pressed", String(expanded)); expand.title = expanded ? "Fechar mapa ampliado" : "Expandir mapa";
        expandLabel.textContent = expanded ? "Fechar" : "Expandir";
        if (!stage.hidden) setTimeout(() => map.resize(), 0);
    }
    expand.addEventListener("click", () => setExpanded(!stage.classList.contains("is-expanded")));
    document.addEventListener("keydown", event => { if (event.key === "Escape" && stage.classList.contains("is-expanded")) setExpanded(false); });
    let pendingVersion = null, pendingToken, ended = false, requestVersion = 0, requestController, latestData, dataToken;
    const sessionToken = () => sessionStorage.getItem(admin ? "token" : "petflow_customer_token");
    function cancelRequest() {
        requestVersion++; requestController?.abort(); requestController = null; pendingVersion = null; pendingToken = null;
    }
    async function refresh() {
        if (ended || document.hidden) return;
        const token = sessionToken();
        if (!token) { cancelRequest(); status.textContent = admin ? "Entre no painel administrativo para acompanhar a entrega." : "Entre na conta usada na compra para rastrear seu pedido."; login.hidden = false; hideMap(); latestData = null; return; }
        if (dataToken !== token) { if (latestData) hideMap(); latestData = null; dataToken = token; }
        if (pendingVersion !== null) { if (pendingToken === token) return; cancelRequest(); latestData = null; }
        if (!id) { status.textContent = "Pedido não informado."; return; }
        const current = ++requestVersion;
        pendingVersion = current; pendingToken = token;
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        requestController = controller;
        try {
            const timeout = AbortSignal.timeout(15000);
            const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/rastreamento`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller ? AbortSignal.any([controller.signal, timeout]) : timeout });
            const payload = await response.json();
            if (current !== requestVersion || document.hidden) return;
            if (sessionToken() !== token) { hideMap(); latestData = null; login.hidden = Boolean(sessionToken()); status.textContent = "A sessão foi alterada. Entre na conta do pedido para acompanhar a entrega."; return; }
            if (!response.ok) { login.hidden = response.status !== 401; throw new Error(payload.message || "Não foi possível consultar a entrega."); }
            login.hidden = true;
            let data = payload.data;
            if (!data || typeof data.status !== "string") throw new Error("A loja não retornou os dados desta entrega.");
            if (data.status !== "SAIU_PARA_ENTREGA") {
                status.textContent = ["ENTREGUE","FINALIZADA"].includes(data.status) ? (admin ? "Pedido entregue. Rastreamento encerrado." : "Pedido entregue. Obrigado por comprar com a Nação Animal!") : `Este pedido não está em rota de entrega. Consulte o status ${admin ? "no painel de pedidos" : "em Meus pedidos"}.`;
                hideMap(); latestData = null; ended = ["ENTREGUE","FINALIZADA","CANCELADA"].includes(data.status); return;
            }
            if (data.latitude === null || data.longitude === null || !data.atualizado_em) {
                hideMap(); latestData = null; status.textContent = "Pedido saiu para entrega. Aguardando o entregador compartilhar o GPS."; return;
            }
            let capturedAt = new Date(data.atualizado_em).getTime();
            if (!Number.isFinite(data.latitude) || Math.abs(data.latitude)>90 || !Number.isFinite(data.longitude) || Math.abs(data.longitude)>180 || !Number.isFinite(data.precisao_m) || data.precisao_m<0 || data.precisao_m>10000 || !Number.isFinite(capturedAt) || capturedAt>Date.now()+5000) {
                hideMap(); latestData = null; status.textContent = "A localização recebida não é válida. Aguardando uma nova posição do entregador."; return;
            }
            if (latestData && capturedAt < new Date(latestData.atualizado_em).getTime()) { data = latestData; capturedAt = new Date(data.atualizado_em).getTime(); }
            else latestData = data;
            const stale = Date.now() - capturedAt > 15000;
            status.textContent = stale ? "Sem atualização recente. O mapa mostra a última posição conhecida, não a posição atual." : (admin ? "Entregador a caminho. Acompanhe a posição e a rota da entrega no mapa." : "Entregador a caminho! Acompanhe a rota no mapa e prepare-se para receber seu pedido.");
            updated.textContent = `${new Date(data.atualizado_em).toLocaleString("pt-BR")} · Precisão aproximada: ${Math.round(data.precisao_m)} m`;
            stage.hidden = false; live.hidden = stale; updateSummary(data, stale);
            map.update(data);
        } catch (error) { if (current === requestVersion && !document.hidden) { status.textContent = `${error.message} A posição atual não pôde ser confirmada.`; hideMap(); } }
        finally { if (pendingVersion === current) { pendingVersion = null; pendingToken = null; requestController = null; } }
    }
    refresh(); setInterval(refresh,2000);
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancelRequest(); else refresh(); });
    window.addEventListener?.("pagehide", cancelRequest);
    window.addEventListener?.("pageshow", refresh);
})();
