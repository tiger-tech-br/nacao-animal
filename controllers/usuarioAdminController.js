"use strict";

const bcrypt = require("bcrypt");
const db = require("../database/connection");
const model = require("../models/usuarioAdminModel");
const audit = require("../services/auditService");

async function listar(req, res, next) {
    try { res.json({ success: true, data: await model.listar(req.user.empresaId) }); }
    catch (error) { next(error); }
}
async function criar(req, res, next) {
    try {
        if (!req.body.senha || String(req.body.senha).length < 8) return res.status(400).json({ success: false, message: "A senha precisa ter ao menos 8 caracteres." });
        const senhaHash = await bcrypt.hash(req.body.senha, 12);
        const novo = await db.transaction(async client => {
            const item = await model.criar(req.body, req.user.empresaId, senhaHash, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "CRIAR", entidade: "USUARIO_ADMIN", entidadeId: item.id,
                descricao: `Usuário administrativo ${item.email} criado.`, novo: item }, client);
            return item;
        });
        res.status(201).json({ success: true, message: "Usuário criado com sucesso.", data: novo });
    } catch (error) { next(mapError(error)); }
}
async function atualizar(req, res, next) {
    try {
        const senhaHash = req.body.senha ? await bcrypt.hash(req.body.senha, 12) : null;
        const result = await db.transaction(async client => {
            const anterior = await model.buscar(req.params.id, req.user.empresaId, client);
            if (!anterior) return null;
            const desativando = req.body.ativo === false || req.body.ativo === "false";
            const removendoAdmin = anterior.perfil === "ADMIN" && (desativando || req.body.perfil !== "ADMIN");
            if (String(anterior.id) === String(req.user.id) && (desativando || req.body.perfil !== anterior.perfil)) {
                throw Object.assign(new Error("Você não pode desativar ou rebaixar a própria conta."), { status: 409 });
            }
            if (removendoAdmin && await model.contarAdminsAtivos(req.user.empresaId, client) <= 1) {
                throw Object.assign(new Error("A loja precisa manter ao menos um administrador ativo."), { status: 409 });
            }
            const novo = await model.atualizar(req.params.id, req.body, req.user.empresaId, senhaHash, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "EDITAR", entidade: "USUARIO_ADMIN", entidadeId: novo.id,
                descricao: `Usuário administrativo ${novo.email} atualizado.`, anterior, novo }, client);
            return novo;
        });
        if (!result) return res.status(404).json({ success: false, message: "Usuário não encontrado." });
        res.json({ success: true, message: "Usuário atualizado com sucesso.", data: result });
    } catch (error) { next(mapError(error)); }
}
async function desativar(req, res, next) {
    req.body = { ...(await model.buscar(req.params.id, req.user.empresaId)), ativo: false, senha: "" };
    return atualizar(req, res, next);
}
function mapError(error) {
    if (error?.code === "23505") return Object.assign(new Error("Já existe um usuário com esse e-mail."), { status: 409 });
    return error;
}
module.exports = { listar, criar, atualizar, desativar };
