"use strict";

const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const role = require("../middlewares/roleMiddleware");
const controller = require("../controllers/auditoriaController");

router.get("/", auth, role("ADMIN"), controller.listar);

module.exports = router;
