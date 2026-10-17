"use strict";

// Rede e Itau Pix aguardam a definicao do produto e a implementacao da API.
// O adaptador PagBank herdado so pode ser usado quando selecionado explicitamente.
const IMPLEMENTED_PROVIDERS = new Set(["pagbank"]);

function getPaymentSettings(env = process.env) {
    return {
        enabled: String(env.PAYMENTS_ENABLED || "").trim().toLowerCase() === "true",
        provider: String(env.PAYMENT_PROVIDER || "pending").trim().toLowerCase(),
        environment: String(env.PAYMENT_ENVIRONMENT || "sandbox").trim().toLowerCase()
    };
}

function isPaymentProviderActive(provider, env = process.env) {
    const settings = getPaymentSettings(env);
    return settings.enabled && settings.provider === provider &&
        IMPLEMENTED_PROVIDERS.has(settings.provider) &&
        ["sandbox", "production"].includes(settings.environment);
}

function assertPaymentProviderActive(provider, env = process.env) {
    if (!isPaymentProviderActive(provider, env)) {
        throw Object.assign(new Error(
            "Os pagamentos online ainda não estão disponíveis. Tente novamente mais tarde."
        ), { status: 503, code: "PAYMENTS_NOT_READY" });
    }
}

module.exports = { getPaymentSettings, isPaymentProviderActive, assertPaymentProviderActive };
