"use strict";

const db = require("../database/connection");
const model = require("../models/cupomAdminModel");
const audit = require("../services/auditService");

async function listar(req, res, next) {
    try { res.json({ success: true, data: await model.listar(req.user.empresaId) }); }
    catch (error) { next(error); }
}

async function criar(req, res, next) {
    try {
        const result = await db.transaction(async client => {
            const novo = await model.criar(req.body, req.user.empresaId, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "CRIAR", entidade: "CUPOM", entidadeId: novo.id,
                descricao: `Cupom ${novo.codigo} criado.`, novo }, client);
            return novo;
        });
        res.status(201).json({ success: true, message: "Cupom criado com sucesso.", data: result });
    } catch (error) { next(mapConstraint(error)); }
}

async function atualizar(req, res, next) {
    try {
        const result = await db.transaction(async client => {
            const anterior = await model.buscar(req.params.id, req.user.empresaId, client);
            if (!anterior) return null;
            const novo = await model.atualizar(req.params.id, req.body, req.user.empresaId, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "EDITAR", entidade: "CUPOM", entidadeId: novo.id,
                descricao: `Cupom ${novo.codigo} atualizado.`, anterior, novo }, client);
            return novo;
        });
        if (!result) return res.status(404).json({ success: false, message: "Cupom não encontrado." });
        res.json({ success: true, message: "Cupom atualizado com sucesso.", data: result });
    } catch (error) { next(mapConstraint(error)); }
}

async function desativar(req, res, next) {
    try {
        const result = await db.transaction(async client => {
            const anterior = await model.buscar(req.params.id, req.user.empresaId, client);
            if (!anterior) return null;
            const novo = await model.desativar(req.params.id, req.user.empresaId, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "DESATIVAR", entidade: "CUPOM", entidadeId: novo.id,
                descricao: `Cupom ${novo.codigo} desativado.`, anterior, novo }, client);
            return novo;
        });
        if (!result) return res.status(404).json({ success: false, message: "Cupom não encontrado." });
        res.json({ success: true, message: "Cupom desativado com sucesso.", data: result });
    } catch (error) { next(error); }
}

function mapConstraint(error) {
    if (error?.code === "23505") return Object.assign(new Error("Já existe um cupom com esse código."), { status: 409 });
    if (error?.code === "23514" || error?.code === "22P02") return Object.assign(new Error("Confira os valores e as datas do cupom."), { status: 400 });
    return error;
}

module.exports = { listar, criar, atualizar, desativar };
