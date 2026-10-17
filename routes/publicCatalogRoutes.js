"use strict";

const express = require("express");

const publicCatalogController = require("../controllers/publicCatalogController");
const publicOrderController = require("../controllers/publicOrderController");
const publicCustomerController = require("../controllers/publicCustomerController");
const newsletterController = require("../controllers/newsletterController");
const customerAuthMiddleware = require("../middlewares/customerAuthMiddleware");

const router = express.Router();
const cupomController = require("../controllers/cupomController");
const cupomLimiter = require("express-rate-limit")({ windowMs: 60000, limit: 40,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Aguarde um minuto antes de consultar cupons novamente." } });
router.post("/cupons/consultar", customerAuthMiddleware, cupomLimiter, cupomController.consultar);
const entregaController = require("../controllers/entregaController");
const freteLimiter = require("express-rate-limit")({ windowMs: 60000, limit: 6, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Aguarde um minuto antes de calcular novamente." } });
const optionalCustomerAuth = (req, res, next) => req.headers.authorization ? customerAuthMiddleware(req, res, next) : next();
const cepLimiter = require("express-rate-limit")({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Aguarde um minuto antes de consultar outro CEP." } });
router.get("/frete/cep/:cep", cepLimiter, entregaController.consultarCep);
router.post("/frete/cotar", freteLimiter, optionalCustomerAuth, entregaController.cotar);
router.get("/pedidos/:id/rastreamento", customerAuthMiddleware, entregaController.acompanhar);
router.post("/entregas/localizacao", entregaController.localizacao);
router.delete("/entregas/localizacao", entregaController.localizacao);
router.get("/entregas/viagem", entregaController.viagem);
router.post("/entregas/rota", entregaController.rota);
router.get("/entregas/mapa-config", entregaController.mapaConfig);
const verificationLimiter = require("express-rate-limit")({
    windowMs: 15 * 60 * 1000, limit: 5,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Aguarde alguns minutos antes de solicitar outro e-mail." }
});
const consumerRequestLimiter = require("express-rate-limit")({
    windowMs: 15 * 60 * 1000, limit: 5,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Aguarde alguns minutos antes de enviar outra solicitação." }
});

router.get("/produtos", publicCatalogController.produtos);
router.get("/categorias", publicCatalogController.categorias);
router.get("/loja", publicCatalogController.loja);
router.post("/newsletter", newsletterController.subscribe);
router.get("/newsletter/cancelar", newsletterController.unsubscribe);
router.post("/clientes/cadastro", publicCustomerController.register);
router.post("/clientes/reenviar-confirmacao", verificationLimiter, publicCustomerController.resendVerification);
router.post("/clientes/login", publicCustomerController.login);
router.post("/clientes/logout", customerAuthMiddleware, publicCustomerController.logout);
router.get("/clientes/verificar-email", publicCustomerController.verifyEmail);
router.post("/clientes/verificar-email", publicCustomerController.verifyEmail);
router.post("/clientes/esqueci-senha", publicCustomerController.forgotPassword);
router.post("/clientes/redefinir-senha", publicCustomerController.resetPassword);
router.get("/clientes/me", customerAuthMiddleware, publicCustomerController.me);
router.put("/clientes/me", customerAuthMiddleware, publicCustomerController.update);
router.delete("/clientes/me", customerAuthMiddleware, publicCustomerController.remove);
router.get("/clientes/me/dados", customerAuthMiddleware, publicCustomerController.exportData);
router.post("/clientes/me/solicitacoes-lgpd", customerAuthMiddleware, publicCustomerController.createLgpdRequest);
router.get("/clientes/me/solicitacoes-lgpd", customerAuthMiddleware, publicCustomerController.listLgpdRequests);
router.get("/clientes/pedidos", customerAuthMiddleware, publicCustomerController.orders);
router.post("/clientes/pedidos/:id/solicitacoes", customerAuthMiddleware, consumerRequestLimiter, publicCustomerController.createConsumerRequest);
router.get("/clientes/notificacoes", customerAuthMiddleware, publicCustomerController.notifications);
router.patch("/clientes/notificacoes/lidas", customerAuthMiddleware, publicCustomerController.markNotificationRead);
router.patch("/clientes/notificacoes/:id/lida", customerAuthMiddleware, publicCustomerController.markNotificationRead);
router.post("/pedidos", customerAuthMiddleware, publicOrderController.criarPedido);

module.exports = router;
