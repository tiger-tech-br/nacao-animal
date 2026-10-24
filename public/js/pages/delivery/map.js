"use strict";
(() => {
    let loading, authenticationError;
    const authenticationListeners = new Set();
    function loadMaps() {
        if (authenticationError) return Promise.reject(authenticationError);
        if (!loading) loading = (async () => {
            const response = await fetch("/api/public/entregas/mapa-config", { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok || !payload.data?.browserKey) throw new Error("O mapa ainda não foi configurado pela loja. O GPS pode continuar compartilhando a posição.");
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("O Google Maps demorou para carregar. Atualize a página para tentar novamente.")), 20000);
                window.petflowMapsReady = () => { clearTimeout(timer); resolve(); };
                window.gm_authFailure = () => {
                    clearTimeout(timer);
                    authenticationError = new Error("O Google recusou o mapa. A loja precisa conferir a chave do navegador, o domínio e a Maps JavaScript API.");
                    // O Google pode recusar a chave depois de já chamar o callback de carga.
                    authenticationListeners.forEach(notify => notify(authenticationError));
                    reject(authenticationError);
                };
                const script = document.createElement("script");
                const params = new URLSearchParams({ key: payload.data.browserKey, loading: "async", libraries: "geometry", callback: "petflowMapsReady", language: "pt-BR", v: "weekly" });
                script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
                script.referrerPolicy = "strict-origin-when-cross-origin";
                script.onerror = () => { clearTimeout(timer); reject(new Error("Não foi possível carregar o Google Maps. Confira sua conexão.")); };
                document.head.appendChild(script);
            });
        })();
        return loading;
    }
    function positionMarker(map, navigation) {
        // Ícone com tamanho fixo em pixels, ancorado às coordenadas reais recebidas.
        class PositionMarker extends google.maps.OverlayView {
            constructor() { super(); this.position = null; this.heading = null; this.setMap(map); }
            onAdd() {
                this.element = document.createElement("div");
                this.element.className = navigation ? "delivery-driver-marker" : "delivery-vehicle-marker";
                this.element.setAttribute("role", "img");
                this.element.setAttribute("aria-label", "Última posição do entregador");
                this.element.title = navigation ? "Sua posição GPS" : "Entregador";
                this.icon = document.createElement("img");
                this.icon.src = navigation ? "/images/icons/delivery-arrow.svg" : "/images/icons/delivery-car.svg";
                this.icon.alt = ""; this.icon.width = this.icon.height = navigation ? 44 : 64;
                this.element.appendChild(this.icon);
                if (navigation) this.setHeading(this.heading);
                this.getPanes().overlayMouseTarget.appendChild(this.element);
                this.draw();
            }
            draw() {
                if (!this.element) return;
                const projection = this.getProjection();
                const point = this.position && projection?.fromLatLngToDivPixel(new google.maps.LatLng(this.position));
                this.element.hidden = !point;
                if (point) { this.element.style.left = `${point.x}px`; this.element.style.top = `${point.y}px`; }
            }
            setPosition(position) { this.position = position; this.draw(); }
            setHeading(heading) {
                this.heading = heading;
                if (!navigation || !this.icon) return;
                this.icon.hidden = false;
                this.icon.style.transform = `rotate(${heading ?? 0}deg)`;
            }
            onRemove() { this.element?.remove(); this.element = null; }
        }
        return new PositionMarker();
    }
    function movementHeading(previous, current, precision) {
        if (!previous) return null;
        const radians = value => value * Math.PI / 180;
        const lat1 = radians(previous.lat), lat2 = radians(current.lat), delta = radians(current.lng - previous.lng);
        const a = Math.sin((lat2-lat1)/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(delta/2)**2;
        const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0,1-a)));
        if (distance < Math.max(5, Number(previous.precision) || 0, Number(precision) || 0)) return null;
        return (Math.atan2(Math.sin(delta)*Math.cos(lat2), Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta)) * 180 / Math.PI + 360) % 360;
    }
    function mapPosition(data) {
        const number = value => typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
        const lat = number(data?.latitude), lng = number(data?.longitude);
        return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null;
    }
    function metersBetween(a, b) {
        if (!a || !b) return 0;
        const rad = Math.PI / 180, dlat = (b.lat-a.lat)*rad, dlng = (b.lng-a.lng)*rad;
        const value = Math.sin(dlat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
        return 12742000 * Math.asin(Math.sqrt(Math.min(1, value)));
    }
    const angleBetween = (from, to) => ((to-from+540)%360)-180;
    const normalizedAngle = value => (value%360+360)%360;
    window.PetFlowDeliveryMap = function ({ mode = "tracking", onStatus, onViewChange, onMotion } = {}) {
        const navigation = mode === "driver";
        const element = document.getElementById("deliveryMap"), message = document.getElementById("mapStatus");
        const recenter = document.getElementById(navigation ? "recenterMap" : "centerTrackingMap");
        const showRoute = navigation ? document.getElementById("showFullRoute") : null;
        let map, driver, origin, destination, route, accuracy, lastPolyline, lastDestination, routeBounds, version = 0;
        let alternateRoutes = [], alternativeKey;
        let currentPosition, currentDestination, headingOrigin, heading = null, following = true, overview = !navigation, manualView = false;
        let lastStatus, lastStatusState;
        // Apenas a apresentação interpola. Motor, chegada e compartilhamento
        // continuam recebendo exclusivamente as leituras originais do aparelho.
        let visualPosition, visualHeading = null, targetPosition, targetTime = null;
        let motionFrame = null, motionEpoch = 0, motionPaused = false, snapNext = true;
        let lastMotionTime = null, lastReceiptAt = null, receivedAge = 0, duration = 0, renderDelay = 0;
        let motionReason = "first-fix", sensorInterval = 0, receiptInterval = 0;
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        const motionClock = () => window.performance?.now?.() ?? Date.now();
        function motionNotice(active = false, phase = "frame") {
            onMotion?.({ active, phase, reason: motionReason, sensorIntervalMs: sensorInterval, receiptIntervalMs: receiptInterval,
                sampleAgeMs: targetTime === null ? 0 : Math.max(0, Date.now()-targetTime),
                receivedAgeMs: receivedAge, durationMs: duration, renderDelayMs: renderDelay,
                remainingMeters: metersBetween(visualPosition, targetPosition) });
        }
        function cancelMotion() {
            motionEpoch++;
            if (motionFrame !== null) window.cancelAnimationFrame?.(motionFrame);
            motionFrame = null;
        }
        function pauseMotion() {
            const wasPaused = motionPaused;
            cancelMotion(); motionPaused = true; snapNext = true;
            if (!wasPaused) { motionReason = "paused"; motionNotice(false, "paused"); }
        }
        function drawPosition(position, direction) {
            visualPosition = { ...position }; visualHeading = direction;
            // Marcador, círculo e câmera usam exatamente o mesmo ponto visual.
            if (following) map.setCenter(visualPosition);
            driver.setPosition(visualPosition); driver.setHeading(visualHeading);
            accuracy.setCenter(visualPosition);
        }
        function movePosition(position, direction, data, precision) {
            const rawTime = data.atualizado_em ? Date.parse(data.atualizado_em) : data.timestamp;
            const time = Number.isFinite(rawTime) ? rawTime : null;
            // Uma rota que terminou de carregar não constitui uma leitura GPS.
            if (time !== null && lastMotionTime !== null && time <= lastMotionTime) return;
            if (motionPaused && lastMotionTime !== null && (time === null || time <= lastMotionTime)) return;
            if (document.hidden) { pauseMotion(); return; }
            const receipt = motionClock(), previousTime = lastMotionTime, previousReceipt = lastReceiptAt;
            const previousTarget = targetPosition;
            const resuming = motionPaused;
            cancelMotion(); motionPaused = false;
            targetPosition = { ...position }; targetTime = time;
            lastMotionTime = time; lastReceiptAt = receipt;
            receivedAge = time === null ? 0 : Math.max(0, Date.now()-time);
            duration = renderDelay = 0;
            const interval = receiptInterval = previousReceipt === null ? 0 : Math.max(0, receipt-previousReceipt);
            const sampleInterval = sensorInterval = previousTime === null || time === null ? 0 : time-previousTime;
            const distance = metersBetween(visualPosition, position);
            const usable = precision !== null && time !== null && Date.now()-time <= 3000 && time-Date.now() <= 5000;
            // Uma velocidade zero isolada não invalida o deslocamento observado.
            // GPS real pode atualizar mais devagar que os pontos do simulador.
            motionReason = !visualPosition ? "first-fix" : resuming ? "resume"
                : !window.requestAnimationFrame || !window.cancelAnimationFrame ? "unsupported"
                : reducedMotion?.matches ? "reduced-motion" : precision === null ? "imprecise"
                : time === null ? "no-timestamp" : !usable ? "old-fix"
                : snapNext ? "resume" : sampleInterval <= 0 || sampleInterval > 5000 ? "sample-gap"
                : interval <= 0 || interval > 5000 ? "receipt-gap" : distance > 120 ? "large-jump"
                : distance < .005 && Math.abs(angleBetween(visualHeading ?? 0, direction ?? 0)) < .01 ? "stationary" : "animated";
            snapNext = !usable;
            if (motionReason !== "animated") { drawPosition(position, direction); motionNotice(false, "sample"); return; }
            const speed = Math.max(Number.isFinite(data.velocidade_mps) ? data.velocidade_mps : 0,
                metersBetween(previousTarget, position) / (sampleInterval/1000));
            // Resposta curta também ao caminhar: até 160 ms após receber o fix.
            // Em velocidade alta, reduz o atraso visual para um orçamento de ~4 m.
            // Nunca avança além da última coordenada nem enfileira panTo.
            duration = Math.min(160, interval*.65, speed > .1 ? 4000/speed : 160);
            if (duration < 30) { duration = 0; motionReason = "fast-catch-up"; drawPosition(position, direction); motionNotice(false, "sample"); return; }
            const from = { ...visualPosition }, fromHeading = visualHeading ?? direction ?? 0;
            const toHeading = direction ?? fromHeading, turn = angleBetween(fromHeading, toHeading);
            let longitudeDelta = position.lng-from.lng;
            if (longitudeDelta > 180) longitudeDelta -= 360;
            if (longitudeDelta < -180) longitudeDelta += 360;
            const epoch = motionEpoch, started = motionClock();
            function frame() {
                if (epoch !== motionEpoch) return;
                if (document.hidden || element.hidden || motionPaused) { pauseMotion(); return; }
                renderDelay = Math.max(0, motionClock()-started);
                const progress = Math.min(1, renderDelay/duration);
                let longitude = from.lng+longitudeDelta*progress;
                if (longitude > 180) longitude -= 360;
                if (longitude < -180) longitude += 360;
                const point = progress === 1 ? position : {lat:from.lat+(position.lat-from.lat)*progress,lng:longitude};
                drawPosition(point, progress === 1 ? direction : normalizedAngle(fromHeading+turn*progress));
                motionFrame = null;
                motionNotice(progress < 1);
                if (progress < 1) motionFrame = window.requestAnimationFrame(frame);
            }
            motionNotice(true, "sample");
            motionFrame = window.requestAnimationFrame(frame);
        }
        document.addEventListener?.("visibilitychange", () => { if (document.hidden) pauseMotion(); });
        window.addEventListener?.("pagehide", pauseMotion);
        function announceView() {
            if (recenter) {
                recenter.setAttribute("aria-pressed", String(following));
                recenter.title = navigation
                    ? (following ? "Acompanhando minha localização" : "Seguir minha localização")
                    : (following ? "Acompanhando entregador e destino" : "Centralizar entregador e destino");
                recenter.setAttribute("aria-label", recenter.title);
            }
            if (showRoute) {
                showRoute.setAttribute("aria-pressed", String(overview));
                showRoute.title = overview ? "Exibindo rota completa" : "Mostrar rota completa";
                showRoute.setAttribute("aria-label", showRoute.title);
            }
            onViewChange?.({ following, overview });
        }
        function setStatus(text, state = "ready") {
            if (text === lastStatus && state === lastStatusState) return;
            lastStatus = text; lastStatusState = state;
            message.textContent = text;
            onStatus?.({ message: text, state });
        }
        authenticationListeners.add(error => {
            pauseMotion();
            version++; element.hidden = true;
            if (recenter) recenter.hidden = true;
            if (showRoute) showRoute.hidden = true;
            setStatus(error.message, "error");
        });
        function resizeMarkers() {
            if (!map || !currentPosition) return;
            const metersPerPixel = 156543.03392 * Math.cos(currentPosition.lat * Math.PI / 180) / 2 ** map.getZoom();
            destination.setRadius(metersPerPixel * 9);
            origin?.setRadius(metersPerPixel * 7);
        }
        function followPosition(force = false) {
            if (!map || !currentPosition || element.hidden) return false;
            if (navigation && manualView && !force) return false;
            manualView = false;
            following = true; overview = false;
            if (!navigation && currentDestination) {
                const bounds = new google.maps.LatLngBounds(); bounds.extend(currentPosition); bounds.extend(currentDestination);
                map.fitBounds(bounds, { top: 72, right: 42, bottom: 190, left: 42 });
            } else { map.setZoom(17); map.setCenter(visualPosition || currentPosition); }
            announceView();
            return true;
        }
        function fullBounds() {
            const bounds = new google.maps.LatLngBounds();
            bounds.union(routeBounds);
            if (currentPosition) bounds.extend(currentPosition);
            return bounds;
        }
        recenter?.addEventListener("click", () => followPosition(true));
        showRoute?.addEventListener("click", () => {
            if (!map || !routeBounds || element.hidden) return;
            manualView = true; following = false; overview = true; map.fitBounds(fullBounds(), 40);
            announceView();
        });
        announceView();
        return {
            follow: followPosition,
            pauseMotion,
            hide() { pauseMotion(); alternateRoutes.forEach(line=>line.setMap?.(null)); alternateRoutes=[];alternativeKey=undefined; version++; element.hidden = true; setStatus(""); headingOrigin = null; heading = null; visualPosition = targetPosition = undefined; visualHeading = null; lastMotionTime = targetTime = lastReceiptAt = null; following = true; overview = !navigation; manualView = false; if (recenter) recenter.hidden = true; if (showRoute) showRoute.hidden = true; announceView(); },
            resize() {
                if (!map || element.hidden) return;
                google.maps.event?.trigger(map, "resize");
                if (!navigation) followPosition();
                else if (following) map.setCenter(visualPosition || currentPosition);
                else if (overview && routeBounds) map.fitBounds(fullBounds(), 40);
            },
            async update(data) {
                const current = ++version, address = data.endereco_entrega;
                const originElement = document.getElementById("originAddress");
                const destinationText = address ? [address.endereco,address.numero,address.complemento,address.bairro,address.cidade,address.estado,address.cep].filter(Boolean).join(", ") : "";
                document.getElementById("destinationAddress").textContent = destinationText ? `Destino: ${destinationText}` : "Endereço da entrega não disponível.";
                const locationProvided = data.latitude != null && data.longitude != null;
                const position = locationProvided ? mapPosition(data) : null;
                const hasPosition = Boolean(position);
                const endpoint = data.rota?.tipoOrigem === "GPS_ENTREGADOR" ? data.rota.destino : null;
                const destinationPosition = endpoint && mapPosition(endpoint);
                const hasDestination = Boolean(destinationPosition);
                const startpoint = data.rota?.origem;
                const startPosition = startpoint && mapPosition(startpoint);
                const hasRoute = Boolean(hasDestination && data.rota.polyline && startPosition);
                if (originElement) originElement.textContent = hasPosition ? (hasRoute ? "Partida da rota: posição GPS usada no último cálculo." : "Localização do entregador: última posição GPS recebida.") : "Aguardando a localização do entregador.";
                if (!hasPosition) {
                    pauseMotion();
                    element.hidden = true; if (recenter) recenter.hidden = true; if (showRoute) showRoute.hidden = true;
                    setStatus(locationProvided ? "A localização recebida não é válida. Aguarde uma nova posição GPS." : "Aguardando o entregador compartilhar o GPS para mostrar o mapa.", locationProvided ? "error" : "waiting");
                    return;
                }
                try {
                    if (!map) setStatus("Carregando mapa...", "loading");
                    await loadMaps();
                    if (current !== version) return;
                    element.hidden = false;
                    currentPosition = position;
                    if (!map) {
                        map = new google.maps.Map(element, { center: currentPosition, zoom: navigation ? 17 : 16, streetViewControl: false, mapTypeControl: false,
                            ...(navigation ? { styles: [{elementType:"geometry",stylers:[{color:"#20384c"}]},{elementType:"labels.text.fill",stylers:[{color:"#bbc9d7"}]},{elementType:"labels.text.stroke",stylers:[{color:"#20384c"}]},{featureType:"road",elementType:"geometry",stylers:[{color:"#587187"}]},{featureType:"water",elementType:"geometry",stylers:[{color:"#10283b"}]}] } : {}) });
                        accuracy = new google.maps.Circle({ map, strokeOpacity: 0, fillColor: navigation ? "#2464d9" : "#00897b", fillOpacity: .1 });
                        driver = positionMarker(map, navigation);
                        destination = new google.maps.Circle({ map, radius: 14, fillColor: "#e97814", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3, zIndex: 2 });
                        origin = new google.maps.Circle({ map, radius: 12, fillColor: "#16834b", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3, zIndex: 2 });
                        route = new google.maps.Polyline({ map, strokeColor: navigation ? "#00d7f2" : "#2464d9", strokeOpacity: 1, strokeWeight: navigation ? 7 : 6, zIndex: 3 });
                        map.addListener("zoom_changed", resizeMarkers);
                        map.addListener("dragstart", () => { manualView = true; following = false; overview = false; announceView(); });
                    }
                    if (navigation) {
                        const precision = Number.isFinite(data.precisao_m) && data.precisao_m >= 0 && data.precisao_m <= 50 ? data.precisao_m : null;
                        const fixTime = data.atualizado_em ? Date.parse(data.atualizado_em) : data.timestamp;
                        const freshDirection = !Number.isFinite(fixTime) || Date.now()-fixTime <= 15000 && fixTime-Date.now() <= 5000;
                        const nativeHeading = Number.isFinite(data.heading) && data.heading >= 0 && data.heading < 360 ? data.heading : null;
                        const nextHeading = freshDirection ? nativeHeading ?? (precision !== null ? movementHeading(headingOrigin, position, precision) : null) : null;
                        if (nextHeading !== null) heading = nextHeading;
                        // Sem rumo nativo, conserva a referência até o movimento
                        // observado superar a precisão; passos curtos também contam.
                        if (precision !== null && freshDirection && (!headingOrigin || nextHeading !== null)) headingOrigin = { ...position, precision };
                        movePosition(position, heading, data, precision);
                    }
                    if (recenter) recenter.hidden = false;
                    if (!navigation) { driver.setPosition(position); accuracy.setCenter(position); }
                    accuracy.setRadius(hasPosition ? Math.max(0, Number(data.precisao_m) || 0) : 0);
                    destination.setVisible(hasDestination);
                    currentDestination = destinationPosition;
                    if (hasDestination) destination.setCenter(destinationPosition);
                    origin.setVisible(hasRoute);
                    if (hasRoute) origin.setCenter(startPosition);
                    else { route.setPath([]); lastPolyline = null; routeBounds = null; }
                    if (showRoute) showRoute.hidden = !hasRoute;
                    resizeMarkers();
                    const routeChanged = hasRoute && lastPolyline !== data.rota.polyline;
                    if (routeChanged) {
                        const path = google.maps.geometry.encoding.decodePath(data.rota.polyline);
                        route.setPath(path);
                        lastPolyline = data.rota.polyline;
                    }
                    const alternatives = navigation && hasRoute && Array.isArray(data.rota.alternativas) ? data.rota.alternativas.filter(option=>option.id!==data.rota.id && option.modo===data.rota.modo && typeof option.polyline==="string") : [];
                    const nextAlternativeKey = hasRoute ? `${data.rota.calculadaEm || ""}|${data.rota.id || ""}|${data.rota.modo || ""}|${alternatives.length}` : "";
                    const alternativesChanged = nextAlternativeKey!==alternativeKey;
                    if (alternativesChanged) {
                        alternateRoutes.forEach(line=>line.setMap?.(null)); alternateRoutes=[];alternativeKey=nextAlternativeKey;
                        for (const option of alternatives) {
                            try {
                                const path=google.maps.geometry.encoding.decodePath(option.polyline);
                                alternateRoutes.push(new google.maps.Polyline({map,path,strokeColor:"#8fa5b1",strokeOpacity:.65,strokeWeight:5,zIndex:1,clickable:false}));
                            } catch { /* Uma alternativa inválida não remove o trajeto escolhido. */ }
                        }
                    }
                    if (hasRoute && (routeChanged || alternativesChanged || !routeBounds)) {
                        routeBounds = new google.maps.LatLngBounds();
                        route.getPath().forEach(point => routeBounds.extend(point));
                        routeBounds.extend(startPosition);
                        routeBounds.extend(destinationPosition);
                        alternateRoutes.forEach(line=>line.getPath().forEach(point=>routeBounds.extend(point)));
                    }
                    if (hasRoute && navigation && overview && (routeChanged || alternativesChanged || !map.getBounds()?.contains(position))) {
                        map.fitBounds(fullBounds(), 40);
                    }
                    if (!navigation && hasDestination && (following || lastDestination !== JSON.stringify(destinationPosition))) {
                        followPosition(); lastDestination = JSON.stringify(destinationPosition);
                    }
                    const routeWarnings=Array.isArray(data.rota?.avisos) ? data.rota.avisos.filter(value=>typeof value==="string").join(" ") : "";
                    setStatus((navigation
                        ? `Seta azul: sua posição GPS · Verde: partida da rota · Laranja: destino. ${hasRoute ? "Siga a linha azul da rota." : "Aguardando a rota até o destino."} ${heading === null ? "Aguardando a primeira direção do GPS; a seta está voltada para cima." : "Sem uma nova direção, a seta mantém a última direção conhecida."}`
                        : `Van: última posição recebida do entregador. ${hasRoute ? "Linha azul: trajeto da partida verde até o destino laranja." : (hasDestination ? "Ponto laranja: endereço da entrega. Aguardando o trajeto." : "Aguardando a localização do endereço da entrega.")}`) + (routeWarnings ? ` ${routeWarnings}` : ""));
                } catch (error) { if (current === version) { pauseMotion(); element.hidden = true; if (recenter) recenter.hidden = true; if (showRoute) showRoute.hidden = true; setStatus(error.message, "error"); } }
            }
        };
    };
})();
