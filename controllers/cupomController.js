"use strict";
const db = require("../database/connection");
const cupons = require("../services/cupomService");

async function consultar(req, res, next) {
    try {
        const empresaId = req.customer.empresaId;
        const subtotal = await cupons.subtotalSacola(db, empresaId, req.body?.itens);
        const cupom = req.body?.codigo
            ? await cupons.validar(db, empresaId, req.body.codigo, subtotal, false, req.customer?.id)
            : null;
        res.set("Cache-Control", "no-store").json({ success: true, data: {
            produtos: subtotal / 100, cupom,
            disponiveis: await cupons.disponiveis(db, empresaId, subtotal)
        } });
    } catch (error) { next(error); }
}

module.exports = { consultar };
