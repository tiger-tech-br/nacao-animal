"use strict";
(() => {
    const status = document.getElementById("gpsStatus"), start = document.getElementById("startGps");
    const stop = document.getElementById("stopGps"), retry = document.getElementById("refreshRoute");
    const routeStatus = document.getElementById("routeStatus"), mapStatus = document.getElementById("mapStatus");
    const login = document.getElementById("testLogin"), destination = document.getElementById("destinationAddress");
    const COOLDOWN_MS = 60000;
    let running = false, preparing = false, generation = 0, watchId = null, trip = null;
    let routeController = null, routePending = false, routeAttempted = false, lastRouteAt = null;
    let token = "", mapReady = false, routeReady = false, paused = false, wakeLock = null;
    const show = (element, message) => { element.textContent = message; element.hidden = !message; };
    function summary() {
        if (!running) return;
        show(status, trip ? `GPS obtido · Precisão: ${Math.round(trip.precisao_m)} m · Mapa ${mapReady ? "carregado" : "aguardando"} · Rota ${routeReady ? "calculada" : "aguardando"}.` : "Permita a localização para iniciar o teste até a loja.");
    }
    const map = window.PetFlowDeliveryMap({ mode: "driver", onStatus(notice) {
        if (!running) { show(mapStatus, ""); return; }
        mapReady = notice.state === "ready" && Boolean(notice.message);
        mapStatus.classList.toggle("is-error", notice.state === "error");
        show(mapStatus, ["error", "loading"].includes(notice.state) ? notice.message : "");
        summary();
    } });
    // O teste nunca recalcula a rota automaticamente para evitar consultas repetidas ao Google.
    const navigation = window.PetFlowDeliveryNavigation({ map, recalculate() {} });
    async function api(path, options = {}) {
        const response = await fetch(path, { cache: "no-store", ...options,
            headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) } });
        const payload = await response.json();
        if (!response.ok) throw Object.assign(new Error(payload.message || "Não foi possível concluir o teste."), { status: response.status });
        return payload.data;
    }
    async function validateSession(current) {
        try { token = sessionStorage.getItem("token") || ""; } catch { token = ""; }
        if (!token) throw Object.assign(new Error("Entre no painel administrativo antes de testar o GPS."), { status: 401 });
        const user = await api("/api/auth/me", { signal: AbortSignal.timeout(15000) });
        if (current !== generation) return false;
        if (!["ADMIN", "GERENTE"].includes(user?.cargo || user?.perfil)) throw Object.assign(new Error("O teste é exclusivo para administradores e gerentes."), { status: 403 });
        login.hidden = true; return true;
    }
    function clearTest() {
        running = preparing = false; generation++;
        if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
        watchId = null; routeController?.abort(); routeController = null; routePending = false;
        trip = null; mapReady = routeReady = false; navigation.stop(); map.hide();
        wakeLock?.release().catch(() => {}); wakeLock = null;
        retry.disabled = true; retry.hidden = true; stop.disabled = true;
        show(routeStatus, ""); show(mapStatus, "");
        document.getElementById("originAddress").textContent = "";
        destination.textContent = "Destino do teste: loja Nação Animal.";
    }
    function authFailure(error) {
        clearTest(); start.disabled = false;
        show(status, error.message); login.hidden = ![401, 403].includes(error.status);
        start.textContent = "Conferir acesso novamente";
    }
    async function keepScreenOn(current) {
        try {
            if (!navigator.wakeLock) return;
            const lock = await navigator.wakeLock.request("screen");
            if (running && current === generation) wakeLock = lock; else await lock.release();
        } catch { /* O aparelho pode não permitir manter a tela acesa. */ }
    }
    function validFix(position) {
        const coords = position?.coords, timestamp = Number(position?.timestamp);
        return coords && Number.isFinite(coords.latitude) && Math.abs(coords.latitude) <= 90 &&
            Number.isFinite(coords.longitude) && Math.abs(coords.longitude) <= 180 &&
            Number.isFinite(coords.accuracy) && coords.accuracy >= 0 &&
            Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp <= 30000 && timestamp - Date.now() <= 5000;
    }
    async function requestRoute() {
        if (!running || !trip || routePending) return;
        if (Date.now() - trip.timestamp > 30000 || trip.precisao_m > 100) {
            show(routeStatus, "Aguarde um GPS recente com precisão de até 100 m para calcular a rota."); return;
        }
        const remaining = lastRouteAt === null ? 0 : COOLDOWN_MS - (Date.now() - lastRouteAt);
        if (remaining > 0) { show(routeStatus, `Aguarde ${Math.ceil(remaining / 1000)} segundos antes de consultar outra rota.`); return; }
        const current = generation;
        routePending = true; retry.disabled = true; lastRouteAt = Date.now();
        const controller = new AbortController(); routeController = controller;
        const timeout = setTimeout(() => controller.abort(), 15000);
        show(routeStatus, "Calculando uma rota de teste até a loja. Seu GPS continua atualizando nesta tela.");
        try {
            const route = await api("/api/gps-diagnostico/rota", { method: "POST", signal: controller.signal,
                body: JSON.stringify({ latitude: trip.latitude, longitude: trip.longitude, precisao: trip.precisao_m, timestamp: trip.timestamp }) });
            if (!running || current !== generation) return;
            trip.rota = route; routeReady = true;
            if (route.enderecoDestino && typeof route.enderecoDestino === "object") trip.endereco_entrega = route.enderecoDestino;
            map.update(trip); navigation.update(trip);
            if (!trip.endereco_entrega) destination.textContent = "Destino do teste: loja Nação Animal.";
            show(routeStatus, "Rota de teste calculada até a loja. Recalcule manualmente se precisar de outro trajeto."); summary();
        } catch (error) {
            if (current !== generation) return;
            if ([401, 403].includes(error.status)) { authFailure(error); return; }
            show(routeStatus, error.name === "AbortError" ? "A rota demorou para responder. Seu GPS continua disponível; tente recalcular em um minuto." : `${error.message} Seu GPS continua disponível nesta tela.`);
        } finally {
            clearTimeout(timeout);
            if (current === generation) { routePending = false; routeController = null; retry.disabled = !running; }
        }
    }
    function receivePosition(position, current) {
        if (!running || current !== generation || document.hidden) return;
        if (!validFix(position)) { show(status, "Aguardando uma posição GPS válida e recente. Confira a localização do aparelho."); navigation.pause(); return; }
        const coords = position.coords;
        trip = { ...trip, latitude: coords.latitude, longitude: coords.longitude, precisao_m: coords.accuracy,
            heading: Number.isFinite(coords.heading) ? coords.heading : null,
            velocidade_mps: Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null,
            timestamp: Number(position.timestamp), atualizado_em: new Date(position.timestamp).toISOString() };
        // Renderização local vem antes de qualquer chamada da rota ao servidor.
        map.update(trip); navigation.update(trip); summary();
        if (!trip.endereco_entrega) destination.textContent = "Destino do teste: loja Nação Animal.";
        if (!routeAttempted && trip.precisao_m <= 100) { routeAttempted = true; requestRoute(); }
    }
    function positionError(error, current) {
        if (!running || current !== generation) return;
        if (error.code === 1) {
            clearTest(); start.disabled = false; start.textContent = "Tentar GPS novamente";
            show(status, "Localização negada. Permita a localização para este site e para o navegador nas configurações do celular.");
        } else {
            navigation.pause(); show(status, "GPS temporariamente indisponível. Aguardando o sinal do aparelho; o teste não envia posições inventadas.");
        }
    }
    start.addEventListener("click", async () => {
        if (running || preparing || document.hidden) return;
        if (!window.isSecureContext || !navigator.geolocation?.watchPosition) { show(status, "Abra o endereço HTTPS do Railway em um celular com localização disponível."); return; }
        preparing = true; start.disabled = true; show(status, "Conferindo o acesso administrativo...");
        const current = ++generation;
        try {
            if (!await validateSession(current) || current !== generation || document.hidden) return;
            preparing = paused = false; running = true; routeAttempted = false;
            stop.disabled = false; retry.hidden = false; retry.disabled = false;
            navigation.start(); summary(); keepScreenOn(current);
            const id = navigator.geolocation.watchPosition(position => receivePosition(position, current), error => positionError(error, current),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
            if (running && current === generation) watchId = id; else navigator.geolocation.clearWatch(id);
        } catch (error) { if (current === generation) authFailure(error); }
    });
    stop.addEventListener("click", () => {
        paused = false; clearTest(); start.disabled = false; start.textContent = "Testar GPS e navegação";
        show(status, "Teste encerrado. A posição foi removida desta tela. Nenhum pedido foi criado.");
    });
    retry.addEventListener("click", requestRoute);
    function pause() {
        if (!running && !preparing) return;
        paused = true; clearTest(); start.disabled = false; start.textContent = "Retomar teste";
        show(status, "Teste pausado. Toque em Retomar teste para permitir o GPS novamente.");
    }
    document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", () => { if (paused) show(status, "Teste pausado. Toque em Retomar teste para permitir o GPS novamente."); });
    const current = generation;
    validateSession(current).then(valid => {
        if (valid && current === generation) { start.disabled = false; show(status, "Acesso confirmado. O GPS só será solicitado ao tocar em testar."); }
    }).catch(error => { if (current === generation) authFailure(error); });
})();
