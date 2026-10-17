"use strict";

/* ==================================================
   EXPRESS
================================================== */

const express = require("express");

const router = express.Router();

/* ==================================================
   CONTROLLER
================================================== */

const produtoController = require("../controllers/produtoController");

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

    body,

    param

} = require("express-validator");

/* ==================================================
   VALIDAÇÃO
================================================== */

const produtoValidation = [

    body("categoriaId")

        .isUUID()

        .withMessage("Categoria inválida."),

    body("nome")

        .trim()

        .notEmpty()

        .withMessage("O nome do produto é obrigatório.")

        .isLength({

            min: 3,

            max: 150

        })

        .withMessage("O nome deve possuir entre 3 e 150 caracteres."),

    body("descricao")

        .trim()

        .notEmpty()

        .withMessage("A descrição do produto é obrigatória.")

        .isLength({ min: 10, max: 2000 })

        .withMessage("A descrição deve possuir entre 10 e 2000 caracteres."),

    body("sku")

        .trim()

        .notEmpty()

        .withMessage("O SKU é obrigatório."),

    body("codigoBarras")

        .optional()

        .trim(),

    body("preco")

        .isFloat({

            min: 0

        })

        .withMessage("Preço inválido."),

    body("custo")

        .isFloat({

            min: 0

        })

        .withMessage("Custo inválido.")

];

/* ==================================================
   ID
================================================== */

const idValidation = [

    param("id")

        .isUUID()

        .withMessage("ID inválido.")

];

/* ==================================================
   LISTAR
================================================== */

router.get(

    "/",

    authMiddleware,

    roleMiddleware("ADMIN"),

    produtoController.index

);

/* ==================================================
   BUSCAR
================================================== */

router.get(

    "/:id",

    authMiddleware,

    roleMiddleware("ADMIN"),

    idValidation,

    validationMiddleware,

    produtoController.show

);

/* ==================================================
   CADASTRAR
================================================== */

router.post(

    "/",

    authMiddleware,

    roleMiddleware(

        "ADMIN"

    ),

    upload.single("foto"),

    produtoValidation,

    validationMiddleware,

    produtoController.store

);

/* ==================================================
   ATUALIZAR
================================================== */

router.put(

    "/:id",

    authMiddleware,

    roleMiddleware(

        "ADMIN"

    ),

    upload.single("foto"),

    idValidation,

    produtoValidation,

    validationMiddleware,

    produtoController.update

);

/* ==================================================
   REMOVER
================================================== */

router.delete(

    "/:id",

    authMiddleware,

    roleMiddleware(

        "ADMIN"

    ),

    idValidation,

    validationMiddleware,

    produtoController.destroy

);

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = router;
