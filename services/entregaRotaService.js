"use strict";
const { validateAddress } = require("./freteService");
const fail = (message, status = 503) => Object.assign(new Error(message), { status });
const validPoint = point => Number.isFinite(point?.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point?.longitude) && Math.abs(point.longitude) <= 180;

async function calcularRota(position, destination) {
    if (!validPoint(position)) throw fail("Compartilhe uma posição GPS válida antes de calcular a rota.", 409);
    const address = validateAddress(destination);
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    if (!key) throw fail("A loja ainda não configurou as rotas da entrega.");
    let response, payload;
    try {
        response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST", signal: AbortSignal.timeout(10000),
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
                "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.startLocation,routes.legs.steps.endLocation,routes.legs.steps.navigationInstruction" },
            body: JSON.stringify({ origin: { location: { latLng: { latitude: position.latitude, longitude: position.longitude } } },
                destination: { address: [address.endereco,address.numero,address.bairro,address.cidade,address.estado,address.cep,"Brasil"].join(", ") },
                travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", languageCode: "pt-BR", units: "METRIC" })
        });
        payload = await response.json();
    } catch { throw fail("Não foi possível consultar a rota. O GPS continua compartilhando a posição."); }
    const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
    const legs = Array.isArray(route?.legs) ? route.legs : [];
    const start = legs[0]?.startLocation?.latLng, end = legs.at(-1)?.endLocation?.latLng;
    const meters = route?.distanceMeters === undefined ? 0 : route.distanceMeters;
    if (!response.ok || typeof route?.polyline?.encodedPolyline !== "string" || !route.polyline.encodedPolyline ||
        !validPoint(start) || !validPoint(end) || !Number.isInteger(meters) || meters < 0) {
        throw fail("Rota indisponível. Confira o endereço da entrega e a configuração da Routes API.");
    }
    const rawSteps = legs.flatMap(leg => Array.isArray(leg?.steps) ? leg.steps : []);
    const steps = rawSteps.map(step => ({
        instrucao: typeof step.navigationInstruction?.instructions === "string" ? step.navigationInstruction.instructions : "",
        manobra: typeof step.navigationInstruction?.maneuver === "string" ? step.navigationInstruction.maneuver : "MANEUVER_UNSPECIFIED",
        distanciaMetros: step.distanceMeters, duracao: step.staticDuration,
        polyline: step.polyline?.encodedPolyline,
        origem: step.startLocation?.latLng, destino: step.endLocation?.latLng
    }));
    return { tipoOrigem: "GPS_ENTREGADOR", polyline: route.polyline.encodedPolyline, origem: start, destino: end, distanciaMetros: meters, duracao: route.duration, etapas: steps, calculadaEm: new Date().toISOString() };
}
module.exports = { calcularRota };
