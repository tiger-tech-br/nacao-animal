"use strict";

const CompraModel = require("../models/compraModel");
const CompraService = require("../services/compraService");

async function listar(req, res, next) {
    try { return res.json({ success: true, data: await CompraModel.listar(req.user.empresaId) }); }
    catch (error) { return next(error); }
}

async function buscarPorId(req, res, next) {
    try {
        const compra = await CompraModel.buscarPorId(req.params.id, req.user.empresaId);
        if (!compra) return res.status(404).json({ success: false, message: "Compra não encontrada." });
        return res.json({ success: true, data: compra });
    } catch (error) { return next(error); }
}

async function criar(req, res, next) {
    try {
        const { fornecedor_id, data_compra, observacoes, itens } = req.body;
        if (!fornecedor_id) return res.status(400).json({ success: false, message: "Fornecedor obrigatório." });
        if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ success: false, message: "Informe ao menos um item." });
        const resultado = await CompraService.finalizarCompra(req.user.empresaId, {
            fornecedor_id, data_compra, observacoes, usuario_id: req.user.id
        }, itens);
        return res.status(201).json({ success: true, message: resultado.message, data: resultado.compra });
    } catch (error) {
        if (!error.status && /quantidade|valor|produto|fornecedor/i.test(error.message)) error.status = 400;
        return next(error);
    }
}

async function atualizar(req, res) {
    return res.status(405).json({ success: false,
        message: "Compras recebidas não podem ser editadas. Cancele a compra para reverter estoque e financeiro." });
}

async function excluir(req, res) {
    return res.status(405).json({ success: false,
        message: "Compras não podem ser excluídas. Use o cancelamento para preservar o histórico." });
}

async function cancelar(req, res, next) {
    try {
        const compra = await CompraService.cancelarCompra(
            req.user.empresaId, req.params.id, req.user.id, req.body?.motivo
        );
        if (!compra) return res.status(404).json({ success: false, message: "Compra não encontrada." });
        return res.json({ success: true, message: "Compra cancelada e estoque/financeiro revertidos.", data: compra });
    } catch (error) { return next(error); }
}

module.exports = { listar, buscarPorId, criar, atualizar, excluir, cancelar };
