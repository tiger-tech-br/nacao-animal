"use strict";

/* ==================================================
   EXPRESS VALIDATOR
================================================== */

const { validationResult } = require("express-validator");

/* ==================================================
   VALIDAÇÃO
================================================== */

function validationMiddleware(request, response, next) {

    const errors = validationResult(request);

    if (!errors.isEmpty()) {

        return response.status(400).json({

            success: false,

            message: "Erro de validação.",

            errors: errors.array().map(error => ({

                field: error.path,

                message: error.msg

            }))

        });

    }

    next();

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = validationMiddleware;