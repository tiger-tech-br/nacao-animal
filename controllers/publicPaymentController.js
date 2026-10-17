"use strict";

const db = require("../database/connection");
const VendaModel = require("../models/vendaModel");
const VendaService = require("../services/vendaService");
const pagseguroService = require("../services/pagseguroService");

async function criarPagamento(request, response, next) {
    try {
        const customer = getAuthenticatedCustomer(request);
        const vendaId = request.body?.vendaId || request.body?.venda_id || request.body?.pedidoId || request.body?.pedido_id;
        if (!customer) return response.status(401).json({ success: false, message: "Faça login para iniciar o pagamento." });
        if (!vendaId) return response.status(400).json({ success: false, message: "Informe o pedido para pagamento." });
        pagseguroService.assertConfigured();
        const result = await db.transaction(async client => {
            // Serializa cliques repetidos e solicitações concorrentes para o mesmo pedido.
            const { rows } = await client.query("SELECT id FROM vendas WHERE id = $1 AND cliente_id = $2 AND empresa_id = $3 FOR UPDATE", [vendaId, customer.id, customer.empresaId]);
            if (!rows[0]) return { status: 404, body: { success: false, message: "Pedido não encontrado." } };
            const pedido = await VendaModel.buscarPorIdDoCliente(vendaId, customer.id, customer.empresaId);
            if (pedido.status !== "AGUARDANDO_PAGAMENTO") return { status: 409, body: { success: false, message: "Este pedido não está aguardando pagamento." } };
            if (pedido.pagseguro_checkout_url) return { status: 200, body: { success: true, payment: buildPaymentResponse(pedido) } };
            const checkout = await pagseguroService.criarCheckout(pedido);
            if (!checkout.checkoutId || !checkout.checkoutUrl) {
                const error = new Error("O provedor não retornou um link de pagamento. Tente novamente.");
                error.status = 502;
                throw error;
            }
            const updated = await VendaModel.registrarPagamentoPagSeguro(pedido.id, customer.empresaId, {
                pagseguroCheckoutId: checkout.checkoutId, pagseguroOrderId: checkout.orderId,
                pagseguroChargeId: checkout.chargeId, pagseguroStatus: checkout.status,
                pagseguroCheckoutUrl: checkout.checkoutUrl, pagseguroQrCode: checkout.qrCode,
                pagseguroQrCodeText: checkout.qrCodeText, pagseguroResponse: checkout.raw,
                formaPagamento: checkout.paymentMethod
            }, client);
            return { status: 201, body: { success: true, message: "Pagamento iniciado com sucesso.", payment: buildPaymentResponse(updated) } };
        });
        return response.status(result.status).json(result.body);
    } catch (error) { return next(error); }
}

async function consultarPagamento(request, response, next) {
    try {
        const customer = getAuthenticatedCustomer(request);
        const { id } = request.params;

        if (!customer) {
            return response.status(401).json({
                success: false,
                message: "Faça login para consultar o pagamento."
            });
        }

        const pedido = await VendaModel.buscarPorIdDoCliente(
            id,
            customer.id,
            customer.empresaId
        );

        if (!pedido) {
            return response.status(404).json({
                success: false,
                message: "Pedido não encontrado."
            });
        }

        if (!pedido.pagseguro_checkout_id) {
            return response.status(200).json({
                success: true,
                message: "Pagamento ainda não iniciado.",
                payment: buildPaymentResponse(pedido)
            });
        }

        const checkout = await pagseguroService.consultarCheckout(
            pedido.pagseguro_checkout_id
        );

        const status = pagseguroService.mapStatusToVenda(
            checkout.status
        );

        const dadosPagamento = {
            pagseguroStatus: checkout.status,
            pagseguroOrderId: checkout.orderId,
            pagseguroChargeId: checkout.chargeId,
            pagseguroResponse: checkout.raw,
            formaPagamento: checkout.paymentMethod
        };

        const vendaAtualizada = status === "PAGAMENTO_APROVADO"
            ? await VendaService.confirmarPagamento(
                customer.empresaId,
                pedido.pagseguro_checkout_id,
                dadosPagamento
            )
            : status === "CANCELADA"
                ? await VendaService.cancelarPedido(customer.empresaId, pedido.id, {
                    motivo: `Pagamento ${checkout.status || "cancelado"} pelo PagBank`,
                    skipRefund: true,
                    pagseguroStatus: checkout.status
                })
            : await VendaService.atualizarStatusPagamento(
                customer.empresaId,
                pedido.pagseguro_checkout_id,
                status,
                dadosPagamento
            );

        return response.status(200).json({
            success: true,
            message: "Pagamento consultado com sucesso.",
            payment: buildPaymentResponse(vendaAtualizada || pedido)
        });
    } catch (error) {
        return next(error);
    }
}

async function receberWebhook(request, response, next) {
    try {
        const isValidSignature =
            pagseguroService.validarAssinaturaWebhook(
                request.rawBody,
                request.get("x-authenticity-token")
            );

        if (!isValidSignature) {
            return response.status(401).json({
                success: false,
                message: "Assinatura do webhook inválida."
            });
        }

        const event = pagseguroService.extrairEventoWebhook(
            request.body || {}
        );

        if (!event.referenceId) {
            return response.status(200).json({
                success: true,
                message: "Webhook recebido sem referência de pedido."
            });
        }

        const dadosPagamento = {
            pagseguroStatus: event.pagseguroStatus,
            pagseguroOrderId: event.orderId,
            pagseguroChargeId: event.chargeId,
            pagseguroResponse: event.raw,
            formaPagamento: event.paymentMethod
        };

        if (event.vendaStatus === "PAGAMENTO_APROVADO") {
            await VendaService.confirmarPagamento(
                null,
                event.referenceId,
                dadosPagamento
            );
        } else if (event.vendaStatus === "CANCELADA") {
            const venda = await VendaModel.buscarPorReferenciaPagamento(event.referenceId);
            if (venda) await VendaService.cancelarPedido(venda.empresa_id, venda.id, {
                motivo: `Pagamento ${event.pagseguroStatus || "cancelado"} pelo PagBank`,
                skipRefund: true,
                pagseguroStatus: event.pagseguroStatus
            });
        } else {
            await VendaService.atualizarStatusPagamento(
                null,
                event.referenceId,
                event.vendaStatus,
                dadosPagamento
            );
        }

        return response.status(200).json({
            success: true,
            message: "Webhook processado com sucesso."
        });
    } catch (error) {
        return next(error);
    }
}

function buildPaymentResponse(venda) {
    return {
        vendaId: venda.id,
        status: venda.status,
        pagseguroStatus: venda.pagseguro_status,
        checkoutId: venda.pagseguro_checkout_id,
        orderId: venda.pagseguro_order_id,
        chargeId: venda.pagseguro_charge_id,
        checkoutUrl: venda.pagseguro_checkout_url,
        qrCode: venda.pagseguro_qr_code,
        qrCodeText: venda.pagseguro_qr_code_text,
        atualizadoEm: venda.pagamento_atualizado_em
    };
}

function getAuthenticatedCustomer(request) {
    const id = request.customer?.id;
    const empresaId = request.customer?.empresaId;

    if (!id || !empresaId) {
        return null;
    }

    return {
        id,
        empresaId
    };
}

module.exports = {
    criarPagamento,
    consultarPagamento,
    receberWebhook
};
