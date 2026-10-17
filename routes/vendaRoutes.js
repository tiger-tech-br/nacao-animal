"use strict";

/* ==================================================
   DEPENDÊNCIAS
================================================== */

const express = require("express");

const VendaController = require(
    "../controllers/vendaController"
);

const authMiddleware = require(
    "../middlewares/authMiddleware"
);

const roleMiddleware = require(
    "../middlewares/roleMiddleware"
);

/* ==================================================
   ROTAS
================================================== */

const router = express.Router();

/* ==================================================
   PROTEÇÃO DAS ROTAS
================================================== */

router.use(authMiddleware);

router.use(
    roleMiddleware(
        "ADMIN",
        "GERENTE"
    )
);

/* ==================================================
   LISTAR PEDIDOS
================================================== */

router.get(
    "/",
    VendaController.listar
);
router.post("/:id/rastreamento", require("../controllers/entregaController").criarLink);
router.get("/:id/rastreamento", require("../controllers/entregaController").acompanharAdmin);

/* ==================================================
   ESTATÍSTICAS DOS PEDIDOS
================================================== */

router.get(
    "/estatisticas/total",
    VendaController.totalVendas
);

/* ==================================================
   BUSCAR PEDIDO POR ID
================================================== */

router.get(
    "/:id",
    VendaController.buscarPorId
);

/* ==================================================
   ATUALIZAR STATUS DO PEDIDO
================================================== */

router.patch(
    "/:id/status",
    VendaController.atualizarStatus
);

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = router;
