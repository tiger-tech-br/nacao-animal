"use strict";

/* ==================================================
   EXPRESS
================================================== */

const express = require("express");

const router = express.Router();

/* ==================================================
   CONTROLLER
================================================== */

const empresaController = require("../controllers/empresaController");

/* ==================================================
   MIDDLEWARES
================================================== */

const authMiddleware = require("../middlewares/authMiddleware");

const roleMiddleware = require("../middlewares/roleMiddleware");

const validationMiddleware = require("../middlewares/validationMiddleware");

const upload = require("../middlewares/uploadMiddleware");

/* ==================================================
   EXPRESS VALIDATOR
================================================== */

const {

    body

} = require("express-validator");

/* ==================================================
   VALIDAÇÃO
================================================== */

const empresaValidation = [

    body("nome")

        .trim()

        .notEmpty()

        .withMessage("O nome da empresa é obrigatório."),

    body("razaoSocial")

        .trim()

        .notEmpty()

        .withMessage("A razão social é obrigatória."),

    body("cnpj")

        .trim()

        .notEmpty()

        .withMessage("O CNPJ é obrigatório."),

    body("telefone")

        .trim()

        .notEmpty()

        .withMessage("O telefone é obrigatório."),

    body("email")

        .trim()

        .isEmail()

        .withMessage("Informe um e-mail válido."),

    body("endereco")

        .trim()

        .notEmpty()

        .withMessage("O endereço é obrigatório."),

    body("numero")

        .trim()

        .notEmpty()

        .withMessage("O número do endereço é obrigatório."),

    body("bairro")

        .trim()

        .notEmpty()

        .withMessage("O bairro é obrigatório."),

    body("cidade")

        .trim()

        .notEmpty()

        .withMessage("A cidade é obrigatória."),

    body("estado")

        .trim()

        .notEmpty()

        .withMessage("O estado é obrigatório."),

    body("cep")

        .trim()

        .notEmpty()

        .withMessage("O CEP é obrigatório.")

];

/* ==================================================
   BUSCAR EMPRESA
================================================== */

router.get(

    "/",

    authMiddleware,

    roleMiddleware(

        "ADMIN"

    ),

    empresaController.show

);

/* ==================================================
   ATUALIZAR
================================================== */

router.put(

    "/",

    authMiddleware,

    roleMiddleware(

        "ADMIN"

    ),

    upload.single("logo"),

    empresaValidation,

    validationMiddleware,

    empresaController.update

);

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = router;
