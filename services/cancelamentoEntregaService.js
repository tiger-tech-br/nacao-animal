"use strict";

const DEFAULT_MIN_DISTANCE_METERS = 1000;
const GPS_MAX_AGE_MS = 30000;
const GPS_MAX_ACCURACY_METERS = 250;
const AUTOMATIC_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function minimumDistance() {
    const configured = Number(process.env.CANCELLATION_MIN_DISTANCE_METERS);
    return Number.isFinite(configured) && configured >= 100 && configured <= 10000
        ? Math.round(configured)
        : DEFAULT_MIN_DISTANCE_METERS;
}

function avaliarCancelamento(order, now = Date.now()) {
    const status = String(order?.status || "");
    const purchasedAt = new Date(order?.data_venda || order?.created_at || 0).getTime();

    if (!Number.isFinite(purchasedAt) || purchasedAt <= 0 || now - purchasedAt > AUTOMATIC_CANCELLATION_WINDOW_MS) {
        return {
            permitido: false,
            etapa: "PRAZO_EXPIRADO",
            distanciaMetros: null,
            mensagem: "O prazo de 24 horas para cancelamento e estorno automáticos terminou. Envie uma solicitação de atendimento."
        };
    }

    if (["PENDENTE", "AGUARDANDO_PAGAMENTO", "PAGAMENTO_APROVADO", "EM_SEPARACAO"].includes(status)) {
        return { permitido: true, etapa: "ANTES_DA_SAIDA", distanciaMetros: null,
            mensagem: "O pedido ainda não saiu da loja." };
    }
    if (status !== "SAIU_PARA_ENTREGA") {
        return { permitido: false, etapa: "INDISPONIVEL", distanciaMetros: null,
            mensagem: "O cancelamento automático não está disponível nesta etapa." };
    }

    const latitude = Number(order.latitude);
    const longitude = Number(order.longitude);
    const accuracy = Number(order.precisao_m);
    const updatedAt = new Date(order.atualizado_em || 0).getTime();
    const destination = order.rota?.destino;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        !Number.isFinite(updatedAt) || now - updatedAt > GPS_MAX_AGE_MS ||
        !Number.isFinite(accuracy) || accuracy > GPS_MAX_ACCURACY_METERS ||
        !validPoint(destination)) {
        return { permitido: false, etapa: "GPS_INDISPONIVEL", distanciaMetros: null,
            mensagem: "Não foi possível confirmar uma distância segura pelo GPS. Envie uma solicitação de atendimento." };
    }

    const measured = haversineMeters({ latitude, longitude }, destination);
    const conservative = Math.max(0, measured - Math.max(0, accuracy));
    const threshold = minimumDistance();
    return {
        permitido: conservative > threshold,
        etapa: conservative > threshold ? "EM_ROTA_LONGE" : "PROXIMO_DESTINO",
        distanciaMetros: Math.round(measured),
        limiteMetros: threshold,
        mensagem: conservative > threshold
            ? `O entregador ainda está a mais de ${formatDistance(threshold)} do destino.`
            : `O entregador já está próximo do destino. O cancelamento automático foi encerrado.`
    };
}

function validPoint(point) {
    return Number.isFinite(Number(point?.latitude)) && Math.abs(Number(point.latitude)) <= 90 &&
        Number.isFinite(Number(point?.longitude)) && Math.abs(Number(point.longitude)) <= 180;
}

function haversineMeters(a, b) {
    const rad = degrees => degrees * Math.PI / 180;
    const lat1 = rad(Number(a.latitude));
    const lat2 = rad(Number(b.latitude));
    const deltaLat = lat2 - lat1;
    const deltaLng = rad(Number(b.longitude) - Number(a.longitude));
    const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDistance(meters) {
    return meters >= 1000 ? `${(meters / 1000).toLocaleString("pt-BR")} km` : `${meters} m`;
}

module.exports = {
    avaliarCancelamento,
    haversineMeters,
    minimumDistance,
    AUTOMATIC_CANCELLATION_WINDOW_MS
};
