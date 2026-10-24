"use strict";
(() => {
    const names = ["simulationScenario","simulationDescription","simulationStart","simulationPause","simulationStep","simulationReset","simulationAccess","simulationLogin","simulationStatus","simulationProgress","simulationFrame","simulationRemaining","simulationRecalculations","simulationView","simulationMotion","simulationLatency","simulationGap"];
    const el = Object.fromEntries(names.map(name => [name, document.getElementById(name)]));
    const catalog = window.PetFlowDeliveryScenarios;
    let authorized = false, running = false, preparing = false, ended = false, generation = 0, index = -1, timer = null, recalculation = null;
    let scenario, trip, engine, recalculations = 0, signalLost = false;
    const map = window.PetFlowDeliveryMap({mode:"driver",onViewChange(view){
        el.simulationView.textContent = view.following ? "Câmera acompanhando a posição simulada." : view.overview ? "Visão da rota completa." : "Mapa livre. Use a seta para voltar a acompanhar.";
    },onMotion(motion){
        if (el.simulationMotion) el.simulationMotion.textContent = motion.active
            ? `Animação: ${Math.round(motion.renderDelayMs)} de ${Math.round(motion.durationMs)} ms`
            : `Posição atualizada · desenho em ${Math.round(motion.renderDelayMs)} ms`;
        if (el.simulationLatency) el.simulationLatency.textContent = `Idade da leitura ao receber: ${Math.round(motion.receivedAgeMs)} ms`;
        if (el.simulationGap) el.simulationGap.textContent = `Diferença até a leitura recebida: ${motion.remainingMeters.toFixed(1)} m`;
    }});
    const navigation = window.PetFlowDeliveryNavigation({map,recalculate: recalculate});
    function controls() {
        el.simulationScenario.disabled = !authorized || preparing || running;
        el.simulationStart.disabled = !authorized || preparing || running;
        el.simulationPause.disabled = !running;
        el.simulationStep.disabled = !authorized || preparing || running || ended;
        el.simulationReset.disabled = !authorized || preparing;
    }
    function stopTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
    function schedule() {
        if (!running || ended || document.hidden) return;
        const current = generation, interval = scenario.frames[index+1]?.intervalMs ?? 1000;
        const delay = Number.isFinite(interval) ? Math.max(100, Math.min(5000, interval)) : 1000;
        timer = setTimeout(() => {
            if (current !== generation || !running || ended || document.hidden) return;
            timer = null;
            next(); schedule();
        },delay);
    }
    function reset() {
        generation++; stopTimer(); if (recalculation !== null) clearTimeout(recalculation); recalculation = null;
        running = ended = false; trip = null; index = -1; recalculations = 0; signalLost = false;
        scenario = catalog.create(el.simulationScenario.value); engine = window.PetFlowNavigationEngine.create(scenario.route);
        navigation.stop(); map.hide(); el.simulationDescription.textContent = scenario.description;
        el.simulationStart.textContent = "Executar percurso";
        el.simulationStatus.setAttribute("data-state","ready");
        el.simulationStatus.textContent = "Percurso preparado. Todos os pontos são artificiais.";
        el.simulationProgress.value = 0; el.simulationFrame.textContent = "Ponto —";
        el.simulationRemaining.textContent = "Distância restante —"; el.simulationRecalculations.textContent = "Recálculos: 0";
        if (el.simulationMotion) el.simulationMotion.textContent = "Movimento aguardando";
        if (el.simulationLatency) el.simulationLatency.textContent = "Recepção —";
        if (el.simulationGap) el.simulationGap.textContent = "Diferença visual —";
        controls();
    }
    async function validateAccess() {
        let token = ""; try { token = sessionStorage.getItem("token") || ""; } catch {}
        if (!token) throw new Error("Entre no painel administrativo para usar o simulador.");
        const response = await fetch("/api/auth/me", {cache:"no-store",headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
        const payload = await response.json();
        if (!response.ok || !["ADMIN","GERENTE"].includes(payload.data?.cargo || payload.data?.perfil)) throw new Error("Este simulador está disponível para administradores e gerentes.");
    }
    function report(result, frame) {
        el.simulationProgress.value = Math.round((index + 1) / scenario.frames.length * 100);
        el.simulationFrame.textContent = `Ponto ${index + 1} de ${scenario.frames.length}`;
        el.simulationRemaining.textContent = Number.isFinite(result?.remainingMeters) ? `Restam ${Math.round(result.remainingMeters)} m` : "Aguardando posição válida";
        const descriptions = {navigating:"Navegação em andamento",arrived:"Chegada reconhecida",stale:"Sinal interrompido",imprecise:"Posição imprecisa", "off-route":"Desvio detectado"};
        el.simulationStatus.textContent = `${descriptions[result?.state] || "Simulação em andamento"}${frame.label ? ` · ${frame.label}` : ""}`;
    }
    function renderPosition(frame) {
        const sampleAge = Number.isFinite(frame.sampleAgeMs) ? Math.max(0,Math.min(15000,frame.sampleAgeMs)) : 0;
        trip = {...trip,latitude:frame.latitude,longitude:frame.longitude,precisao_m:frame.precisao_m,heading:frame.heading,
            velocidade_mps:frame.velocidade_mps,atualizado_em:new Date(Date.now()-sampleAge).toISOString(),rota:trip?.rota || scenario.route,
            endereco_entrega:{endereco:"Destino do percurso simulado"}};
        signalLost = false; map.update(trip); navigation.update(trip);
        return engine.update(trip);
    }
    function next() {
        if (!authorized || preparing || ended || document.hidden) return;
        if (!scenario) reset();
        navigation.start();
        const frame = scenario.frames[++index];
        if (!frame) return finish();
        let result;
        if (frame.type === "position") result = renderPosition(frame);
        else {
            if (frame.type === "signal-loss") { signalLost = true; map.pauseMotion?.(); }
            // Sem nova leitura: conserva coordenadas e timestamp. O mesmo
            // motor da entrega identifica a perda de frescor pelo relógio.
            if (trip) { navigation.update(trip); result = engine.update(trip); }
            else result = {state:"stale"};
        }
        report(result,frame);
        if (index === scenario.frames.length - 1) finish(result);
    }
    function finish(result) {
        stopTimer(); running = false; ended = true;
        if (recalculation !== null) clearTimeout(recalculation); recalculation = null;
        navigation.stop();
        const success = result?.state === "arrived";
        el.simulationStatus.setAttribute("data-state",success ? "complete" : "error");
        el.simulationStatus.textContent = success ? "Percurso concluído: chegada reconhecida pela navegação." : "Falha no percurso: a navegação não reconheceu a chegada.";
        el.simulationStart.textContent = "Executar novamente"; controls();
    }
    function recalculate() {
        if (!trip || signalLost || ended || recalculation !== null || document.hidden) return;
        const current = generation;
        el.simulationStatus.textContent = "Recalculando o percurso simulado...";
        recalculation = setTimeout(() => {
            recalculation = null;
            if (current !== generation || !trip || signalLost || ended || document.hidden) return;
            trip.rota = scenario.reroute(trip); engine = window.PetFlowNavigationEngine.create(trip.rota);
            recalculations++; el.simulationRecalculations.textContent = `Recálculos: ${recalculations}`;
            map.update(trip); navigation.update(trip);
            el.simulationStatus.textContent = "Rota recalculada a partir da posição simulada atual.";
        },600);
    }
    function pause() {
        if ((!running && !preparing && !trip) || (ended && !preparing)) return;
        stopTimer(); running = preparing = false; generation++;
        if (recalculation !== null) clearTimeout(recalculation); recalculation = null;
        navigation.stop(); el.simulationStart.textContent = ended ? "Executar novamente" : "Continuar percurso";
        el.simulationStatus.textContent = "Simulação pausada."; controls();
    }
    el.simulationStart.addEventListener("click",async () => {
        if (!authorized || running || preparing || document.hidden) return;
        preparing = true; controls(); const current = generation;
        try {
            await validateAccess(); if (current !== generation || document.hidden) return;
            preparing = false;
            if (ended) reset();
            running = true; controls(); next();
            if (!ended) schedule();
        } catch (error) {
            if (current !== generation) return;
            authorized = false; navigation.stop(); map.hide(); el.simulationAccess.textContent = error.message; el.simulationLogin.hidden = false;
        } finally { if (current === generation) { preparing = false; controls(); } }
    });
    el.simulationPause.addEventListener("click",pause);
    el.simulationStep.addEventListener("click",() => { if (!running) { next(); controls(); } });
    el.simulationReset.addEventListener("click",reset);
    el.simulationScenario.addEventListener("change",reset);
    document.addEventListener("visibilitychange",() => { if (document.hidden) pause(); else if (!authorized && !preparing) initialAccess(); });
    window.addEventListener("pagehide",() => { generation++; pause(); });
    window.addEventListener("pageshow",() => { if (!authorized && !preparing) initialAccess(); });
    for (const item of catalog.list()) { const option = document.createElement("option"); option.value = item.id; option.textContent = item.title; el.simulationScenario.appendChild(option); }
    async function initialAccess() {
        if (authorized || preparing) return;
        const current = generation; preparing = true; controls();
        try {
            await validateAccess(); if (current !== generation) return;
            authorized = true; preparing = false; el.simulationLogin.hidden = true;
            el.simulationAccess.textContent = "Acesso confirmado. Esta simulação não usa o GPS do aparelho."; reset();
        } catch (error) {
            if (current !== generation) return;
            el.simulationAccess.textContent = error.message; el.simulationLogin.hidden = false;
        } finally { if (current === generation) { preparing = false; controls(); } }
    }
    initialAccess();
})();
