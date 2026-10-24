"use strict";

const MAX_POSITION_AGE_MS = 30000;
const MAX_FUTURE_SKEW_MS = 5000;
const MAX_ACCURACY_METERS = 100;
const POSITION_FIELDS = new Set(["latitude", "longitude", "precisao", "timestamp"]);

function positionFromBody(body, now) {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(field => !POSITION_FIELDS.has(field))) return null;
    const { latitude, longitude, precisao, timestamp } = body;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !Number.isFinite(precisao) || precisao < 0 || precisao > MAX_ACCURACY_METERS) return null;
    const milliseconds = typeof timestamp === "number" ? timestamp
        : typeof timestamp === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timestamp) ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(milliseconds) || now - milliseconds > MAX_POSITION_AGE_MS || milliseconds - now > MAX_FUTURE_SKEW_MS) return null;
    return { latitude, longitude, precisao, timestamp: milliseconds };
}

function storeAddress(store) {
    const fields = ["endereco", "numero", "bairro", "cidade", "estado", "cep"];
    if (!store || fields.some(field => typeof store[field] !== "string" || !store[field].trim() || store[field].length > 200)) return null;
    const address = Object.fromEntries(fields.map(field => [field, store[field].trim()]));
    address.cep = address.cep.replace(/\D/g, "");
    address.estado = address.estado.toUpperCase();
    if (!/^\d{8}$/.test(address.cep) || !/^[A-Z]{2}$/.test(address.estado)) return null;
    address.complemento = typeof store.complemento === "string" ? store.complemento.trim().slice(0, 200) : "";
    return address;
}

function createGpsDiagnosticController({
    db = { query: (...args) => require("../database/connection").query(...args) },
    calcularRota = (...args) => require("../services/entregaRotaService").calcularRota(...args),
    now = Date.now
} = {}) {
    return async function rota(req, res) {
        res.set("Cache-Control", "no-store");
        const reject = (status, message) => res.status(status).json({ success: false, message });
        if (!req.user?.empresaId || !["ADMIN", "GERENTE"].includes(req.user.cargo || req.user.perfil))
            return reject(403, "Este teste está disponível somente para a administração da loja.");
        const position = positionFromBody(req.body, now());
        if (!position) return reject(400, "Obtenha uma posição GPS recente, com precisão de até 100 metros, para testar a rota.");
        try {
            // Somente leitura: o destino e sempre a loja da sessao autenticada.
            // Nao cria pedido, rastreamento, pagamento ou registro de coordenadas.
            const { rows } = await db.query(`SELECT endereco,numero,complemento,bairro,cidade,estado,cep
                FROM empresas WHERE id=$1 LIMIT 1`, [req.user.empresaId]);
            if (!rows[0]) return reject(404, "A loja desta sessão não foi encontrada.");
            const address = storeAddress(rows[0]);
            if (!address) return reject(422, "Complete o endereço da loja nas configurações antes de testar a rota.");
            const route = await calcularRota({ latitude: position.latitude, longitude: position.longitude }, address);
            return res.json({ success: true, data: route });
        } catch {
            // Nao encaminha erros brutos ao logger: o provedor pode incluir
            // localizacao, endereco ou credenciais no texto de uma falha.
            return reject(503, "Não foi possível consultar a rota de teste. Confira o endereço da loja e a configuração do Google Maps.");
        }
    };
}

module.exports = { rota: createGpsDiagnosticController(), createGpsDiagnosticController, positionFromBody, storeAddress };
