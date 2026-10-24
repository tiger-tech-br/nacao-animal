"use strict";
(() => {
    const status = document.getElementById("gpsStatus"), start = document.getElementById("startGps");
    const stop = document.getElementById("stopGps"), retry = document.getElementById("refreshRoute");
    const routeStatus = document.getElementById("routeStatus"), mapStatus = document.getElementById("mapStatus");
    const login = document.getElementById("testLogin"), destination = document.getElementById("destinationAddress");
    const movementStatus = document.getElementById("gpsMovementStatus");
    const diagnostics = document.getElementById("gpsDiagnostics"), diagnosticSummary = document.getElementById("gpsDiagnosticSummary");
    const diagnosticReport = document.getElementById("gpsDiagnosticReport"), copyDiagnostic = document.getElementById("copyGpsDiagnostic");
    const diagnosticStatus = document.getElementById("gpsDiagnosticStatus");
    const quality = window.PetFlowGpsQuality?.create();
    let diagnosticVersion = 0;
    const COOLDOWN_MS = 16000;
    let running = false, preparing = false, generation = 0, watchId = null, trip = null;
    let routeController = null, routePending = false, routeAttempted = false, lastRouteAt = null;
    let routeEpoch = 0, routeTimer = null, routeTimeout = null, routeQueued = false, queuedManual = false, automaticBlocked = false;
    let token = "", mapReady = false, routeReady = false, paused = false, wakeLock = null;
    let movementOrigin = null, summaryTimer = null, gpsMessage = "";
    const canNavigate = () => running && !document.hidden && !gpsMessage && trip && Date.now() - trip.timestamp <= 15000 && trip.precisao_m <= 50;
    const canRoute = () => canNavigate() && trip.timestamp-Date.now() <= 5000;
    let view = { following: false, overview: true };
    const show = (element, message) => { element.textContent = message; element.hidden = !message; };
    const durationText = value => Number.isFinite(value) ? `${(value/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})} s` : "aguardando outra leitura";
    function renderQuality() {
        if (!quality || !diagnostics) return;
        const report = quality.snapshot();
        diagnostics.hidden = running || report.reads === 0;
        copyDiagnostic.disabled = report.reads === 0;
        diagnosticSummary.textContent = `${report.reads} leituras · Intervalo médio: ${durationText(report.intervals.receiptMeanMs)} · Maior intervalo: ${durationText(report.intervals.receiptMaxMs)} · Maior idade ao receber: ${durationText(report.age.maxMs)} · Maior tempo de desenho: ${Math.round(report.motion.maxRenderDelayMs)} ms.`;
    }
    function clearQuality() {
        diagnosticVersion++; quality?.reset();
        if (diagnosticReport) { diagnosticReport.value = ""; diagnosticReport.hidden = true; }
        if (diagnosticStatus) show(diagnosticStatus, "");
        renderQuality();
    }
    function summary() {
        if (!running) return;
        const age = trip ? Math.max(0, Math.floor((Date.now() - trip.timestamp) / 1000)) : 0;
        const stale = Boolean(trip && age >= 15);
        show(status, gpsMessage || (stale ? `GPS sem atualização há ${age} segundos. Aguardando uma nova posição do aparelho.`
            : trip ? `GPS obtido · Precisão: ${Math.round(trip.precisao_m)} m · Mapa ${mapReady ? "carregado" : "aguardando"} · Rota ${routeReady ? "calculada" : "aguardando"}.` : "Permita a localização para iniciar o teste até a loja."));
        if (!trip) { show(movementStatus, ""); return; }
        // Direção e relógio não contam como deslocamento. A estimativa usa só
        // coordenadas reais na memória desta tela, sem consultar o Google.
        const meters = movementOrigin && trip.precisao_m <= 50
            ? Math.round(window.PetFlowNavigationEngine.distance(movementOrigin, trip)) : null;
        const movement = meters === null ? "Deslocamento: aguardando GPS mais preciso" : `Deslocamento estimado: ~${meters} m desde o início`;
        const camera = view.following ? "Seguindo você: o mapa anda por baixo da seta centralizada."
            : view.overview ? "Rota completa: acompanhe a seta avançando no trajeto."
                : "Mapa livre: toque em Centralizar em mim para voltar a acompanhar.";
        const timing = quality?.snapshot().latest;
        const cadence = timing && Number.isFinite(timing.receiptIntervalMs) ? ` · Intervalo: ${durationText(timing.receiptIntervalMs)}` : "";
        show(movementStatus, `Precisão: ${Math.round(trip.precisao_m)} m · ${age <= 2 ? "Leitura agora" : `Leitura há ${age} s`}${cadence}\n${movement}\n${camera}`);
        if (mapReady && routeReady && !stale && !gpsMessage) status.hidden = true;
        if (stale) { suspendRoute(); map.pauseMotion?.(); navigation.pause(); }
    }
    const map = window.PetFlowDeliveryMap({ mode: "driver", onMotion(motion) {
        quality?.recordMotion(motion);
        if (motion.phase !== "frame" || !motion.active) renderQuality();
    }, onViewChange(nextView) { view = nextView; summary(); }, onStatus(notice) {
        if (!running) { show(mapStatus, ""); return; }
        mapReady = notice.state === "ready" && Boolean(notice.message);
        mapStatus.classList.toggle("is-error", notice.state === "error");
        show(mapStatus, ["error", "loading"].includes(notice.state) ? notice.message : "");
        summary();
    } });
    const routeOptions = window.PetFlowDeliveryRouteOptions?.({onSelect:selectRoute});
    const navigation = window.PetFlowDeliveryNavigation({ map, recalculate() { requestRoute({automatic:true}); } });
    function cancelRoute() {
        routeEpoch++; routeController?.abort(); routeController = null; routePending = false;
        if (routeTimer !== null) clearTimeout(routeTimer);
        if (routeTimeout !== null) clearTimeout(routeTimeout);
        routeTimer = routeTimeout = null; routeQueued = queuedManual = false;
        retry.disabled = !running;
        routeOptions?.setBusy(false);
    }
    function suspendRoute() {
        if (routePending || routeTimer !== null || routeQueued) cancelRoute();
        if (!routeReady) routeAttempted = false;
    }
    function selectRoute(option) {
        if (!running || document.hidden || !trip?.rota || routePending) return;
        const alternatives = trip.rota.alternativas || [];
        const selected = alternatives.find(item => item.id === option?.id);
        if (!selected) return;
        cancelRoute(); automaticBlocked = false;
        trip = {...trip,rota:{...selected,alternativas:alternatives,...(trip.rota.enderecoDestino ? {enderecoDestino:trip.rota.enderecoDestino} : {})}};
        routeReady = true; map.update(trip);
        if (canNavigate()) navigation.update(trip); else navigation.pause();
        routeOptions?.render(trip.rota);
        show(routeStatus,"Rota alternativa selecionada. A navegação acompanha o novo trajeto.");
    }
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
    function clearTest(keepDiagnostics = false) {
        running = preparing = false; generation++;
        if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
        watchId = null; cancelRoute(); routeOptions?.clear(); automaticBlocked = false;
        if (summaryTimer !== null) clearInterval(summaryTimer);
        summaryTimer = null; movementOrigin = null; gpsMessage = ""; show(movementStatus, "");
        if (!keepDiagnostics) clearQuality(); else quality?.finish();
        trip = null; mapReady = routeReady = false; navigation.stop(); map.hide();
        renderQuality();
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
    async function requestRoute({automatic=false}={}) {
        if (!running || document.hidden || !trip || routePending || automatic && automaticBlocked) return;
        if (!automatic) automaticBlocked = false;
        if (!canRoute()) {
            if (!automatic) show(routeStatus, "Aguarde um GPS recente com precisão de até 50 m para calcular a rota.");
            return;
        }
        const remaining = lastRouteAt === null ? 0 : COOLDOWN_MS - (Date.now() - lastRouteAt);
        if (remaining > 0) {
            routeQueued = true; queuedManual ||= !automatic;
            show(routeStatus, `Aguarde ${Math.ceil(remaining / 1000)} segundos. O novo trajeto será calculado automaticamente com o GPS recente.`);
            if (routeTimer === null) {
                const current = generation, epoch = routeEpoch;
                routeTimer = setTimeout(() => {
                    if (current !== generation || epoch !== routeEpoch) return;
                    routeTimer = null;
                    if (!routeQueued || !canRoute()) return;
                    const manual = queuedManual; routeQueued = queuedManual = false;
                    requestRoute({automatic:!manual});
                },remaining);
            }
            return;
        }
        if (routeTimer !== null) clearTimeout(routeTimer);
        routeTimer = null; routeQueued = queuedManual = false;
        const current = generation, epoch = ++routeEpoch;
        routePending = true; retry.disabled = true; lastRouteAt = Date.now();
        routeOptions?.setBusy(true);
        const controller = new AbortController(); routeController = controller;
        const timeout = routeTimeout = setTimeout(() => controller.abort(), 15000);
        show(routeStatus, "Calculando rotas de teste até a loja. Seu GPS continua atualizando nesta tela.");
        try {
            const route = await api("/api/gps-diagnostico/rota", { method: "POST", signal: controller.signal,
                body: JSON.stringify({ latitude: trip.latitude, longitude: trip.longitude, precisao: trip.precisao_m, timestamp: trip.timestamp }) });
            if (!running || document.hidden || current !== generation || epoch !== routeEpoch) return;
            if (!canRoute()) { routeAttempted = Boolean(routeReady); return; }
            if (!route || typeof route !== "object" || typeof route.polyline !== "string" || !route.polyline)
                throw new Error("A consulta não retornou uma rota utilizável para este percurso.");
            trip.rota = route; routeReady = true;
            if (route.enderecoDestino && typeof route.enderecoDestino === "object") trip.endereco_entrega = route.enderecoDestino;
            routeOptions?.render(route);
            map.update(trip);
            if (canNavigate()) navigation.update(trip);
            else navigation.pause();
            if (!trip.endereco_entrega) destination.textContent = "Destino do teste: loja Nação Animal.";
            show(routeStatus, ""); summary();
        } catch (error) {
            if (current !== generation || epoch !== routeEpoch) return;
            if ([401, 403].includes(error.status)) { authFailure(error); return; }
            automaticBlocked = true; routeQueued = queuedManual = false;
            show(routeStatus, error.name === "AbortError" ? "A rota demorou para responder. Seu GPS continua disponível; use Atualizar rota para tentar novamente." : `${error.message} Seu GPS continua disponível nesta tela. Use Atualizar rota para tentar novamente.`);
        } finally {
            clearTimeout(timeout);
            if (current === generation && epoch === routeEpoch) { routePending = false; routeController = null; routeTimeout = null; retry.disabled = !running; routeOptions?.setBusy(false); }
        }
    }
    function receivePosition(position, current) {
        if (!running || current !== generation || document.hidden) return;
        if (!validFix(position)) { gpsMessage = "Aguardando uma posição GPS válida e recente. Confira a localização do aparelho."; suspendRoute(); map.pauseMotion?.(); navigation.pause(); summary(); return; }
        if (trip && Number(position.timestamp) <= trip.timestamp) return;
        const coords = position.coords;
        quality?.recordFix({timestamp:Number(position.timestamp),accuracy:coords.accuracy,speed:coords.speed,heading:coords.heading},Date.now());
        trip = { ...trip, latitude: coords.latitude, longitude: coords.longitude, precisao_m: coords.accuracy,
            heading: Number.isFinite(coords.heading) ? coords.heading : null,
            velocidade_mps: Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null,
            timestamp: Number(position.timestamp), atualizado_em: new Date(position.timestamp).toISOString() };
        gpsMessage = "";
        if (!movementOrigin && coords.accuracy <= 50) movementOrigin = { latitude: coords.latitude, longitude: coords.longitude };
        // Renderização local vem antes de qualquer chamada da rota ao servidor.
        map.update(trip); navigation.update(trip); summary();
        if (!trip.endereco_entrega) destination.textContent = "Destino do teste: loja Nação Animal.";
        if (!routeAttempted && !automaticBlocked && canRoute()) { routeAttempted = true; requestRoute({automatic:true}); }
        else if (routeQueued && routeTimer === null && canRoute()) {
            const manual = queuedManual; routeQueued = queuedManual = false;
            requestRoute({automatic:!manual});
        }
    }
    function positionError(error, current) {
        if (!running || current !== generation) return;
        if (error.code === 1) {
            clearTest(); start.disabled = false; start.textContent = "Tentar GPS novamente";
            show(status, "Localização negada. Permita a localização para este site e para o navegador nas configurações do celular.");
        } else {
            suspendRoute(); map.pauseMotion?.(); navigation.pause(); gpsMessage = "GPS temporariamente indisponível. Aguardando o sinal do aparelho; o teste não envia posições inventadas."; summary();
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
            clearQuality();
            gpsMessage = "";
            stop.disabled = false; retry.hidden = false; retry.disabled = false;
            navigation.start(); summary(); keepScreenOn(current);
            summaryTimer = setInterval(summary, 1000);
            const id = navigator.geolocation.watchPosition(position => receivePosition(position, current), error => positionError(error, current),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
            if (running && current === generation) watchId = id; else navigator.geolocation.clearWatch(id);
        } catch (error) { if (current === generation) authFailure(error); }
    });
    stop.addEventListener("click", () => {
        paused = false; clearTest(true); start.disabled = false; start.textContent = "Testar GPS e navegação";
        show(status, "Teste encerrado. A posição foi removida desta tela. Nenhum pedido foi criado.");
    });
    retry.addEventListener("click", () => requestRoute());
    copyDiagnostic?.addEventListener("click", async () => {
        if (!quality || !quality.snapshot().reads) return;
        const current = generation, version = diagnosticVersion;
        const text = JSON.stringify({type:"nacao-animal-gps-quality",version:1,...quality.snapshot()},null,2);
        diagnosticReport.value = text; diagnosticReport.hidden = false;
        try {
            if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
            await navigator.clipboard.writeText(text);
            if (current !== generation || version !== diagnosticVersion || document.hidden) return;
            show(diagnosticStatus,"Diagnóstico copiado. Ele não contém coordenadas, endereço ou dados da sua conta.");
        } catch {
            if (current !== generation || version !== diagnosticVersion || document.hidden) return;
            show(diagnosticStatus,"Selecione e copie o relatório abaixo. Ele não contém sua localização.");
        }
    });
    function pause() {
        if (!running && !preparing) { clearQuality(); return; }
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
