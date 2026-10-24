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
    const navigation = window.PetFlowDeliveryNavigation({map,recalculate:queueRoute});
    let running = false, pendingGeneration = null, routeGeneration = null, timer, publishTimer, watchId = null, watchGeneration = 0, generation = 0, trip, lastRouteAttempt = 0, wakeLock, paused = false, ended = false;
    let latestFix, lastFixTime = 0, attemptedFixTime = 0, sharedFixTime = 0, lastPublishAt = -Infinity, gpsMessage = "", publishMessage = "", publicationController, gpsUsable = false, wakeRequest = 0, wakePending = false;
    let routeEpoch = 0, routeController, routeRetryTimer = null;
    const routeOptions = window.PetFlowDeliveryRouteOptions?.({onSelect:selectRoute});
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
        cancelRoute(); routeOptions?.clear();
        publicationController?.abort(); publicationController = null;
        pendingGeneration = routeGeneration = null;
        navigation.stop();
        releaseScreen();
    }
    function stopWatching() {
        map.pauseMotion?.();
        cancelRoute();
        watchGeneration++;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null; latestFix = null; gpsUsable = false; clearTimeout(publishTimer); publishTimer = null;
    }
    function cancelRoute() {
        routeEpoch++; routeController?.abort(); routeController = null; routeGeneration = null;
        if (routeRetryTimer !== null) clearTimeout(routeRetryTimer);
        routeRetryTimer = null; routeOptions?.setBusy(false);
    }
    function queueRoute() {
        if (!running || document.hidden || !gpsUsable || !isFresh(latestFix) || routeGeneration === generation) return;
        const remaining = Math.max(0,ROUTE_COOLDOWN-(Date.now()-lastRouteAttempt));
        if (!remaining) { getRoute(); return; }
        if (routeRetryTimer !== null) return;
        const current = generation;
        routeRetryTimer = setTimeout(() => { routeRetryTimer = null; if (current === generation) getRoute(); },remaining+50);
        showStatus(routeStatus,"Atualizando o trajeto a partir da sua posição. Aguarde alguns segundos.");
    }
    function applyRoute(route) {
        trip = {...trip,rota:route}; routeOptions?.render(route);
        if (!document.hidden) {
            map.update(trip);
            if (gpsUsable && isFresh(latestFix)) navigation.update(trip); else navigation.pause();
        }
    }
    async function selectRoute(option) {
        if (!running || document.hidden || routeGeneration === generation) return;
        const current=generation,epoch=++routeEpoch;
        const controller=new AbortController();routeController=controller;routeGeneration=current;routeOptions?.setBusy(true);
        try {
            const route=await api("rota","PATCH",{rotaId:option.id,calculadaEm:option.calculadaEm},controller.signal);
            if (!running || current!==generation || epoch!==routeEpoch || document.hidden) return;
            applyRoute(route);showStatus(routeStatus,"Trajeto selecionado. A navegação continua pela opção escolhida.",false);
        } catch(error) {
            if (current!==generation || epoch!==routeEpoch) return;
            if (trip?.rota) routeOptions?.render(trip.rota);
            showStatus(routeStatus,error.message);
            if ([401,410].includes(error.status)) {ended=true;halt();map.hide();start.disabled=stop.disabled=true;}
        } finally {
            if (current===generation && epoch===routeEpoch) {routeGeneration=null;routeController=null;routeOptions?.setBusy(false);}
        }
    }
    function renderGpsStatus() {
        const message = gpsMessage || publishMessage;
        showStatus(status, message || "Viagem em andamento. GPS acompanha sua posição neste aparelho.", Boolean(message));
    }
    function isFresh(fix) { return fix && Date.now()-fix.time <= GPS_MAX_AGE && fix.time-Date.now() <= 5000; }
    function releaseScreen() {
        wakeRequest++; wakePending = false;
        wakeLock?.release().catch(() => {}); wakeLock = null;
    }
    async function keepScreenOn() {
        const current = generation;
        if (!running || document.hidden || !navigator.wakeLock || wakePending || (wakeLock && !wakeLock.released)) return;
        const request = ++wakeRequest; wakePending = true;
        try {
            const lock = await navigator.wakeLock.request("screen");
            if (running && !document.hidden && current === generation && request === wakeRequest) wakeLock = lock;
            else await lock.release();
        } catch { /* A tela pode ser mantida ativa manualmente. */ }
        finally { if (request === wakeRequest) wakePending = false; }
    }
    async function getRoute() {
        if (!running || document.hidden || !isFresh(latestFix) || latestFix.precisao_m>50 || !sharedFixTime || !isFresh({time:sharedFixTime}) || routeGeneration === generation) return;
        if (Date.now()-lastRouteAttempt < ROUTE_COOLDOWN) { queueRoute(); return; }
        if (routeRetryTimer !== null) clearTimeout(routeRetryTimer); routeRetryTimer=null;
        const current = generation, epoch=++routeEpoch;
        const controller=new AbortController(); routeController=controller;
        routeGeneration = current; retryRoute.disabled = true; lastRouteAttempt = Date.now();
        routeOptions?.setBusy(true);
        try {
            const route = await api("rota", "POST", undefined, controller.signal);
            if (!running || current !== generation || epoch!==routeEpoch || document.hidden) return;
            if (!route || typeof route.polyline!=="string" || !route.polyline)
                throw new Error("Não foi possível obter um trajeto. Atualize a rota para tentar novamente.");
            applyRoute(route);
            showStatus(routeStatus, "Rota até o endereço da entrega atualizada.", false);
        } catch (error) {
            if (current !== generation || epoch!==routeEpoch) return;
            showStatus(routeStatus, `${error.message} Use Atualizar rota para tentar novamente.`);
            if ([401,410].includes(error.status)) { ended = true; halt(); start.disabled = stop.disabled = true; map.hide(); showStatus(routeStatus, "", false); showStatus(status, error.message); }
        } finally { if (routeGeneration === current && epoch===routeEpoch) { routeGeneration = null; routeController=null; retryRoute.disabled = !running; routeOptions?.setBusy(false); } }
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
        gpsUsable = false; latestFix = null; sharedFixTime = 0;
        map.pauseMotion?.();
        cancelRoute();
        clearTimeout(publishTimer); publishTimer = null;
        navigation.pause();
        gpsMessage = error.code === 1 ? "Acesso ao GPS negado. Permita a localização nas configurações do navegador e tente iniciar novamente." : `GPS sem atualização: ${error.message || "não foi possível obter a posição"}. Aguardando um novo sinal do aparelho.`;
        renderGpsStatus();
        if (error.code === 1) { halt(); map.hide(); start.disabled = false; start.textContent = "Tentar iniciar novamente"; }
    }
    function startWatching() {
        if (!running || document.hidden || watchId !== null) return;
        const current = generation, watch = ++watchGeneration;
        let id;
        try { id = navigator.geolocation.watchPosition(position => {
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
            gpsUsable = coords.accuracy<=50;
            gpsMessage = coords.accuracy>50 ? "GPS impreciso. Aguarde um sinal mais preciso para seguir as orientações." : "";
            // Não aguarda a rede: cada posição real move a seta e atualiza as manobras.
            map.update(trip); navigation.update(trip); renderGpsStatus();
            queuePublish();
        }, error => gpsError(error, current, watch), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }
        catch (error) {
            if (current !== generation || watch !== watchGeneration) return;
            halt(); map.hide(); start.disabled = false; start.textContent = "Tentar iniciar novamente";
            showStatus(status, `Não foi possível iniciar o GPS: ${error.message || "confira a permissão de localização no navegador"}.`);
            return;
        }
        if (!running || current !== generation || watch !== watchGeneration) navigator.geolocation.clearWatch(id);
        else watchId = id;
    }
    function checkGpsFreshness() {
        if (!running || document.hidden || !lastFixTime || Date.now()-lastFixTime <= GPS_MAX_AGE) return;
        gpsUsable = false;
        gpsMessage = "GPS sem atualização recente. Aguardando uma nova posição do aparelho para continuar as orientações.";
        map.pauseMotion?.(); navigation.pause(); renderGpsStatus();
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
            if (trip.rota) routeOptions?.render(trip.rota);
            sharedFixTime = 0;
            running = true; stop.disabled = false; retryRoute.hidden = false;
            gpsMessage = "Permita a localização para iniciar a viagem e mostrar o mapa."; publishMessage = "";
            navigation.start();
            map.update({ ...trip, latitude: null, longitude: null });
            renderGpsStatus();
            keepScreenOn(); startWatching(); if (running) timer = setInterval(checkGpsFreshness, 1000);
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
        if (document.hidden) { stopWatching(); navigation.pause(); releaseScreen(); }
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
