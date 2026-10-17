"use strict";

const express = require("express");

const router = express.Router();

const compraController = require("../controllers/compraController");

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { body, param } = require("express-validator");
const validationMiddleware = require("../middlewares/validationMiddleware");

// Listar compras
router.get(
    "/",
    authMiddleware,
    roleMiddleware("ADMIN"),
    compraController.listar
);

// Buscar compra por ID
router.get(
    "/:id",
    authMiddleware,
    roleMiddleware("ADMIN"),
    compraController.buscarPorId
);

// Cadastrar compra
router.post(
    "/",
    authMiddleware,
    roleMiddleware("ADMIN"),
    compraController.criar
);

// Atualizar compra
router.put(
    "/:id",
    authMiddleware,
    roleMiddleware("ADMIN"),
    compraController.atualizar
);

// Excluir compra
router.delete(
    "/:id",
    authMiddleware,
    roleMiddleware("ADMIN"),
    compraController.excluir
);

router.post(
    "/:id/cancelar",
    authMiddleware,
    roleMiddleware("ADMIN"),
    param("id").isUUID().withMessage("Compra inválida."),
    body("motivo").trim().isLength({ min: 5, max: 500 }).withMessage("Informe o motivo do cancelamento."),
    validationMiddleware,
    compraController.cancelar
);

module.exports = router;
