"use strict";

const express = require("express");

const router = express.Router();

const financeiroController = require("../controllers/financeiroController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

router.get(
    "/",
    authMiddleware,
    roleMiddleware("ADMIN", "GERENTE"),
    financeiroController.listar
);

router.get(
    "/:id",
    authMiddleware,
    roleMiddleware("ADMIN", "GERENTE"),
    financeiroController.buscarPorId
);

router.post(
    "/",
    authMiddleware,
    roleMiddleware("ADMIN", "GERENTE"),
    financeiroController.criar
);

router.put(
    "/:id",
    authMiddleware,
    roleMiddleware("ADMIN", "GERENTE"),
    financeiroController.atualizar
);

router.delete(
    "/:id",
    authMiddleware,
    roleMiddleware("ADMIN"),
    financeiroController.excluir
);

module.exports = router;
