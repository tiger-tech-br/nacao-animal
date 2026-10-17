"use strict";

const FinanceiroModel = require("../models/financeiroModel");
const db = require("../database/connection");
const audit = require("../services/auditService");

function validarLancamento(body) {
    const valor = Number(body.valor);
    const pago = Number(body.valor_pago || 0);
    if (!Number.isFinite(valor) || valor <= 0 || !Number.isFinite(pago) || pago < 0 || pago > valor) {
        throw Object.assign(new Error("Confira o valor e o valor pago do lançamento."), { status: 400 });
    }
    if (body.status === "PAGO" && (pago !== valor || !body.data_pagamento)) {
        throw Object.assign(new Error("Um lançamento pago precisa ter valor integral e data de pagamento."), { status: 400 });
    }
}

async function listar(req, res, next) {
    try {
        const lancamentos = await FinanceiroModel.listar(req.user.empresaId);

        return res.status(200).json({
            success: true,
            data: lancamentos
        });
    } catch (error) {
        next(error);
    }
}

async function buscarPorId(req, res, next) {
    try {
        const lancamento = await FinanceiroModel.buscarPorId(
            req.params.id,
            req.user.empresaId
        );

        if (!lancamento) {
            return res.status(404).json({
                success: false,
                message: "Lançamento financeiro não encontrado."
            });
        }

        return res.status(200).json({
            success: true,
            data: lancamento
        });
    } catch (error) {
        next(error);
    }
}

async function criar(req, res, next) {
    try {
        validarLancamento(req.body);
        const lancamento = await db.transaction(async client => {
            const novo = await FinanceiroModel.criar({ ...req.body, origem: "MANUAL",
                referencia_id: null, empresa_id: req.user.empresaId, criado_por: req.user.id }, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "CRIAR", entidade: "FINANCEIRO",
                entidadeId: novo.id, descricao: "Lançamento financeiro manual criado.", novo }, client);
            return novo;
        });

        return res.status(201).json({
            success: true,
            message: "Lançamento financeiro cadastrado com sucesso.",
            data: lancamento
        });
    } catch (error) {
        next(error);
    }
}

async function atualizar(req, res, next) {
    try {
        validarLancamento(req.body);
        const lancamento = await db.transaction(async client => {
            const anterior = await FinanceiroModel.buscarPorId(req.params.id, req.user.empresaId, client);
            if (!anterior) return null;
            if (anterior.origem && anterior.origem !== "MANUAL") {
                throw Object.assign(new Error("Lançamentos gerados por pedidos ou compras não podem ser editados diretamente."), { status: 409 });
            }
            const novo = await FinanceiroModel.atualizar(req.params.id, req.user.empresaId,
                { ...req.body, origem: "MANUAL", referencia_id: null }, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "EDITAR", entidade: "FINANCEIRO",
                entidadeId: novo.id, descricao: "Lançamento financeiro manual atualizado.", anterior, novo }, client);
            return novo;
        });

        if (!lancamento) {
            return res.status(404).json({
                success: false,
                message: "Lançamento financeiro não encontrado."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Lançamento financeiro atualizado com sucesso.",
            data: lancamento
        });
    } catch (error) {
        next(error);
    }
}

async function excluir(req, res, next) {
    try {
        const lancamento = await db.transaction(async client => {
            const anterior = await FinanceiroModel.buscarPorId(req.params.id, req.user.empresaId, client);
            if (!anterior) return null;
            if (anterior.origem && anterior.origem !== "MANUAL") {
                throw Object.assign(new Error("Lançamentos automáticos devem ser cancelados pela compra ou pelo pedido de origem."), { status: 409 });
            }
            const removido = await FinanceiroModel.excluir(req.params.id, req.user.empresaId, client);
            await audit.registrar({ ...audit.requestMeta(req), acao: "EXCLUIR", entidade: "FINANCEIRO",
                entidadeId: anterior.id, descricao: "Lançamento financeiro manual excluído.", anterior }, client);
            return removido;
        });

        if (!lancamento) {
            return res.status(404).json({
                success: false,
                message: "Lançamento financeiro não encontrado."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Lançamento financeiro removido com sucesso."
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    listar,
    buscarPorId,
    criar,
    atualizar,
    excluir
};
