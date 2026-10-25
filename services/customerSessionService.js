"use strict";

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");

const CUSTOMER_SESSION_SECONDS = 30 * 60;

function createCustomerToken({ id, empresaId, nome, email, sv }) {
    return jwt.sign({ type: "customer", id, empresaId, nome, email, sv: Number(sv) }, JWT_SECRET, {
        expiresIn: CUSTOMER_SESSION_SECONDS
    });
}

module.exports = { CUSTOMER_SESSION_SECONDS, createCustomerToken };
