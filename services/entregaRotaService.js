"use strict";
const fail = (message, status = 503) => Object.assign(new Error(message), { status });
const validPoint = point => Number.isFinite(point?.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point?.longitude) && Math.abs(point.longitude) <= 180;
const STEP_MODES = ["DRIVE", "WALK", "BICYCLE", "TWO_WHEELER", "TRANSIT"];
const DELIVERY_PROFILES = Object.freeze({ CARRO: "DRIVE", MOTO: "TWO_WHEELER", BICICLETA: "BICYCLE", A_PE: "WALK" });
const PROFILE_WARNINGS = Object.freeze({
    WALK: "As rotas a pé estão em versão beta e podem não incluir caminhos ou calçadas. Confira o trajeto e as condições locais.",
    BICYCLE: "As rotas de bicicleta estão em versão beta e podem não incluir calçadas, caminhos para pedestres ou ciclovias. Confira o trajeto e as condições locais.",
    TWO_WHEELER: "As rotas de moto estão em versão beta e podem não incluir calçadas, caminhos para pedestres ou ciclovias. Confira o trajeto e as condições locais."
});
const text = (value, limit = 300) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const point = value => ({ latitude: value.latitude, longitude: value.longitude });
const { decode, distance } = require("../public/js/pages/delivery/navigation-engine");
function transitStep(raw) {
    const details = raw?.transitDetails;
    if (!details || typeof details !== "object") return null;
    const result = {
        linha: text(details.transitLine?.nameShort) || text(details.transitLine?.name),
        embarque: text(details.stopDetails?.departureStop?.name),
        desembarque: text(details.stopDetails?.arrivalStop?.name),
        letreiro: text(details.headsign),
        veiculo: text(details.transitLine?.vehicle?.type, 60)
    };
    for (const [name, value] of [["partida", details.stopDetails?.departureTime], ["chegada", details.stopDetails?.arrivalTime]]) {
        if (typeof value === "string" && Number.isFinite(Date.parse(value))) result[name] = new Date(value).toISOString();
    }
    return result;
}
function stepInstruction(raw, transit, mode) {
    const instruction = text(raw.navigationInstruction?.instructions, 1200);
    if (instruction) return instruction;
    if (!transit) return mode === "WALK" ? "Siga a pé pelo trecho indicado." : "";
    return [transit.linha ? `Embarque na linha ${transit.linha}` : "Use o transporte público indicado",
        transit.embarque ? `em ${transit.embarque}` : "", transit.desembarque ? `e desça em ${transit.desembarque}` : ""].filter(Boolean).join(" ") + ".";
}
function stepPath(step) {
    try { return decode(step.polyline); } catch { return null; }
}
function collapsedWalkAnchor(step) {
    if (step.modo !== "WALK") return null;
    const path = stepPath(step);
    if (!path?.length || path.some(item => distance(path[0], item) > .01) ||
        !validPoint(step.origem) || !validPoint(step.destino) ||
        distance(step.origem, step.destino) > 2 || distance(path[0], step.origem) > 2 || distance(path[0], step.destino) > 2 ||
        step.distanciaMetros !== undefined && (!Number.isFinite(step.distanciaMetros) || step.distanciaMetros < 0 || step.distanciaMetros > 25)) return null;
    return path[0];
}
function seconds(value) { return typeof value === "string" && /^\d+(?:\.\d+)?s$/.test(value) ? Number.parseFloat(value) : null; }
function mergeWalkEvents(target, events, before) {
    const result = { ...target };
    const descriptions = events.map(item => item.instrucao).filter(Boolean);
    result.instrucao = (before ? [...descriptions, target.instrucao] : [target.instrucao, ...descriptions]).filter(Boolean).join(" ");
    const metadata = events.map(({ instrucao, manobra, modo, distanciaMetros, duracao, transporte }) =>
        ({ instrucao, manobra, modo: modo || "WALK", distanciaMetros, duracao, ...(transporte ? { transporte } : {}) }));
    result.eventos = before ? [...metadata, ...(target.eventos || [])] : [...(target.eventos || []), ...metadata];
    if (Number.isFinite(target.distanciaMetros) && target.distanciaMetros >= 0)
        result.distanciaMetros += events.reduce((sum, item) => sum + (item.distanciaMetros || 0), 0);
    const baseSeconds = seconds(target.duracao), extraSeconds = events.map(item => item.duracao === undefined ? 0 : seconds(item.duracao));
    if (baseSeconds !== null && extraSeconds.every(value => value !== null))
        result.duracao = `${Number((baseSeconds + extraSeconds.reduce((sum, value) => sum + value, 0)).toFixed(9))}s`;
    else if (extraSeconds.some(value => value === null)) result.duracao = undefined;
    return result;
}
function normalizeWalkEvents(steps, destination) {
    const normalized = [];
    let pending = [];
    for (const original of steps) {
        const anchor = collapsedWalkAnchor(original);
        if (anchor) { pending.push({ step: original, anchor }); continue; }
        let step = original;
        if (pending.length) {
            const path = stepPath(step), start = path?.[0];
            const navigable = Boolean(step.instrucao) && path?.length >= 2 && path.some(item => distance(start, item) > 0);
            if (navigable && pending.every(event => distance(event.anchor, start) <= 2))
                step = mergeWalkEvents(step, pending.map(event => event.step), true);
            else normalized.push(...pending.map(event => event.step));
            pending = [];
        }
        normalized.push(step);
    }
    if (pending.length) {
        const last = normalized.at(-1), path = last && stepPath(last), end = path?.at(-1);
        if (end && last.instrucao && path.length >= 2 && path.some(item => distance(path[0], item) > 0) &&
            pending.every(event => distance(event.anchor, end) <= 2 && distance(event.anchor, destination) <= 2))
            normalized[normalized.length-1] = mergeWalkEvents(last, pending.map(event => event.step), false);
        else normalized.push(...pending.map(event => event.step));
    }
    return normalized;
}
function normalizarRota(route, index, calculadaEm, profile) {
    const legs = Array.isArray(route?.legs) ? route.legs : [];
    const start = legs[0]?.startLocation?.latLng, end = legs.at(-1)?.endLocation?.latLng;
    const meters = route?.distanceMeters === undefined ? 0 : route.distanceMeters;
    if (typeof route?.polyline?.encodedPolyline !== "string" || !route.polyline.encodedPolyline ||
        !validPoint(start) || !validPoint(end) || !Number.isInteger(meters) || meters < 0) return null;
    const rawSteps = legs.flatMap(leg => Array.isArray(leg?.steps) ? leg.steps : []);
    const steps = rawSteps.map(step => {
        const transporte = transitStep(step);
        const maneuver = text(step.navigationInstruction?.maneuver, 80) || "MANEUVER_UNSPECIFIED";
        // A API pode omitir travelMode nas etapas de uma rota a pé. Esse
        // padrão vem do perfil escolhido pelo servidor, nunca do GPS recebido.
        const mode = STEP_MODES.includes(step.travelMode) ? step.travelMode
            : step.travelMode === undefined && profile === "WALK" ? "WALK" : undefined;
        return {
            instrucao: stepInstruction(step, transporte, mode),
            manobra: maneuver.replace(/^UTURN_/, "U_TURN_"),
            distanciaMetros: step.distanceMeters, duracao: step.staticDuration,
            polyline: step.polyline?.encodedPolyline,
            origem: validPoint(step.startLocation?.latLng) ? point(step.startLocation.latLng) : undefined,
            destino: validPoint(step.endLocation?.latLng) ? point(step.endLocation.latLng) : undefined,
            ...(mode ? { modo: mode } : {}),
            ...(transporte ? { transporte } : {})
        };
    });
    // Alguns passos a pé são eventos de acesso/transferência na mesma âncora:
    // a API pode retornar um único vértice, inclusive com metros positivos.
    // Conserva as instruções e métricas junto da próxima etapa conectada;
    // nunca fabrica um segmento para fazer o motor aceitar geometria ausente.
    const etapas = normalizeWalkEvents(steps, end);
    const labels = Array.isArray(route.routeLabels) ? route.routeLabels : [];
    const principal = labels.includes("DEFAULT_ROUTE") || index === 0 && !labels.includes("DEFAULT_ROUTE_ALTERNATE");
    const avisos = (Array.isArray(route.warnings) ? route.warnings : []).map(value => text(value, 600)).filter(Boolean).slice(0, 10);
    const profileWarning = PROFILE_WARNINGS[profile];
    if (profileWarning && !avisos.includes(profileWarning)) avisos.unshift(profileWarning);
    return {
        id: `rota-${index}`, modo: profile, principal,
        resumo: text(route.description) || (principal ? "Rota principal" : `Alternativa ${index}`),
        tipoOrigem: "GPS_ENTREGADOR", polyline: route.polyline.encodedPolyline,
        origem: point(start), destino: point(end), distanciaMetros: meters,
        duracao: route.duration, etapas, avisos, calculadaEm
    };
}

