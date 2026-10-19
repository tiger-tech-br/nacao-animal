"use strict";

// Não usa req.ip: o aplicativo aceita proxy e este teste deve ficar no computador local.
function redeSandboxMiddleware(request, response, next) {
    response.set("Cache-Control", "no-store");
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket?.remoteAddress);
    if (process.env.NODE_ENV !== "development" || process.env.PAYMENT_ENVIRONMENT !== "sandbox" || !local) {
        return response.status(404).json({ success: false, message: "Rota não encontrada." });
    }
    next();
}

module.exports = redeSandboxMiddleware;
