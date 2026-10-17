"use strict";

const { getPaymentSettings, isPaymentProviderActive } = require("./payment");

const REQUIRED_MIGRATIONS = [
    "110_admin_profissional.sql",
    "111_lgpd.sql",
    "112_atendimento_consumidor.sql",
    "113_cloudinary_assets.sql",
    "114_atendimento_notificacoes.sql"
];

function configuredValue(value) {
    const text = String(value || "").trim();
    return Boolean(text) && !/^(?:seu(?:a)?[ _-]|sua[ _-]|your[ _-]|troque[ _-]|change[ _-]?me|replace[ _-]?me|placeholder|example|test(?:[ _-]|$)|re_test(?:[ _-]|$))/i.test(text);
}

function isPublicHttpsUrl(value) {
    try {
        const url = new URL(String(value || "").trim());
        const host = url.hostname.toLowerCase();
        return url.protocol === "https:" && !url.username && !url.password &&
            !url.search && !url.hash && (url.pathname === "/" || url.pathname === "") &&
            !/^(?:localhost|0\.0\.0\.0|127(?:\.\d+){3}|\[::1\]|example\.(?:com|org|net))$/.test(host) &&
            !/\.(?:localhost|local|internal|test|invalid)$/.test(host) &&
            !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
    } catch {
        return false;
    }
}

function isProductionPagBankUrl(value) {
    try {
        const url = new URL(String(value || "").trim());
        return url.origin === "https://api.pagseguro.com" && !url.username && !url.password &&
            !url.search && !url.hash && (url.pathname === "/" || url.pathname === "");
    } catch {
        return false;
    }
}

function validSender(value) {
    const sender = String(value || "").trim();
    const address = sender.includes("<") ? sender.match(/^[^<>]+<([^<>]+)>$/)?.[1] : sender;
    return Boolean(address) && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) &&
        !/@(?:example\.(?:com|org|net)|[^@]+\.(?:test|invalid))$/i.test(address);
}

function productionConfigurationChecks(env = process.env, options = {}) {
    const checks = [];
    const check = (name, passed, detail, integration = "configuracao") =>
        checks.push({ name, passed: Boolean(passed), detail, integration });
    const required = {
        JWT_SECRET: "configuracao", JWT_EXPIRES_IN: "configuracao", APP_URL: "configuracao",
        RESEND_API_KEY: "email", EMAIL_FROM: "email",
        GOOGLE_MAPS_BROWSER_API_KEY: "mapa",
        CLOUDINARY_CLOUD_NAME: "imagens", CLOUDINARY_API_KEY: "imagens", CLOUDINARY_API_SECRET: "imagens"
    };
    for (const [name, integration] of Object.entries(required)) {
        const value = String(env[name] || "").trim();
        check(`Variavel ${name}`, configuredValue(value), value ? "deve ser propria, sem valores de exemplo" : "ausente", integration);
    }
    check("Chave do frete", configuredValue(env.GOOGLE_MAPS_API_KEY || env.GOOGLE_API_KEY),
        "GOOGLE_MAPS_API_KEY ou GOOGLE_API_KEY propria", "frete");
    check("Modo de producao", env.NODE_ENV === "production", "NODE_ENV=production");
    const secret = String(env.JWT_SECRET || "");
    check("JWT forte", configuredValue(secret) && secret.trim().length >= 32 && !/^(.)\1+$/.test(secret),
        "minimo de 32 caracteres, sem valores de exemplo ou repetidos");
    check("APP_URL HTTPS publico", isPublicHttpsUrl(env.APP_URL), "origem HTTPS publica da loja");
    const payment = getPaymentSettings(env);
    check("Pagamentos online habilitados", payment.enabled, "liberar somente apos integracao e homologacao", "pagamento");
    check("Integracao de pagamento implementada", isPaymentProviderActive(payment.provider, env),
        "Rede e Itau Pix aguardam a implementacao da API contratada", "pagamento");
    check("Ambiente de pagamento de producao", payment.environment === "production",
        "PAYMENT_ENVIRONMENT=production apos homologacao", "pagamento");
    if (payment.provider === "pagbank") {
        for (const name of ["PAGSEGURO_BASE_URL", "PAGSEGURO_TOKEN"]) {
            check(`Variavel ${name}`, configuredValue(env[name]), "credencial propria do adaptador legado", "pagamento");
        }
        check("PagBank producao", isProductionPagBankUrl(env.PAGSEGURO_BASE_URL), "https://api.pagseguro.com", "pagamento");
    }
    check("Remetente de e-mail", validSender(env.EMAIL_FROM), "endereco de e-mail valido do remetente", "email");
    if (options.cloudinaryConfigured !== undefined) {
        check("Configuracao Cloudinary", options.cloudinaryConfigured, "credenciais proprias das imagens", "imagens");
    }
    return checks;
}

function configurationStatus(checks) {
    const names = ["configuracao", "email", "pagamento", "frete", "mapa", "imagens"];
    return Object.fromEntries(names.map(name => [name,
        checks.filter(check => check.integration === name).every(check => check.passed)
    ]));
}

module.exports = { REQUIRED_MIGRATIONS, configuredValue, productionConfigurationChecks, configurationStatus };
