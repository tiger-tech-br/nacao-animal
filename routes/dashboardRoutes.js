"use strict";

const express = require("express");

const router = express.Router();

const DashboardController = require("../controllers/dashboardController");

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

/* ==============================================
   TODAS AS ROTAS EXIGEM AUTENTICAÇÃO
============================================== */

router.use(authMiddleware);
const notifications = require("../controllers/adminNotificationController");
router.get("/notificacoes", roleMiddleware("ADMIN", "GERENTE"), notifications.listar);
router.patch("/notificacoes/lidas", roleMiddleware("ADMIN", "GERENTE"), notifications.ler);

/* ==============================================
   DASHBOARD COMPLETO
============================================== */

router.get(

    "/",

    roleMiddleware("ADMIN", "GERENTE"),

    DashboardController.dashboard

);

/* ==============================================
   RESUMO
============================================== */

router.get(

    "/resumo",

    roleMiddleware("ADMIN", "GERENTE"),

    DashboardController.resumo

);

/* ==============================================
   ÚLTIMAS VENDAS
============================================== */

router.get(

    "/ultimas-vendas",

    roleMiddleware("ADMIN", "GERENTE"),

    DashboardController.ultimasVendas

);

/* ==============================================
   ÚLTIMAS COMPRAS
============================================== */

router.get(

    "/ultimas-compras",

    roleMiddleware("ADMIN", "GERENTE"),

    DashboardController.ultimasCompras

);

/* ==============================================
   ESTOQUE BAIXO
============================================== */

router.get(

    "/estoque-baixo",

    roleMiddleware("ADMIN", "GERENTE"),

    DashboardController.estoqueBaixo

);




/* ==============================================
   CONTAS VENCIDAS
============================================== */

router.get(

    "/contas-vencidas",

    roleMiddleware("ADMIN", "GERENTE"),

    DashboardController.contasVencidas

);

/* ==============================================
   PRODUTOS MAIS VENDIDOS
============================================== */

router.get(

    "/produtos-mais-vendidos",

    roleMiddleware("ADMIN", "GERENTE"),

    DashboardController.produtosMaisVendidos

);




module.exports = router;
