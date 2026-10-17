"use strict";
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");
const quoteSecret = crypto.createHmac("sha256", JWT_SECRET).update("petflow/frete/v1").digest();
const DEFAULT_ORIGIN = "Avenida Novo Horizonte, 123, Vila Sacadura Cabral, Santo André, SP, Brasil";
const addressFields = ["endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep"];
const error = (message, status = 400) => Object.assign(new Error(message), { status });

function addressSnapshot(customer) {
    return Object.fromEntries(addressFields.map(key => [key, String(customer?.[key] || "").trim()]));
}
function validateAddress(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw error("Informe o endereço de entrega.");
    const address = addressSnapshot(input);
    address.cep = address.cep.replace(/\D/g, "");
    address.estado = address.estado.toUpperCase();
    if (!["endereco", "numero", "bairro", "cidade", "estado", "cep"].every(key => address[key]) ||
        !/^\d{8}$/.test(address.cep) || !/^[A-Z]{2}$/.test(address.estado) ||
        addressFields.some(field => (input[field] != null && typeof input[field] === "object") || address[field].length > 200)) {
        throw error("Confira o CEP e complete rua, número, bairro, cidade e estado da entrega.");
    }
    return address;
}
function origin() { return process.env.DELIVERY_ORIGIN_ADDRESS?.trim() || DEFAULT_ORIGIN; }
function fingerprint(customer) {
    return crypto.createHash("sha256").update(JSON.stringify([origin(), addressSnapshot(customer)])).digest("hex");
}
function priceForDistance(meters) {
    if (!Number.isInteger(meters) || meters < 0) throw error("Distância de entrega inválida.");
    return Math.max(0, Math.ceil((meters - 1000) / 1000)) * 3;
}
async function quote(customer) {
    const address = validateAddress(customer);
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    if (!key) {
        console.error("[frete] Configure GOOGLE_MAPS_API_KEY ou GOOGLE_API_KEY no serviço da aplicação.");
        throw error("A loja ainda está configurando o cálculo da entrega. Tente novamente mais tarde.", 503);
    }
    let response, payload;
    try {
        response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST", signal: AbortSignal.timeout(10000),
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
            body: JSON.stringify({ origin: { address: origin() }, destination: { address: [...addressFields.filter(k => k !== "complemento").map(k => address[k]), "Brasil"].filter(Boolean).join(", ") }, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", languageCode: "pt-BR", units: "METRIC" })
        });
        payload = await response.json();
    } catch {
        throw error("Não foi possível calcular o frete agora. Tente novamente.", 503);
    }
    if (!response.ok) {
        console.error("[frete] Google Routes indisponível. Confira Routes API, faturamento e restrições da chave.", {
            status: response.status, code: payload?.error?.status,
            reason: payload?.error?.details?.find(detail => detail.reason)?.reason
        });
        throw error("Não foi possível calcular o frete agora. Tente novamente.", 503);
    }
    const meters = payload?.routes?.[0]?.distanceMeters;
    if (!Number.isInteger(meters) || meters < 0) throw error("Não encontramos uma rota. Confira o endereço e o CEP da entrega.", 422);
    const token = jwt.sign({ ...(customer.id ? { sub: customer.id } : {}), address: fingerprint(address), meters }, quoteSecret, { algorithm: "HS256", audience: "frete", expiresIn: "15m" });
    return { token, distanciaMetros: meters, valor: priceForDistance(meters), expiraEm: new Date(Date.now() + 900000).toISOString() };
}
function verifyQuote(token, customer) {
    let decoded;
    try { decoded = jwt.verify(token, quoteSecret, { algorithms: ["HS256"], audience: "frete" }); }
    catch { throw error("Calcule novamente o frete antes de finalizar o pedido.", 409); }
    const address = validateAddress(customer);
    if ((decoded.sub && decoded.sub !== customer.id) || decoded.address !== fingerprint(address)) throw error("O endereço mudou. Calcule novamente o frete.", 409);
    return { valor: priceForDistance(decoded.meters), distanciaMetros: decoded.meters, endereco: address };
}

async function consultarCep(value) {
    const cep = String(value || "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(cep)) throw error("Informe um CEP com 8 dígitos.");
    const providers = [
        {
            name: "ViaCEP",
            url: `https://viacep.com.br/ws/${cep}/json/`,
            normalize: data => data?.erro ? null : ({
                cep,
                endereco: data?.logradouro || "",
                bairro: data?.bairro || "",
                cidade: data?.localidade || "",
                estado: data?.uf || ""
            })
        },
        {
            name: "BrasilAPI",
            url: `https://brasilapi.com.br/api/cep/v2/${cep}`,
            normalize: data => ({
                cep,
                endereco: data?.street || "",
                bairro: data?.neighborhood || "",
                cidade: data?.city || "",
                estado: data?.state || ""
            })
        }
    ];
    let notFound = false;
    for (const provider of providers) {
        try {
            const response = await fetch(provider.url, {
                signal: AbortSignal.timeout(6000),
                headers: { Accept: "application/json", "User-Agent": "PetFlow/1.0" }
            });
            if (response.status === 400 || response.status === 404) {
                notFound = true;
                continue;
            }
            if (!response.ok) continue;
            const address = provider.normalize(await response.json());
            if (!address) {
                notFound = true;
                continue;
            }
            address.estado = String(address.estado || "").toUpperCase();
            if (address.cidade && /^[A-Z]{2}$/.test(address.estado)) return address;
        } catch (providerError) {
            console.warn(`[frete] ${provider.name} indisponível para consulta de CEP.`, providerError?.name || "erro");
        }
    }
    if (notFound) throw error("CEP não encontrado. Confira os números informados ou preencha o endereço manualmente.", 404);
    throw error("Não foi possível buscar o CEP agora. Preencha o endereço manualmente ou tente novamente.", 503);
}
module.exports = { quote, verifyQuote, priceForDistance, addressSnapshot, validateAddress, consultarCep };
