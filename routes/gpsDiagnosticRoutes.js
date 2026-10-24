"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/gpsDiagnosticController");

function createGpsDiagnosticRouter({
    authenticate = require("../middlewares/authMiddleware"),
    authorize = require("../middlewares/roleMiddleware"),
    routeController = controller.rota
} = {}) {
    const router = express.Router();
    router.use(authenticate, authorize("ADMIN", "GERENTE"));
    const limiter = rateLimit({ windowMs: 60000, limit: 4, standardHeaders: true, legacyHeaders: false,
        message: { success: false, message: "Aguarde um minuto antes de testar a rota novamente." } });
    router.post("/rota", limiter, routeController);
    return router;
}

module.exports = createGpsDiagnosticRouter();
module.exports.createGpsDiagnosticRouter = createGpsDiagnosticRouter;
