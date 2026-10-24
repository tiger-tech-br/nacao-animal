"use strict";

const db = require("../database/connection");
const model = require("../models/entregadorModel");
const audit = require("../services/auditService");
const MODES = new Set(["CARRO", "MOTO", "BICICLETA", "A_PE"]);
const FIELDS = new Set(["nome", "telefone", "meio_transporte", "ativo"]);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (message, status) => Object.assign(new Error(message), { status });

function authorized(req) {
    if (!req.user) throw fail("Usuário não autenticado.", 401);
    if (!uuid(req.user.empresaId) || !["ADMIN", "GERENTE"].includes(req.user.cargo || req.user.perfil))
        throw fail("Acesso exclusivo para a administração da loja.", 403);
    return req.user.empresaId;
}

function validatedBody(body, creating = false) {
    if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length ||
        Object.keys(body).some(key => !FIELDS.has(key))) throw fail("Informe somente os dados do entregador.", 400);
    const value = {};
    if (creating || Object.hasOwn(body, "nome")) {
        if (typeof body.nome !== "string" || /[\u0000-\u001f\u007f]/.test(body.nome) ||
            body.nome.trim().length < 2 || body.nome.trim().length > 150)
            throw fail("Informe um nome entre 2 e 150 caracteres.", 400);
        value.nome = body.nome.trim();
    }
    if (creating || Object.hasOwn(body, "meio_transporte")) {
        if (!MODES.has(body.meio_transporte)) throw fail("Escolha carro, moto, bicicleta ou a pé no cadastro do entregador.", 400);
        value.meio_transporte = body.meio_transporte;
    }
    if (creating || Object.hasOwn(body, "telefone")) {
        if (body.telefone === undefined || body.telefone === null || body.telefone === "") value.telefone = null;
        else {
            const number = typeof body.telefone === "string" ? body.telefone.trim() : "";
            if (!/^\+?[\d(). -]{8,20}$/.test(number) || number.length > 20 ||
                number.replace(/\D/g, "").length < 8 || number.replace(/\D/g, "").length > 15)
                throw fail("Informe um telefone válido, com DDD.", 400);
            value.telefone = number;
        }
    }
    if (Object.hasOwn(body, "ativo")) {
        if (![true, false, "true", "false"].includes(body.ativo)) throw fail("Informe se o cadastro está ativo.", 400);
        value.ativo = body.ativo === true || body.ativo === "true";
    } else if (creating) value.ativo = true;
    return value;
}

function validId(req) {
    if (!uuid(req.params?.id)) throw fail("Entregador inválido.", 400);
    return req.params.id;
}

async function listar(req, res, next) {
    try {
        const empresaId = authorized(req), query = req.query || {};
        if (Object.keys(query).some(key => key !== "ativos") ||
            query.ativos !== undefined && !["true", "false"].includes(query.ativos))
            throw fail("Filtro de entregadores inválido.", 400);
        const active = query.ativos === undefined ? null : query.ativos === "true";
        return res.set("Cache-Control", "no-store").json({ success: true, data: await model.listar(empresaId, active) });
    } catch (error) { return next(error); }
}

async function buscarPorId(req, res, next) {
    try {
        const empresaId = authorized(req), id = validId(req);
        const item = await model.buscarPorId(id, empresaId);
        if (!item) throw fail("Entregador não encontrado.", 404);
        return res.set("Cache-Control", "no-store").json({ success: true, data: item });
    } catch (error) { return next(error); }
}

async function criar(req, res, next) {
    try {
        const empresaId = authorized(req), data = validatedBody(req.body, true);
        const item = await db.transaction(async client => {
            const created = await model.criar({ ...data, empresa_id: empresaId }, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "CRIAR", entidade: "ENTREGADOR",
                entidadeId: created.id, descricao: "Entregador cadastrado.", novo: created }, client);
            return created;
        });
        return res.set("Cache-Control", "no-store").status(201).json({ success: true, data: item });
    } catch (error) { return next(error); }
}

async function atualizar(req, res, next) {
    try {
        const empresaId = authorized(req), id = validId(req), data = validatedBody(req.body);
        const item = await db.transaction(async client => {
            const anterior = await model.buscarPorId(id, empresaId, client, true);
            if (!anterior) throw fail("Entregador não encontrado.", 404);
            const updated = await model.atualizar(id, empresaId, { ...anterior, ...data }, client);
            if (!updated) throw fail("Entregador não encontrado.", 404);
            await audit.registrar({ ...audit.requestMeta(req), acao: "EDITAR", entidade: "ENTREGADOR",
                entidadeId: id, descricao: "Cadastro do entregador atualizado.", anterior, novo: updated }, client);
            return updated;
        });
        return res.set("Cache-Control", "no-store").json({ success: true, data: item });
    } catch (error) { return next(error); }
}

async function desativar(req, res, next) {
    try {
        const empresaId = authorized(req), id = validId(req);
        const item = await db.transaction(async client => {
            const anterior = await model.buscarPorId(id, empresaId, client, true);
            if (!anterior) throw fail("Entregador não encontrado.", 404);
            if (!anterior.ativo) return anterior;
            const updated = await model.desativar(id, empresaId, client);
            if (!updated) throw fail("Entregador não encontrado.", 404);
            await audit.registrar({ ...audit.requestMeta(req), acao: "DESATIVAR", entidade: "ENTREGADOR",
                entidadeId: id, descricao: "Cadastro do entregador desativado.", anterior, novo: updated }, client);
            return updated;
        });
        return res.set("Cache-Control", "no-store").json({ success: true, data: item, message: "Entregador desativado. O cadastro pode ser reativado ao editar." });
    } catch (error) { return next(error); }
}

module.exports = { listar, buscarPorId, criar, atualizar, desativar };
