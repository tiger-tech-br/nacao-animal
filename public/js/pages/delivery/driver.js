"use strict";
(() => {
    const token = location.hash.slice(1), status = document.getElementById("gpsStatus");
    const start = document.getElementById("startGps"), stop = document.getElementById("stopGps"), retryRoute = document.getElementById("refreshRoute");
    const routeStatus = document.getElementById("routeStatus"), mapStatus = document.getElementById("mapStatus");
    const showStatus = (element, message, visible = true) => { element.textContent = message; element.hidden = !visible; };
    const map = window.PetFlowDeliveryMap({ mode: "driver", onStatus: notice => {
        mapStatus.hidden = !running || !["error", "loading"].includes(notice.state);
        mapStatus.classList.toggle("is-error", notice.state === "error");
    } });
    // Um segundo de margem sobre a reserva de 15 s do servidor evita recalcular por fix.
    const PUBLISH_INTERVAL = 2000, GPS_MAX_AGE = 15000, ROUTE_COOLDOWN = 16000;
    const navigation = window.PetFlowDeliveryNavigation({map,recalculate:()=>{if(Date.now()-lastRouteAttempt>=ROUTE_COOLDOWN) getRoute();}});
    let running = false, pendingGeneration = null, routeGeneration = null, timer, publishTimer, watchId = null, watchGeneration = 0, generation = 0, trip, lastRouteAttempt = 0, wakeLock, paused = false, ended = false;
    let latestFix, lastFixTime = 0, attemptedFixTime = 0, sharedFixTime = 0, lastPublishAt = -Infinity, gpsMessage = "", publishMessage = "", publicationController;
    async function api(path, method = "GET", body, signal) {
        const timeout = AbortSignal.timeout(path === "localizacao" && method === "POST" ? 5000 : 15000);
        const response = await fetch(`/api/public/entregas/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout, ...(body ? { body: JSON.stringify(body) } : {}) });
        const payload = await response.json();
        if (!response.ok) throw Object.assign(new Error(payload.message || "Não foi possível conectar à loja."), { status: response.status });
        return payload.data;
    }
    function halt() {
        running = false; generation++; stopWatching(); clearInterval(timer); retryRoute.disabled = true;
        publicationController?.abort(); publicationController = null;
        pendingGeneration = routeGeneration = null;
        navigation.stop();
        wakeLock?.release().catch(() => {}); wakeLock = null;
    }
    function stopWatching() {
        watchGeneration++;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null; latestFix = null; clearTimeout(publishTimer); publishTimer = null;
    }
    function renderGpsStatus() {
        const message = gpsMessage || publishMessage;
        showStatus(status, message || "Viagem em andamento. GPS acompanha sua posição neste aparelho.", Boolean(message));
    }
    function isFresh(fix) { return fix && Date.now()-fix.time <= GPS_MAX_AGE && fix.time-Date.now() <= 5000; }
    async function keepScreenOn() {
        const current = generation;
        try {
            if (running && !document.hidden && navigator.wakeLock && (!wakeLock || wakeLock.released)) {
                const lock = await navigator.wakeLock.request("screen");
                if (running && current === generation) wakeLock = lock; else await lock.release();
            }
        } catch { /* A tela pode ser mantida ativa manualmente. */ }
    }
    async function getRoute() {
        if (!running || document.hidden || !isFresh(latestFix) || latestFix.precisao_m>50 || !sharedFixTime || !isFresh({time:sharedFixTime}) || routeGeneration === generation) return;
        if (Date.now()-lastRouteAttempt < ROUTE_COOLDOWN) return;
        const current = generation;
        routeGeneration = current; retryRoute.disabled = true; lastRouteAttempt = Date.now();
        try {
            const route = await api("rota", "POST");
            if (!running || current !== generation) return;
            trip.rota = route; map.update(trip); navigation.update(trip);
            showStatus(routeStatus, "Rota até o endereço da entrega atualizada.", false);
        } catch (error) {
            if (current !== generation) return;
            showStatus(routeStatus, `${error.message} Use Atualizar rota para tentar novamente.`);
            if ([401,410].includes(error.status)) { ended = true; halt(); start.disabled = stop.disabled = true; map.hide(); showStatus(routeStatus, "", false); showStatus(status, error.message); }
        } finally { if (routeGeneration === current) { routeGeneration = null; retryRoute.disabled = !running; } }
    }
    function queuePublish() {
        if (!running || document.hidden || pendingGeneration === generation || !isFresh(latestFix) || latestFix.time <= attemptedFixTime) return;
        const delay = Math.max(0, lastPublishAt + PUBLISH_INTERVAL - Date.now());
        if (delay) {
            if (publishTimer === null || publishTimer === undefined) publishTimer = setTimeout(() => { publishTimer = null; queuePublish(); }, delay);
            return;
        }
        publish();
    }
    async function publish() {
        if (!running || pendingGeneration === generation || document.hidden || !isFresh(latestFix) || latestFix.time <= attemptedFixTime) return;
        const current = generation;
        const fix = latestFix;
        const controller = new AbortController(); publicationController = controller;
        pendingGeneration = current; attemptedFixTime = fix.time; lastPublishAt = Date.now();
        try {
            await api("localizacao", "POST", { latitude: fix.latitude, longitude: fix.longitude, precisao: fix.precisao_m, capturadoEm: fix.atualizado_em }, controller.signal);
            if (!running || current !== generation) return;
            sharedFixTime = fix.time;
            publishMessage = ""; renderGpsStatus();
            if (!document.hidden && Date.now() - lastRouteAttempt > (trip.rota?.tipoOrigem === "GPS_ENTREGADOR" && !navigation.needsRoute() ? 300000 : ROUTE_COOLDOWN)) getRoute();
        } catch (error) {
            if (current !== generation) return;
            // Falhar o envio não interrompe as manobras calculadas com o GPS local.
            publishMessage = `Não foi possível compartilhar sua posição com a loja: ${error.message || "confira sua conexão"}. A navegação local continua com o GPS do aparelho.`;
            renderGpsStatus();
            if ([401,410].includes(error.status)) { ended = true; halt(); start.disabled = stop.disabled = true; map.hide(); showStatus(routeStatus, "", false); showStatus(status, error.message); }
        } finally { if (pendingGeneration === current) { pendingGeneration = null; publicationController = null; queuePublish(); } }
    }
    function gpsError(error, current, watch) {
        if (!running || current !== generation || watch !== watchGeneration || document.hidden) return;
        navigation.pause();
        gpsMessage = error.code === 1 ? "Acesso ao GPS negado. Permita a localização nas configurações do navegador e tente iniciar novamente." : `GPS sem atualização: ${error.message || "não foi possível obter a posição"}. Aguardando um novo sinal do aparelho.`;
        renderGpsStatus();
        if (error.code === 1) { halt(); map.hide(); start.disabled = false; start.textContent = "Tentar iniciar novamente"; }
    }
    function startWatching() {
        if (!running || document.hidden || watchId !== null) return;
        const current = generation, watch = ++watchGeneration;
        watchId = navigator.geolocation.watchPosition(position => {
            if (!running || current !== generation || watch !== watchGeneration || document.hidden) return;
            const coords = position.coords, time = position.timestamp;
            if (!Number.isFinite(time) || !Number.isFinite(coords?.latitude) || Math.abs(coords.latitude)>90 || !Number.isFinite(coords.longitude) || Math.abs(coords.longitude)>180 || !Number.isFinite(coords.accuracy) || coords.accuracy<0 || coords.accuracy>10000) {
                gpsError({message:"O aparelho retornou uma posição inválida."}, current, watch); return;
            }
            if (time <= lastFixTime) return;
            if (!isFresh({time})) { gpsError({message:"A última posição do aparelho está desatualizada."}, current, watch); return; }
            lastFixTime = time;
            latestFix = { latitude: coords.latitude, longitude: coords.longitude, precisao_m: coords.accuracy, heading: Number.isFinite(coords.heading) ? coords.heading : null,
                velocidade_mps: Number.isFinite(coords.speed) && coords.speed>=0 ? coords.speed : null, atualizado_em: new Date(time).toISOString(), time };
            trip = { ...trip, ...latestFix };
            gpsMessage = coords.accuracy>50 ? "GPS impreciso. Aguarde um sinal mais preciso para seguir as orientações." : "";
            // Não aguarda a rede: cada posição real move a seta e atualiza as manobras.
            map.update(trip); navigation.update(trip); renderGpsStatus();
            queuePublish();
        }, error => gpsError(error, current, watch), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }
    function checkGpsFreshness() {
        if (!running || document.hidden || !lastFixTime || Date.now()-lastFixTime <= GPS_MAX_AGE) return;
        gpsMessage = "GPS sem atualização recente. Aguardando uma nova posição do aparelho para continuar as orientações.";
        navigation.pause(); renderGpsStatus();
    }
    start.addEventListener("click", async () => {
        if (ended || running) return;
        if (!navigator.geolocation?.watchPosition || !window.isSecureContext) { showStatus(status, "Abra este link em HTTPS em um celular com GPS."); return; }
        paused = false; start.disabled = true; showStatus(status, "Preparando viagem...");
        showStatus(routeStatus, "", false); mapStatus.hidden = true;
        const current = ++generation;
        try {
            const nextTrip = await api("viagem");
            if (current !== generation) return;
            trip = nextTrip;
            sharedFixTime = 0;
            running = true; stop.disabled = false; retryRoute.hidden = false;
            gpsMessage = "Permita a localização para iniciar a viagem e mostrar o mapa."; publishMessage = "";
            navigation.start();
            map.update({ ...trip, latitude: null, longitude: null });
            renderGpsStatus();
            keepScreenOn(); startWatching(); timer = setInterval(checkGpsFreshness, 1000);
        } catch (error) {
            if (current !== generation) return;
            showStatus(status, error.message); ended = [401,410].includes(error.status); start.disabled = ended;
        }
    });
    stop.addEventListener("click", async () => {
        ended = true; paused = false;
        halt(); stop.disabled = true; start.disabled = true; map.hide();
        showStatus(routeStatus, "", false); showStatus(status, "GPS parado neste aparelho. Encerrando o link...");
        try { await api("localizacao", "DELETE"); history.replaceState(null, "", location.pathname); showStatus(status, "Compartilhamento encerrado. Para outra viagem, peça um novo link à loja."); }
        catch (error) {
            if ([401,410].includes(error.status)) showStatus(status, "Link já encerrado ou expirado.");
            else { showStatus(status, "GPS parado neste aparelho. Não foi possível encerrar o link no servidor; tente o botão novamente."); stop.disabled = false; }
        }
    });
    retryRoute.addEventListener("click", getRoute);
    document.addEventListener("visibilitychange", () => {
        if (!running) return;
        if (document.hidden) { stopWatching(); navigation.pause(); wakeLock?.release().catch(() => {}); wakeLock = null; }
        else { gpsMessage = "Aguardando uma nova posição GPS após voltar à viagem."; renderGpsStatus(); keepScreenOn(); startWatching(); }
    });
    window.addEventListener("pagehide", () => {
        // O navegador pode guardar esta página no BFCache. Voltar exige um novo clique.
        paused = !ended && (running || start.disabled);
        halt();
        if (paused) { map.hide(); start.disabled = false; stop.disabled = !trip; start.textContent = "Retomar viagem"; }
    });
    window.addEventListener("pageshow", () => {
        if (!paused || ended) return;
        showStatus(routeStatus, "", false);
        showStatus(status, "Viagem pausada neste aparelho. Toque em Retomar viagem para compartilhar o GPS novamente.");
    });
    if (!/^[a-f0-9]{64}$/.test(token)) { ended = true; start.disabled = true; showStatus(status, "Link inválido. Peça à loja o link completo desta entrega."); }
})();
