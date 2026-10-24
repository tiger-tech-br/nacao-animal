"use strict";

/* ==================================================
   DEPENDÊNCIAS
================================================== */

const helmet = require("helmet");

const cors = require("cors");
const os = require("node:os");

const compression = require("compression");

const hpp = require("hpp");

const cookieParser = require("cookie-parser");

const morgan = require("morgan");

const rateLimit = require("express-rate-limit");
const realtimePath = /^\/api\/(?:dashboard(?:\/notificacoes)?|vendas\/[^/]+\/rastreamento|public\/(?:clientes\/notificacoes|pedidos\/[^/]+\/rastreamento|entregas\/(?:localizacao|viagem|rota|mapa-config)))$/;
const mapPages = ["/entregador", "/acompanhar-entrega", "/admin/acompanhar-entrega", "/admin/testar-gps"];
const realtimeLimiter = rateLimit({ windowMs: 60000, limit: 240, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Muitas atualizações. Aguarde um minuto para tentar novamente." } });

/* ==================================================
   RATE LIMIT
================================================== */

const limiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    max: process.env.NODE_ENV === "production" ?100 : 1000,

    standardHeaders: true,

    legacyHeaders: false,

    skip: request =>
        realtimePath.test(request.path) ||
        request.method === "OPTIONS" ||
        (
            request.method === "GET" &&
            !request.path.startsWith("/api/")
        ),

    message: {

        success: false,

        message: "Muitas requisições. Tente novamente em alguns minutos."

    }

});

/* ==================================================
   CORS
================================================== */

const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.APP_URL
]
    .filter(Boolean)
    .flatMap(origin => origin.split(","))
    .map(origin => origin.trim())
    .filter(Boolean);

function isLocalDevelopmentOrigin(origin, request) {
    if (process.env.NODE_ENV === "production") return false;
    try {
        const url = new URL(origin);
        if (url.origin !== origin || url.protocol !== "http:" ||
            url.host !== request.get("host") ||
            Number(url.port || 80) !== request.socket.localPort) return false;

        if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return true;
        return Object.values(os.networkInterfaces()).flat().some(address =>
            address && !address.internal && address.address === url.hostname);
    } catch {
        return false;
    }
}

function corsOptions(request, configure) {
    configure(null, {
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin(origin, request)) {
                callback(null, true);
                return;
            }
            callback(new Error("Origem não permitida pelo CORS."));
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    });
}

/* ==================================================
   SEGURANÇA
================================================== */

function securityMiddleware(app) {

    /* Helmet */

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                "upgrade-insecure-requests": process.env.NODE_ENV === "production" ? [] : null,
                "frame-src": ["'self'", "https://*.google.com"],
                "script-src": [
                    "'self'",
                    "'unsafe-inline'",
                    req => mapPages.includes(req.path) ? "'unsafe-eval'" : "'self'",
                    req => mapPages.includes(req.path) ? "blob:" : "'self'",
                    "https://maps.googleapis.com",
                    "https://maps.gstatic.com",
                    "https://cdnjs.cloudflare.com"
                ],
                "style-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "https://fonts.googleapis.com",
                    "https://cdnjs.cloudflare.com"
                ],
                "font-src": [
                    "'self'",
                    "https://fonts.gstatic.com",
                    "https://cdnjs.cloudflare.com",
                    "data:"
                ],
                "img-src": ["'self'", "data:", "blob:", "https:"],
                "worker-src": ["'self'", "blob:"],
                "connect-src": [
                    "'self'",
                    "https://*.googleapis.com",
                    "https://*.gstatic.com",
                    "https://*.google.com",
                    "data:", "blob:",
                    "https://viacep.com.br",
                    "https://api.pagseguro.com",
                    "https://sandbox.api.pagseguro.com"
                ]
            }
        }
    }));

    app.use((req, res, next) => {
        if (mapPages.includes(req.path)) {
            // Google valida a origem da chave pública; não transmite caminho nem fragmento privado.
            res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        }
        next();
    });

    /* Compressão */

    app.use(compression());

    /* Cookie Parser */

    app.use(cookieParser());

    /* HTTP Parameter Pollution */

    app.use(hpp());

    /* CORS */

    app.use(cors(corsOptions));

    /* Logs */

    app.use(morgan("dev"));

    /* Rate Limit */

    app.use(limiter);
    app.use((req, res, next) => realtimePath.test(req.path) ? realtimeLimiter(req, res, next) : next());

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = securityMiddleware;
