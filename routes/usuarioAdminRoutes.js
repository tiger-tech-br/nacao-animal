"use strict";

const router = require("express").Router();
const { body, param } = require("express-validator");
const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const validate = require("../middlewares/validationMiddleware");
const controller = require("../controllers/usuarioAdminController");

const fields = [
    body("nome").trim().isLength({ min: 3, max: 150 }),
    body("email").trim().isEmail(),
    body("perfil").isIn(["ADMIN", "GERENTE"]),
    body("ativo").isBoolean(),
    body("senha").optional({ checkFalsy: true }).isLength({ min: 8, max: 200 })
];
router.use(auth, role("ADMIN"));
router.get("/", controller.listar);
router.post("/", fields, validate, controller.criar);
router.put("/:id", param("id").isUUID(), fields, validate, controller.atualizar);
router.delete("/:id", param("id").isUUID(), validate, controller.desativar);
module.exports = router;
