"use strict";

const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const localSandbox = require("../middlewares/redeSandboxMiddleware");
const sandbox = require("../services/redeSandboxService");

// Anônimo apenas no computador de desenvolvimento. Não abre acesso à API em produção.
router.use(localSandbox, (request, response, next) => {
    const allowedHost = host => ["localhost", "127.0.0.1", "[::1]"].includes(host);
    try {
        const target = new URL(`http://${request.headers.host}`);
        if (!allowedHost(target.hostname) || target.username || target.password) throw new Error();
        if (request.headers.origin) {
            const origin = new URL(request.headers.origin);
            if (!allowedHost(origin.hostname) || origin.host !== target.host || origin.protocol !== "http:") throw new Error();
        }
    } catch {
        return response.status(403).json({ success: false, message: "Teste disponível somente pela sacola no site local." });
    }
    if (request.method === "POST" && !request.is("application/json")) {
        return response.status(415).json({ success: false, message: "Envie o cartão fictício no formato de teste da sacola." });
    }
    next();
});
router.get("/", (request, response) => {
    response.json({ success: true, data: { configured: sandbox.configured(), environment: "sandbox" } });
});
router.post("/transactions", rateLimit({
    windowMs: 60000, limit: 5, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Aguarde um minuto antes de fazer novos testes." }
}), async (request, response) => {
    try {
        const result = await sandbox.simulate(request.body);
        response.json({ success: true, data: { environment: "sandbox", ...result } });
    } catch (error) {
        // Somente mensagens criadas pelo serviço, sem stack ou resposta bancária bruta.
        response.status(error.status || 502).json({ success: false, message: error.status
            ? error.message : "Não foi possível concluir o teste no Sandbox." });
    }
});

module.exports = router;
