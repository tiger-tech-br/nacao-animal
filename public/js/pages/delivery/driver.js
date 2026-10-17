"use strict";
(() => {
    const token = location.hash.slice(1), status = document.getElementById("gpsStatus");
    const start = document.getElementById("startGps"), stop = document.getElementById("stopGps"), retryRoute = document.getElementById("refreshRoute");
    const map = window.PetFlowDeliveryMap({ mode: "driver" });
    const navigation = window.PetFlowDeliveryNavigation({map,recalculate:()=>{if(Date.now()-lastRouteAttempt>=60000) getRoute();}});
    let running = false, pending = false, routePending = false, timer, generation = 0, trip, lastRouteAttempt = 0, wakeLock;
    async function api(path, method = "GET", body) {
        const response = await fetch(`/api/public/entregas/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            cache: "no-store", signal: AbortSignal.timeout(15000), ...(body ? { body: JSON.stringify(body) } : {}) });
        const payload = await response.json();
        if (!response.ok) throw Object.assign(new Error(payload.message || "Não foi possível conectar à loja."), { status: response.status });
        return payload.data;
    }
    function halt() {
        running = false; generation++; clearInterval(timer); retryRoute.disabled = true;
        navigation.stop();
        wakeLock?.release().catch(() => {}); wakeLock = null;
    }
    async function keepScreenOn() {
        try {
            if (running && !document.hidden && navigator.wakeLock && (!wakeLock || wakeLock.released)) {
                const lock = await navigator.wakeLock.request("screen");
                if (running) wakeLock = lock; else await lock.release();
            }
        } catch { /* A tela pode ser mantida ativa manualmente. */ }
    }
    async function getRoute() {
        if (!running || !trip?.atualizado_em || routePending) return;
        routePending = true; retryRoute.disabled = true; lastRouteAttempt = Date.now();
        const current = generation;
        try {
            const route = await api("rota", "POST");
            if (!running || current !== generation) return;
            trip.rota = route; map.update(trip); navigation.update(trip);
            document.getElementById("routeStatus").textContent = "Rota até o endereço da entrega atualizada.";
        } catch (error) {
            if (current !== generation) return;
            document.getElementById("routeStatus").textContent = error.message;
            if ([401,410].includes(error.status)) { halt(); start.disabled = stop.disabled = true; map.hide(); status.textContent = error.message; }
        } finally { routePending = false; retryRoute.disabled = !running; }
    }
    async function publish() {
        if (!running || pending || document.hidden) return;
        pending = true;
        const current = generation;
        try {
            const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }));
            if (!running || current !== generation) return;
            const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude, precisao: position.coords.accuracy };
            await api("localizacao", "POST", coords);
            if (!running || current !== generation) return;
            trip = { ...trip, ...coords, heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null, velocidade_mps: Number.isFinite(position.coords.speed) && position.coords.speed>=0 ? position.coords.speed : null, precisao_m: coords.precisao, atualizado_em: new Date().toISOString() };
            status.textContent = `Viagem em andamento. GPS enviado às ${new Date().toLocaleTimeString("pt-BR")}. Precisão aproximada: ${Math.round(coords.precisao)} m.`;
            map.update(trip); navigation.update(trip);
            if (Date.now() - lastRouteAttempt > (trip.rota?.tipoOrigem === "GPS_ENTREGADOR" && !navigation.needsRoute() ? 300000 : 60000)) getRoute();
        } catch (error) {
            if (current !== generation) return;
            navigation.pause();
            status.textContent = error.code === 1 ? "Acesso ao GPS negado. Permita a localização nas configurações do navegador e tente iniciar novamente." : `GPS sem atualização: ${error.message || "não foi possível obter a posição"}.`;
            if ([401,410].includes(error.status)) { halt(); start.disabled = stop.disabled = true; map.hide(); }
            else if (error.code === 1) { halt(); start.disabled = false; }
        } finally { pending = false; }
    }
    start.addEventListener("click", async () => {
        if (!navigator.geolocation || !window.isSecureContext) { status.textContent = "Abra este link em HTTPS em um celular com GPS."; return; }
        start.disabled = true; status.textContent = "Preparando viagem...";
        const current = ++generation;
        try {
            trip = await api("viagem");
            if (current !== generation) return;
            running = true; stop.disabled = false; retryRoute.hidden = false;
            navigation.start();
            map.update({ ...trip, latitude: null, longitude: null });
            status.textContent = "Permita a localização para iniciar a viagem e mostrar o mapa.";
            keepScreenOn(); publish(); timer = setInterval(publish, 5000);
        } catch (error) { status.textContent = error.message; start.disabled = [401,410].includes(error.status); }
    });
    stop.addEventListener("click", async () => {
        halt(); stop.disabled = true; start.disabled = true; map.hide();
        status.textContent = "GPS parado neste aparelho. Encerrando o link...";
        try { await api("localizacao", "DELETE"); history.replaceState(null, "", location.pathname); status.textContent = "Compartilhamento encerrado. Para outra viagem, peça um novo link à loja."; }
        catch (error) {
            if ([401,410].includes(error.status)) status.textContent = "Link já encerrado ou expirado.";
            else { status.textContent = "GPS parado neste aparelho. Não foi possível encerrar o link no servidor; tente o botão novamente."; stop.disabled = false; }
        }
    });
    retryRoute.addEventListener("click", getRoute);
    document.addEventListener("visibilitychange", () => { if (running && !document.hidden) { keepScreenOn(); publish(); } });
    window.addEventListener("pagehide", halt);
    if (!/^[a-f0-9]{64}$/.test(token)) { start.disabled = true; status.textContent = "Link inválido. Peça à loja o link completo desta entrega."; }
})();
