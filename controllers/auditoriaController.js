"use strict";

const AuditoriaModel = require("../models/auditoriaModel");

async function listar(req, res, next) {
    try {
        const data = await AuditoriaModel.listar(req.user.empresaId, req.query);
        res.json({ success: true, data: data.registros, pagination: data });
    } catch (error) { next(error); }
}

module.exports = { listar };
