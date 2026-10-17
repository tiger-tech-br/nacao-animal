"use strict";

const express = require("express");

const publicPaymentController = require(
    "../controllers/publicPaymentController"
);

const customerAuthMiddleware = require(
    "../middlewares/customerAuthMiddleware"
);

const router = express.Router();

router.post(
    "/",
    customerAuthMiddleware,
    publicPaymentController.criarPagamento
);

router.get(
    "/:id",
    customerAuthMiddleware,
    publicPaymentController.consultarPagamento
);

router.post(
    "/webhook",
    publicPaymentController.receberWebhook
);

module.exports = router;
