"use strict";

const {
    RESEND_API_KEY,
    EMAIL_FROM,
    APP_URL
} = require("../config/env");

function assertEmailConfigured() {
    if (!RESEND_API_KEY) {
        throw emailError("missing_api_key");
    }
    if (!EMAIL_FROM) throw emailError("missing_sender");
}

function emailError(code, providerStatus) {
    const error = new Error("Não foi possível enviar o e-mail. Tente novamente em alguns minutos.");
    error.status = 503;
    error.code = code;
    // Never log the request, recipient, token, API key or provider's raw body.
    console.error("[email] falha no Resend", { code, providerStatus });
    return error;
}

async function sendEmail({ to, subject, html, text, idempotencyKey }) {
    assertEmailConfigured();

    let response;
    try {
        response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
            from: EMAIL_FROM,
            to,
            subject,
            html,
            text
        })
        });
    } catch (error) {
        throw emailError(["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "network_error");
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const message = String(payload?.message || "").toLowerCase();
        let code = `http_${response.status}`;
        if (response.status === 401) code = "invalid_api_key";
        else if (response.status === 403) {
            code = message.includes("testing emails") ? "test_sender_restricted"
                : message.includes("not verified") ? "domain_not_verified" : "sender_not_authorized";
        } else if (response.status === 429) code = "rate_or_quota_limit";
        throw emailError(code, response.status);
    }

    if (typeof payload?.id !== "string" || !payload.id) throw emailError("invalid_provider_response", response.status);
    console.info("[email] aceito pelo Resend", { id: payload.id });
    return payload;
}

async function sendOptionalEmail(options) {
    try {
        return await sendEmail(options);
    } catch (error) {
        console.warn("[email] envio ignorado:", error.message);
        return null;
    }
}

function welcomeTemplate({ name }) {
    const safeName = escapeHtml(firstName(name) || "cliente");
    const message = `${safeName}, seu cadastro foi criado com sucesso. Agora você pode comprar, favoritar produtos e acompanhar seus pedidos.`;

    return {
        subject: "Cadastro criado na PetFlow",
        text: message,
        html: baseEmail(`
            <h1>Bem-vindo à PetFlow</h1>
            <p>${message}</p>
        `)
    };
}

function emailVerificationTemplate({ name, verifyUrl }) {
    const safeName = escapeHtml(firstName(name) || "cliente");

    return {
        subject: "Confirme seu e-mail na PetFlow",
        text: `Olá, ${safeName}. Confirme seu e-mail para ativar sua conta PetFlow: ${verifyUrl}`,
        html: baseEmail(`
            <h1>Confirme seu e-mail</h1>
            <p>Olá, ${safeName}.</p>
            <p>Recebemos seu cadastro na PetFlow. Para ativar sua conta e poder comprar, confirme seu e-mail pelo botão abaixo.</p>
            <p>
                <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#04766d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
                    Confirmar e-mail
                </a>
            </p>
            <p style="color:#647481;font-size:13px">Se você não fez este cadastro, ignore este e-mail.</p>
        `)
    };
}

function passwordResetTemplate({ name, resetUrl }) {
    const safeName = escapeHtml(firstName(name) || "cliente");

    return {
        subject: "Redefinição de senha PetFlow",
        text: `Olá, ${safeName}. Use este link para redefinir sua senha: ${resetUrl}`,
        html: baseEmail(`
            <h1>Redefinição de senha</h1>
            <p>Olá, ${safeName}.</p>
            <p>Recebemos uma solicitação para redefinir sua senha na PetFlow.</p>
            <p>
                <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#04766d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
                    Criar nova senha
                </a>
            </p>
            <p>Se você não solicitou essa alteração, ignore este e-mail.</p>
            <p style="color:#647481;font-size:13px">Este link expira por segurança.</p>
        `)
    };
}



function orderReceivedTemplate({ name, orderId, total, subtotal, discount, shipping, paymentMethod, address, items = [] }) {
    const safeName = escapeHtml(firstName(name) || "cliente");
    const orderLabel = shortId(orderId);
    const addressText = formatAddress(address);
    const paymentText = formatPayment(paymentMethod);
    const ordersUrl = `${APP_URL}/meus-pedidos`;
    const termsUrl = `${APP_URL}/termos-de-uso`;
    const itemList = items.map(item => `
        <li style="padding:10px 0;border-bottom:1px solid #e5edf0">
            ${escapeHtml(item.nome || "Produto")}
            <strong style="float:right">${Number(item.quantidade || 1)}x ${currency(item.valor_unitario)}</strong>
        </li>
    `).join("");

    return {
        subject: `Pedido recebido #${orderLabel} - PetFlow`,
        text: `Olá, ${firstName(name) || "cliente"}. Recebemos seu pedido #${orderLabel}. Produtos: ${currency(subtotal ?? total)}. Desconto: ${currency(discount)}. Frete: ${currency(shipping)}. Total: ${currency(total)}. Pagamento: ${paymentText}. Entrega: ${addressText}. Consulte e solicite atendimento em ${ordersUrl}. Termos: ${termsUrl}.`,
        html: baseEmail(`
            <h1>Pedido recebido</h1>
            <p>Olá, ${safeName}.</p>
            <p>Recebemos seu pedido <strong>#${orderLabel}</strong>. A PetFlow vai acompanhar a separação e entrega pelo painel administrativo.</p>
            <ul style="list-style:none;padding:0;margin:18px 0;color:#10212b">
                ${itemList}
            </ul>
            <table style="width:100%;border-collapse:collapse;margin:18px 0">
                <tr><td style="padding:5px 0">Produtos</td><td style="padding:5px 0;text-align:right">${currency(subtotal ?? total)}</td></tr>
                <tr><td style="padding:5px 0">Desconto</td><td style="padding:5px 0;text-align:right">-${currency(discount)}</td></tr>
                <tr><td style="padding:5px 0">Frete</td><td style="padding:5px 0;text-align:right">${currency(shipping)}</td></tr>
                <tr><td style="padding:10px 0;border-top:1px solid #d9e5e7;font-size:18px"><strong>Total</strong></td><td style="padding:10px 0;border-top:1px solid #d9e5e7;text-align:right;font-size:18px"><strong>${currency(total)}</strong></td></tr>
            </table>
            <p><strong>Pagamento:</strong> ${escapeHtml(paymentText)}</p>
            <p><strong>Endereço de entrega:</strong> ${escapeHtml(addressText)}</p>
            <p><a href="${escapeHtml(ordersUrl)}" style="display:inline-block;background:#04766d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Consultar pedido e atendimento</a></p>
            <p style="font-size:13px;color:#647481">Guarde este e-mail como comprovante. Consulte também os <a href="${escapeHtml(termsUrl)}">Termos de Uso</a>.</p>
        `)
    };
}

function paymentApprovedTemplate({ name, orderId, total }) {
    const safeName = escapeHtml(firstName(name) || "cliente");
    const orderLabel = shortId(orderId);

    return {
        subject: `Pagamento aprovado #${orderLabel} - PetFlow`,
        text: `Olá, ${safeName}. O pagamento do pedido #${orderLabel} foi aprovado no valor de ${currency(total)}.`,
        html: baseEmail(`
            <h1>Pagamento aprovado</h1>
            <p>Olá, ${safeName}.</p>
            <p>O pagamento do pedido <strong>#${orderLabel}</strong> foi aprovado. Agora vamos separar tudo com cuidado para a entrega.</p>
            <p style="font-size:18px"><strong>Total: ${currency(total)}</strong></p>
        `)
    };
}

function orderOutForDeliveryTemplate({ name, orderId }) {
    const safeName = escapeHtml(firstName(name) || "cliente");
    const orderLabel = shortId(orderId);
    const trackingUrl = `${APP_URL}/acompanhar-entrega?pedido=${encodeURIComponent(orderId)}`;

    return {
        subject: `Pedido saiu para entrega #${orderLabel} - PetFlow`,
        text: `Olá, ${safeName}. Seu pedido #${orderLabel} saiu para entrega. Rastrear pedido: ${trackingUrl} . Entre na conta usada na compra para acompanhar.`,
        html: baseEmail(`
            <h1>Pedido saiu para entrega</h1>
            <p>Olá, ${safeName}.</p>
            <p>Seu pedido <strong>#${orderLabel}</strong> saiu para entrega e está a caminho.</p>
            <p><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:#04766d;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Rastrear pedido</a></p>
            <p>Entre na conta usada na compra. O mapa será atualizado assim que o entregador iniciar a viagem e compartilhar o GPS.</p>
        `)
    };
}

function orderDeliveredTemplate({ name, orderId }) {
    const safeName = escapeHtml(firstName(name) || "cliente");
    const orderLabel = shortId(orderId);

    return {
        subject: `Pedido entregue #${orderLabel} - PetFlow`,
        text: `Olá, ${safeName}. Seu pedido #${orderLabel} foi entregue.`,
        html: baseEmail(`
            <h1>Pedido entregue</h1>
            <p>Olá, ${safeName}.</p>
            <p>Seu pedido <strong>#${orderLabel}</strong> foi entregue. Obrigado por comprar com a PetFlow.</p>
        `)
    };
}

function orderCanceledTemplate({ name, orderId }) {
    const safeName = escapeHtml(firstName(name) || "cliente");
    const orderLabel = shortId(orderId);

    return {
        subject: `Pedido cancelado #${orderLabel} - PetFlow`,
        text: `Olá, ${safeName}. Seu pedido #${orderLabel} foi cancelado.`,
        html: baseEmail(`
            <h1>Pedido cancelado</h1>
            <p>Olá, ${safeName}.</p>
            <p>Seu pedido <strong>#${orderLabel}</strong> foi cancelado. Se tiver dúvidas, entre em contato com a PetFlow.</p>
        `)
    };
}

function newsletterConfirmationTemplate({ name, email, token }) {
    const safeName = escapeHtml(firstName(name) || "cliente");
    const unsubscribeUrl = `${APP_URL}/newsletter/cancelar?email=${encodeURIComponent(String(email || ""))}&token=${encodeURIComponent(String(token || ""))}`;

    return {
        subject: "Inscrição confirmada na newsletter PetFlow",
        text: `Olá, ${safeName}. Sua inscrição na newsletter da PetFlow foi confirmada. Para cancelar: ${unsubscribeUrl}`,
        html: baseEmail(`
            <h1>Inscrição confirmada</h1>
            <p>Olá, ${safeName}.</p>
            <p>Você entrou para a lista da PetFlow. Vamos enviar novidades, promoções e dicas úteis para cuidar melhor do seu pet.</p>
            <p style="font-size:13px"><a href="${escapeHtml(unsubscribeUrl)}">Cancelar inscrição na newsletter</a></p>
            <p style="color:#647481;font-size:13px">Se você não fez esta inscrição, ignore este e-mail.</p>
        `)
    };
}

function baseEmail(content) {
    return `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;color:#10212b;line-height:1.55">
            ${content}
            <hr style="border:0;border-top:1px solid #e5edf0;margin:24px 0">
            <p style="color:#647481;font-size:13px">PetFlow - produtos para o bem-estar do seu pet.</p>
        </div>
    `;
}

function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0];
}

function shortId(id) {
    return String(id || "").slice(0, 8).toUpperCase();
}

function currency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function formatAddress(value) {
    if (!value || typeof value !== "object") return "Endereço informado no pedido";
    return [value.endereco, value.numero, value.complemento, value.bairro, value.cidade,
        value.estado, value.cep].filter(Boolean).join(", ") || "Endereço informado no pedido";
}

function formatPayment(value) {
    return ({ PIX: "Pix", CARTAO_CREDITO: "Cartão de crédito", CARTAO_DEBITO: "Cartão de débito", PAGBANK: "PagBank" })[value] || String(value || "PagBank");
}



function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

module.exports = {
    assertEmailConfigured,
    sendEmail,
    sendOptionalEmail,
    welcomeTemplate,
    emailVerificationTemplate,
    passwordResetTemplate,
    orderReceivedTemplate,
    paymentApprovedTemplate,
    orderOutForDeliveryTemplate,
    orderDeliveredTemplate,
    orderCanceledTemplate,
    newsletterConfirmationTemplate
};
