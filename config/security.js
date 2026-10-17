"use strict";

const securityMiddleware = require("../middlewares/securityMiddleware");

function configureSecurity(app) {
    securityMiddleware(app);
}

module.exports = {
    configureSecurity
};