async function calcularRotaComPerfil(position, destination, profile) {
    if (!validPoint(position)) throw fail("Compartilhe uma posição GPS válida antes de calcular a rota.", 409);
    const { validateAddress } = require("./freteService");
    const address = validateAddress(destination);
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    if (!key) throw fail("A loja ainda não configurou as rotas da entrega.");
    let response, payload;
    try {
        response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST", signal: AbortSignal.timeout(10000),
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
                "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.description,routes.routeLabels,routes.warnings,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.startLocation,routes.legs.steps.endLocation,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode" },
            body: JSON.stringify({ origin: { location: { latLng: { latitude: position.latitude, longitude: position.longitude } } },
                destination: { address: [address.endereco,address.numero,address.bairro,address.cidade,address.estado,address.cep,"Brasil"].join(", ") },
                travelMode: profile, computeAlternativeRoutes: true, polylineQuality: "HIGH_QUALITY",
                ...(["DRIVE", "TWO_WHEELER"].includes(profile) ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
                languageCode: "pt-BR", units: "METRIC" })
        });
        payload = await response.json();
    } catch { throw fail("Não foi possível consultar a rota. O GPS continua compartilhando a posição."); }
    if (!response.ok) throw fail("Rota indisponível. Confira o endereço e a configuração da Routes API.");
    const calculadaEm = new Date().toISOString();
    // A API fornece no máximo a principal e três alternativas. Não inventa
    // trajetos nem retorna conteúdo inválido de uma alternativa malformada.
    const rawRoutes = (Array.isArray(payload?.routes) ? payload.routes : []).slice(0, 4);
    const alternativas = rawRoutes
        .map((route, index) => normalizarRota(route, index, calculadaEm, profile)).filter(Boolean);
    if (!alternativas.length) throw fail("Rota indisponível. Confira o endereço e a configuração da Routes API.");
    const defaultIndex = rawRoutes.findIndex(route => Array.isArray(route?.routeLabels) && route.routeLabels.includes("DEFAULT_ROUTE"));
    const selected = alternativas.find(route => route.id === `rota-${defaultIndex}`) || alternativas[0];
    for (const alternative of alternativas) alternative.principal = alternative === selected;
    alternativas.sort((a,b) => Number(b.principal)-Number(a.principal));
    return { ...selected, alternativas };
}
// Chamadas separadas mantêm a escolha do perfil sob controle do servidor.
// A entrega recebe o valor do cadastro autenticado, nunca do GPS do navegador.
const calcularRota = (position, destination) => calcularRotaComPerfil(position, destination, "DRIVE");
const calcularRotaDiagnostico = (position, destination) => calcularRotaComPerfil(position, destination, "WALK");
async function calcularRotaEntrega(position, destination, meioTransporte) {
    if (typeof meioTransporte !== "string" || !Object.hasOwn(DELIVERY_PROFILES, meioTransporte))
        throw fail("O meio de transporte do entregador é inválido.", 400);
    return calcularRotaComPerfil(position, destination, DELIVERY_PROFILES[meioTransporte]);
}
module.exports = { calcularRota, calcularRotaDiagnostico, calcularRotaEntrega };
