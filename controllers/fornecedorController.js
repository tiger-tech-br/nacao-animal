"use strict";

const fornecedorModel = require("../models/fornecedorModel");
const audit = require("../services/auditService");

async function listar(req, res, next) {
    try {
        return res.status(200).json({ success: true, data: await fornecedorModel.listar(req.user.empresaId) });
    } catch (error) { return next(error); }
}

async function buscarPorId(req, res, next) {
    try {
        const item = await fornecedorModel.buscarPorId(req.params.id, req.user.empresaId);
        if (!item) return res.status(404).json({ success: false, message: "Fornecedor não encontrado." });
        return res.status(200).json({ success: true, data: item });
    } catch (error) { return next(error); }
}

async function criar(req, res, next) {
    try {
        if (!String(req.body?.nome || "").trim()) {
            return res.status(400).json({ success: false, message: "Nome é obrigatório." });
        }
        const item = await fornecedorModel.criar({ ...req.body, empresa_id: req.user.empresaId });
        await audit.registrar({ ...audit.requestMeta(req), acao: "CRIAR", entidade: "FORNECEDOR",
            entidadeId: item.id, descricao: `Fornecedor ${item.nome} cadastrado.`, novo: item });
        return res.status(201).json({ success: true, data: item });
    } catch (error) { return next(error); }
}

async function atualizar(req, res, next) {
    try {
        const anterior = await fornecedorModel.buscarPorId(req.params.id, req.user.empresaId);
        if (!anterior) return res.status(404).json({ success: false, message: "Fornecedor não encontrado." });
        const item = await fornecedorModel.atualizar(req.params.id, req.user.empresaId, req.body || {});
        await audit.registrar({ ...audit.requestMeta(req), acao: "EDITAR", entidade: "FORNECEDOR",
            entidadeId: item.id, descricao: `Fornecedor ${item.nome} atualizado.`, anterior, novo: item });
        return res.status(200).json({ success: true, data: item });
    } catch (error) { return next(error); }
}

async function excluir(req, res, next) {
    try {
        const anterior = await fornecedorModel.buscarPorId(req.params.id, req.user.empresaId);
        if (!anterior) return res.status(404).json({ success: false, message: "Fornecedor não encontrado." });
        const item = await fornecedorModel.excluir(req.params.id, req.user.empresaId);
        await audit.registrar({ ...audit.requestMeta(req), acao: item?.ativo === false ? "DESATIVAR" : "EXCLUIR",
            entidade: "FORNECEDOR", entidadeId: req.params.id,
            descricao: `Fornecedor ${anterior.nome} removido.`, anterior, novo: item });
        return res.status(200).json({ success: true, message: "Fornecedor removido com sucesso." });
    } catch (error) { return next(error); }
}

module.exports = { listar, buscarPorId, criar, atualizar, excluir };
