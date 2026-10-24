"use strict";

// Preserva a hora da leitura do sensor; uma resposta de rede lenta nao
// transforma uma coordenada antiga em uma posicao atual.
function capturedAt(value, now = Date.now()) {
    if (value === undefined) return null; // Compatibilidade com links ja abertos.
    const time = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        ? Date.parse(value) : NaN;
    if (!Number.isFinite(time) || new Date(time).toISOString() !== value || now - time > 30000 || time - now > 5000) {
        throw Object.assign(new Error("A leitura do GPS esta desatualizada ou invalida. Aguarde uma nova posicao."), { status: 400 });
    }
    return value;
}

module.exports = { capturedAt };
