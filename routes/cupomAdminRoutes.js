"use strict";

const router = require("express").Router();
const { body, param } = require("express-validator");
const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const validate = require("../middlewares/validationMiddleware");
const controller = require("../controllers/cupomAdminController");

const fields = [
    body("codigo").trim().matches(/^[A-Za-z0-9_-]{3,40}$/).withMessage("Código inválido."),
    body("descricao").trim().isLength({ min: 3, max: 200 }).withMessage("Descrição inválida."),
    body("tipo").isIn(["PERCENTUAL", "FIXO"]).withMessage("Tipo inválido."),
    body("valor").isFloat({ gt: 0 }).withMessage("Valor inválido."),
    body("minimo_compra").optional({ nullable: true }).isFloat({ min: 0 }),
    body("desconto_maximo").optional({ nullable: true, checkFalsy: true }).isFloat({ gt: 0 }),
    body("inicia_em").optional({ checkFalsy: true }).isISO8601(),
    body("expira_em").optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body("ativo").isBoolean(), body("publico").isBoolean(),
    body("limite_usos").optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body("limite_por_cliente").optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 })
];
const id = [param("id").isUUID(), validate];
router.use(auth, role("ADMIN"));
router.get("/", controller.listar);
router.post("/", fields, validate, controller.criar);
router.put("/:id", id[0], fields, validate, controller.atualizar);
router.delete("/:id", ...id, controller.desativar);

module.exports = router;
