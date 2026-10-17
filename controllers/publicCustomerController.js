"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../database/connection");
const VendaService = require("../services/vendaService");
const { avaliarCancelamento } = require("../services/cancelamentoEntregaService");
const PRIVACY_VERSION = "2026-10-03";

function digest(value) {
    return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}
const {
    JWT_SECRET,
    JWT_EXPIRES_IN,
    APP_URL
} = require("../config/env");

const {
    sendEmail,
    sendOptionalEmail,
    assertEmailConfigured,
    emailVerificationTemplate,
    passwordResetTemplate
} = require("../services/emailService");

async function register(request, response, next) {

    let client;
    let committed = false;
    try {

        const data = request.body || {};
        if (typeof data.email === "string") data.email = data.email.trim().toLowerCase();

        if (!hasRequiredRegistrationData(data)) {

            return response.status(400).json({
                success: false,
                message: "Informe nome, WhatsApp, e-mail, senha e endereço de entrega."
            });

        }

        if (data.aceite_privacidade !== true && data.aceite_privacidade !== "true" && data.aceite_privacidade !== "on") {
            return response.status(400).json({
                success: false,
                message: "Leia e aceite a Política de Privacidade para criar sua conta."
            });
        }

        assertEmailConfigured();
        client = await db.connect();
        await client.query("BEGIN");

        const senhaHash = await bcrypt.hash(
            data.senha,
            10
        );

        const verificationToken = crypto
            .randomBytes(32)
            .toString("hex");

        const verificationExpiresAt = new Date(
            Date.now() + 1000 * 60 * 60 * 24
        );

        const empresaIdResult = await client.query(
            "SELECT get_petflow_empresa_id() AS id"
        );

        const empresaId = empresaIdResult.rows[0].id;

        const existing = await client.query(
            `
                SELECT
                    c.id,
                    uc.cliente_id AS usuario_cliente_id,
                    CASE
                        WHEN LOWER(COALESCE(c.email, uc.email)) = LOWER($1) THEN 'email'
                        WHEN $3 <> ''
                         AND REGEXP_REPLACE(COALESCE(c.cpf, ''), '\\D', '', 'g') = $3 THEN 'cpf'
                        WHEN $4 <> ''
                         AND (
                            REGEXP_REPLACE(COALESCE(c.telefone, ''), '\\D', '', 'g') = $4
                            OR REGEXP_REPLACE(COALESCE(c.whatsapp, ''), '\\D', '', 'g') = $4
                         ) THEN 'telefone'
                        WHEN $5 <> ''
                         AND (
                            REGEXP_REPLACE(COALESCE(c.telefone, ''), '\\D', '', 'g') = $5
                            OR REGEXP_REPLACE(COALESCE(c.whatsapp, ''), '\\D', '', 'g') = $5
                         ) THEN 'whatsapp'
                        ELSE NULL
                    END AS field
                FROM clientes c
                LEFT JOIN usuarios_clientes uc
                    ON uc.cliente_id = c.id
                WHERE (
                    c.empresa_id = $2
                    OR c.empresa_id IS NULL
                    OR uc.cliente_id IS NOT NULL
                )
                  AND (
                    LOWER(COALESCE(c.email, uc.email)) = LOWER($1)
                    OR (
                        $3 <> ''
                        AND REGEXP_REPLACE(COALESCE(c.cpf, ''), '\\D', '', 'g') = $3
                    )
                    OR (
                        $4 <> ''
                        AND (
                            REGEXP_REPLACE(COALESCE(c.telefone, ''), '\\D', '', 'g') = $4
                            OR REGEXP_REPLACE(COALESCE(c.whatsapp, ''), '\\D', '', 'g') = $4
                        )
                    )
                    OR (
                        $5 <> ''
                        AND (
                            REGEXP_REPLACE(COALESCE(c.telefone, ''), '\\D', '', 'g') = $5
                            OR REGEXP_REPLACE(COALESCE(c.whatsapp, ''), '\\D', '', 'g') = $5
                        )
                    )
                  )
                LIMIT 1
            `,
            [
                data.email,
                empresaId,
                onlyDigits(data.cpf),
                onlyDigits(data.telefone),
                onlyDigits(data.whatsapp)
            ]
        );

        if (existing.rows[0]) {

            return response.status(409).json({
                success: false,
                message: duplicateCustomerMessage(existing.rows[0].field)
            });

        }

        let clienteId = existing.rows[0]?.id;

        if (existing.rows[0]?.usuario_cliente_id) {

            return response.status(409).json({
                success: false,
                message: "Já existe uma conta cadastrada com esse e-mail."
            });

        }

        if (clienteId) {

            await client.query(
                `
                    UPDATE clientes
                    SET
                        nome = $1,
                        telefone = $2,
                        whatsapp = $2,
                        cep = $3,
                        endereco = $4,
                        numero = $5,
                        complemento = $6,
                        bairro = $7,
                        cidade = $8,
                        estado = $9,
                        data_nascimento = $10,
                        updated_at = NOW()
                    WHERE id = $11
                      AND empresa_id = $12
                `,
                [
                    data.nome,
                    data.telefone,
                    data.cep || null,
                    data.endereco || null,
                    data.numero || null,
                    data.complemento || null,
                    data.bairro || null,
                    data.cidade || null,
                    data.estado || null,
                    data.data_nascimento || data.dataNascimento || null,
                    clienteId,
                    empresaId
                ]
            );

        } else {

            const created = await client.query(
                `
                    INSERT INTO clientes (
                        empresa_id,
                        nome,
                        cpf,
                        email,
                        telefone,
                        whatsapp,
                        cep,
                        endereco,
                        numero,
                        complemento,
                        bairro,
                        cidade,
                        estado,
                        data_nascimento,
                        privacidade_versao,
                        privacidade_aceita_em,
                        ativo
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $5,
                        $6,
                        $7,
                        $8,
                        $9,
                        $10,
                        $11,
                        $12,
                        $13,
                        $14,
                        NOW(),
                        TRUE
                    )
                    RETURNING id
                `,
                [
                    empresaId,
                    data.nome,
                    data.cpf || null,
                    data.email.toLowerCase(),
                    data.telefone,
                    data.cep || null,
                    data.endereco || null,
                    data.numero || null,
                    data.complemento || null,
                    data.bairro || null,
                    data.cidade || null,
                    data.estado || null,
                    data.data_nascimento || data.dataNascimento || null,
                    PRIVACY_VERSION
                ]
            );

            clienteId = created.rows[0].id;

        }


        await client.query(
            `INSERT INTO lgpd_consentimentos
             (empresa_id,cliente_id,finalidade,versao,concedido,origem,ip_hash,user_agent_hash)
             VALUES ($1,$2,'POLITICA_PRIVACIDADE',$3,TRUE,'CADASTRO',$4,$5)`,
            [empresaId, clienteId, PRIVACY_VERSION, digest(request.ip), digest(request.get("user-agent"))]
        );

        await client.query(
            `
                INSERT INTO usuarios_clientes (
                    cliente_id,
                    email,
                    senha_hash,
                    email_verificado,
                    token_verificacao_email,
                    token_verificacao_expiracao,
                    ativo
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    FALSE,
                    $4,
                    $5,
                    TRUE
                )
            `,
            [
                clienteId,
                data.email.toLowerCase(),
                senhaHash,
                verificationToken,
                verificationExpiresAt
            ]
        );

        const profile = await getProfileById(
            clienteId,
            empresaId,
            client
        );

        await createCustomerNotification({
            clienteId,
            titulo: "Bem-vindo à PetFlow",
            mensagem: `${firstName(profile.nome)}, seu cadastro foi criado com sucesso. Agora você pode comprar, favoritar produtos e acompanhar seus pedidos.`,
            tipo: "SISTEMA"
        }, client);

        const verificationUrl = `${APP_URL}/login?verificar_email=${verificationToken}`;

        const template = emailVerificationTemplate({
            name: profile.nome,
            verifyUrl: verificationUrl
        });

        await sendEmail({
            to: profile.email,
            subject: template.subject,
            html: template.html,
            text: template.text,
            idempotencyKey: `verification/${verificationToken}`
        });

        await client.query("COMMIT");
        committed = true;

        return response.status(201).json({
            success: true,
            message: "Cadastro criado. Enviamos um link de confirmação para seu e-mail."
        });

    } catch (error) {

        if (error.code === "23505") {
            error.status = 409;
            error.message = "Já existe um cadastro com esses dados. Entre ou reenvie a confirmação de e-mail.";
        }
        return next(error);

    } finally {
        if (client) {
            try { if (!committed) await client.query("ROLLBACK"); }
            finally { client.release(); }
        }
    }

}

async function login(request, response, next) {

    try {

        const {
            email,
            senha
        } = request.body;

        const empresaIdResult = await db.query(
            "SELECT get_petflow_empresa_id() AS id"
        );

        const empresaId = empresaIdResult.rows[0].id;

        const { rows } = await db.query(
            `
                SELECT
                    c.*,
                    uc.senha_hash,
                    uc.email_verificado,
                    uc.sessao_versao,
                    uc.ativo AS usuario_ativo
                FROM clientes c
                INNER JOIN usuarios_clientes uc
                    ON uc.cliente_id = c.id
                WHERE LOWER(c.email) = LOWER($1)
                  AND c.empresa_id = $2
                LIMIT 1
            `,
            [
                email,
                empresaId
            ]
        );

        const cliente = rows[0];

        if (
            !cliente ||
            !cliente.usuario_ativo ||
            !cliente.ativo
        ) {

            return response.status(401).json({
                success: false,
                message: "E-mail ou senha inválidos."
            });

        }

        const valid = await bcrypt.compare(
            senha,
            cliente.senha_hash
        );

        if (!valid) {

            return response.status(401).json({
                success: false,
                message: "E-mail ou senha inválidos."
            });

        }

        if (!cliente.email_verificado) {

            return response.status(403).json({
                success: false,
                message: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."
            });

        }

        await db.query(
            `
                UPDATE usuarios_clientes
                SET ultimo_login = NOW()
                WHERE cliente_id = $1
            `,
            [cliente.id]
        );

        return response.status(200).json({
            success: true,
            message: "Login realizado com sucesso.",
            data: buildAuthPayload(cliente)
        });

    } catch (error) {

        return next(error);

    }

}

async function logout(request, response, next) {
    try {
        const customer = getAuthenticatedCustomer(request, response);
        if (!customer) return;
        await db.query(
            `UPDATE usuarios_clientes SET sessao_versao=sessao_versao+1,updated_at=NOW()
             WHERE cliente_id=$1`,
            [customer.id]
        );
        return response.json({ success: true, message: "Sessão encerrada com sucesso." });
    } catch (error) {
        return next(error);
    }
}

async function forgotPassword(request, response, next) {

    try {

        const { email } = request.body;

        if (!email) {

            return response.status(400).json({
                success: false,
                message: "Informe seu e-mail."
            });

        }

        const empresaIdResult = await db.query(
            "SELECT get_petflow_empresa_id() AS id"
        );

        const empresaId = empresaIdResult.rows[0].id;

        const { rows } = await db.query(
            `
                SELECT
                    c.id,
                    c.nome,
                    c.email,
                    uc.ativo AS usuario_ativo
                FROM clientes c
                INNER JOIN usuarios_clientes uc
                    ON uc.cliente_id = c.id
                WHERE LOWER(c.email) = LOWER($1)
                  AND c.empresa_id = $2
                  AND c.ativo = TRUE
                LIMIT 1
            `,
            [
                email,
                empresaId
            ]
        );

        const cliente = rows[0];

        if (
            !cliente ||
            !cliente.usuario_ativo
        ) {

            return response.status(200).json({
                success: true,
                message: "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação."
            });

        }

        const token = crypto
            .randomBytes(32)
            .toString("hex");

        const expiresAt = new Date(
            Date.now() + 1000 * 60 * 30
        );

        await db.query(
            `
                UPDATE usuarios_clientes
                SET
                    token_recuperacao = $1,
                    token_expiracao = $2,
                    updated_at = NOW()
                WHERE cliente_id = $3
            `,
            [
                token,
                expiresAt,
                cliente.id
            ]
        );

        const resetUrl =
            `${APP_URL}/redefinir-senha?token=${token}`;

        const template = passwordResetTemplate({
            name: cliente.nome,
            resetUrl
        });

        await sendEmail({
            to: cliente.email,
            subject: template.subject,
            html: template.html,
            text: template.text
        });

        return response.status(200).json({
            success: true,
            message: "Enviamos as instruções de recuperação para seu e-mail."
        });

    } catch (error) {

        return next(error);

    }

}

async function resendVerification(request, response, next) {
    try {
        const email = String(request.body?.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return response.status(400).json({ success: false, message: "Informe um e-mail válido." });
        }
        assertEmailConfigured();
        await db.transaction(async client => {
            const { rows } = await client.query(`
                SELECT uc.cliente_id, uc.token_verificacao_email, uc.token_verificacao_expiracao, c.nome
                FROM usuarios_clientes uc JOIN clientes c ON c.id = uc.cliente_id
                WHERE LOWER(uc.email) = $1 AND NOT uc.email_verificado
                  AND uc.ativo = TRUE AND c.ativo = TRUE
                FOR UPDATE OF uc
            `, [email]);
            if (!rows[0]) return;
            const account = rows[0];
            const token = account.token_verificacao_email && new Date(account.token_verificacao_expiracao) > new Date()
                ? account.token_verificacao_email : crypto.randomBytes(32).toString("hex");
            await client.query(`UPDATE usuarios_clientes
                SET token_verificacao_email = $1, token_verificacao_expiracao = NOW() + INTERVAL '24 hours'
                WHERE cliente_id = $2`, [token, account.cliente_id]);
            const template = emailVerificationTemplate({ name: account.nome, verifyUrl: `${APP_URL}/login?verificar_email=${token}` });
            await sendEmail({ to: email, ...template, idempotencyKey: `verification-resend/${token}/${Math.floor(Date.now() / 900000)}` });
        });
        return response.json({ success: true, message: "Se houver uma conta aguardando confirmação, enviaremos o link para esse e-mail." });
    } catch (error) { return next(error); }
}

async function verifyEmail(request, response, next) {

    try {

        const token = String(
            request.query?.token ||
            request.body?.token ||
            ""
        ).trim();

        if (!token) {

            return response.status(400).json({
                success: false,
                message: "Link de confirmação inválido."
            });

        }

        const { rowCount } = await db.query(
            `
                UPDATE usuarios_clientes
                SET
                    email_verificado = TRUE,
                    token_verificacao_email = NULL,
                    token_verificacao_expiracao = NULL,
                    updated_at = NOW()
                WHERE token_verificacao_email = $1
                  AND token_verificacao_expiracao > NOW()
                  AND ativo = TRUE
            `,
            [token]
        );

        if (!rowCount) {

            return response.status(400).json({
                success: false,
                message: "Link de confirmação inválido ou expirado."
            });

        }

        return response.status(200).json({
            success: true,
            message: "E-mail confirmado com sucesso. Você já pode entrar."
        });

    } catch (error) {

        return next(error);

    }

}

async function resetPassword(request, response, next) {

    try {

        const {
            token,
            senha
        } = request.body;

        if (
            !token ||
            !senha ||
            String(senha).length < 8 ||
            Buffer.byteLength(String(senha), "utf8") > 72
        ) {

            return response.status(400).json({
                success: false,
                message: "Informe o token e uma senha entre 8 e 72 caracteres."
            });

        }

        const { rows } = await db.query(
            `
                SELECT
                    cliente_id
                FROM usuarios_clientes
                WHERE token_recuperacao = $1
                  AND token_expiracao > NOW()
                  AND ativo = TRUE
                LIMIT 1
            `,
            [token]
        );

        const usuarioCliente = rows[0];

        if (!usuarioCliente) {

            return response.status(400).json({
                success: false,
                message: "Link inválido ou expirado."
            });

        }

        const senhaHash = await bcrypt.hash(
            senha,
            10
        );

        await db.query(
            `
                UPDATE usuarios_clientes
                SET
                    senha_hash = $1,
                    token_recuperacao = NULL,
                    token_expiracao = NULL,
                    sessao_versao = sessao_versao + 1,
                    updated_at = NOW()
                WHERE cliente_id = $2
            `,
            [
                senhaHash,
                usuarioCliente.cliente_id
            ]
        );

        return response.status(200).json({
            success: true,
            message: "Senha redefinida com sucesso."
        });

    } catch (error) {

        return next(error);

    }

}

async function me(request, response, next) {

    try {

        const customer = getAuthenticatedCustomer(
            request,
            response
        );

        if (!customer) {

            return;

        }

        const profile = await getProfileById(
            customer.id,
            customer.empresaId
        );

        if (!profile) {

            return response.status(404).json({
                success: false,
                message: "Cliente não encontrado."
            });

        }

        return response.status(200).json({
            success: true,
            data: profile
        });

    } catch (error) {

        return next(error);

    }

}

async function update(request, response, next) {

    try {

        const data = request.body;

        const customer = getAuthenticatedCustomer(
            request,
            response
        );

        if (!customer) {

            return;

        }

        if (!hasRequiredProfileData(data)) {

            return response.status(400).json({
                success: false,
                message: "Informe nome, WhatsApp e endereço de entrega."
            });

        }

        const duplicate = await findDuplicateCustomer({
            cpf: data.cpf,
            telefone: data.telefone,
            whatsapp: data.whatsapp,
            excludeId: customer.id,
            empresaId: customer.empresaId
        });

        if (duplicate) {

            return response.status(409).json({
                success: false,
                message: duplicateCustomerMessage(duplicate.field)
            });

        }

        await db.query(
            `
                UPDATE clientes
                SET
                    nome = $1,
                    cpf = $2,
                    telefone = $3,
                    whatsapp = $3,
                    cep = $4,
                    endereco = $5,
                    numero = $6,
                    complemento = $7,
                    bairro = $8,
                    cidade = $9,
                    estado = $10,
                    data_nascimento = $11,
                    updated_at = NOW()
                WHERE id = $12
                  AND empresa_id = $13
            `,
            [
                data.nome,
                formatCpf(data.cpf),
                data.telefone,
                data.cep || null,
                data.endereco || null,
                data.numero || null,
                data.complemento || null,
                data.bairro || null,
                data.cidade || null,
                data.estado || null,
                data.data_nascimento || data.dataNascimento || null,
                customer.id,
                customer.empresaId
            ]
        );

        const profile = await getProfileById(
            customer.id,
            customer.empresaId
        );

        return response.status(200).json({
            success: true,
            message: "Dados atualizados com sucesso.",
            data: profile
        });

    } catch (error) {

        return next(error);

    }

}

async function remove(request, response, next) {

    const client = await db.connect();

    try {

        const customer = getAuthenticatedCustomer(
            request,
            response
        );

        if (!customer) {

            return;

        }

        await client.query("BEGIN");

        const profile = await getProfileById(
            customer.id,
            customer.empresaId
        );

        const activeOrders = await client.query(
            `SELECT COUNT(*)::int AS total FROM vendas
             WHERE empresa_id=$1 AND cliente_id=$2
               AND status IN ('AGUARDANDO_PAGAMENTO','PAGAMENTO_APROVADO','EM_SEPARACAO','SAIU_PARA_ENTREGA')`,
            [customer.empresaId, customer.id]
        );
        if (activeOrders.rows[0].total > 0) {
            const protocoloPendente = buildLgpdProtocol();
            await client.query(
                `INSERT INTO lgpd_solicitacoes (protocolo,empresa_id,cliente_id,email_referencia,tipo,detalhes)
                 VALUES ($1,$2,$3,$4,'EXCLUSAO','Exclusão aguardando conclusão dos pedidos ativos.')`,
                [protocoloPendente, customer.empresaId, customer.id, profile?.email || customer.email || null]
            );
            await client.query("COMMIT");
            return response.status(202).json({ success: true, pending: true, protocolo: protocoloPendente,
                message: "Solicitação registrada. A conta será analisada após a conclusão dos pedidos em andamento." });
        }

        const protocolo = buildLgpdProtocol();
        await client.query(
            `INSERT INTO lgpd_solicitacoes
             (protocolo,empresa_id,cliente_id,email_referencia,tipo,status,detalhes,resposta,atendida_em)
             VALUES ($1,$2,$3,$4,'EXCLUSAO','ATENDIDA','Exclusão solicitada pela área autenticada.',
             'Conta removida e dados operacionais não obrigatórios eliminados.',NOW())`,
            [protocolo, customer.empresaId, customer.id, profile?.email || customer.email || null]
        );

        await client.query(
            `
                DELETE FROM newsletter_inscritos
                WHERE empresa_id = $1
                  AND LOWER(email) = LOWER($2)
            `,
            [
                customer.empresaId,
                profile?.email || customer.email || ""
            ]
        );



        await client.query(
            `
                UPDATE vendas
                SET
                    cliente_id = NULL,
                    endereco_entrega = jsonb_build_object('anonimizado', TRUE),
                    updated_at = NOW()
                WHERE empresa_id = $1
                  AND cliente_id = $2
            `,
            [
                customer.empresaId,
                customer.id
            ]
        );

        await client.query(
            `
                DELETE FROM usuarios_clientes
                WHERE cliente_id = $1
            `,
            [
                customer.id
            ]
        );

        await client.query(
            `
                DELETE FROM clientes
                WHERE id = $1
                  AND empresa_id = $2
            `,
            [
                customer.id,
                customer.empresaId
            ]
        );

        await client.query("COMMIT");

        return response.status(200).json({
            success: true,
            protocolo,
            message: "Cadastro excluído e dados pessoais não necessários removidos com sucesso."
        });

    } catch (error) {

        await client.query("ROLLBACK");
        return next(error);

    } finally {

        client.release();

    }

}

async function exportData(request, response, next) {
    try {
        const customer = getAuthenticatedCustomer(request, response);
        if (!customer) return;
        const [profile, ordersResult, notices, consents, requests, consumerRequests] = await Promise.all([
            getProfileById(customer.id, customer.empresaId),
            db.query(`SELECT id,data_venda,valor_total,desconto,valor_frete,valor_final,forma_pagamento,
                      status,endereco_entrega,observacoes,cupom_codigo,created_at,updated_at
                      FROM vendas WHERE empresa_id=$1 AND cliente_id=$2 ORDER BY data_venda DESC`,
                [customer.empresaId, customer.id]),
            db.query(`SELECT titulo,mensagem,tipo,lida,enviada_em FROM notificacoes
                      WHERE cliente_id=$1 ORDER BY enviada_em DESC`, [customer.id]),
            db.query(`SELECT finalidade,versao,concedido,origem,created_at FROM lgpd_consentimentos
                      WHERE empresa_id=$1 AND cliente_id=$2 ORDER BY created_at DESC`,
                [customer.empresaId, customer.id]),
            db.query(`SELECT protocolo,tipo,status,detalhes,resposta,solicitada_em,prazo_em,atendida_em
                      FROM lgpd_solicitacoes WHERE empresa_id=$1 AND cliente_id=$2 ORDER BY solicitada_em DESC`,
                [customer.empresaId, customer.id]),
            db.query(`SELECT protocolo,venda_id,tipo,status,motivo,resposta,solicitada_em,prazo_em,atendida_em
                      FROM solicitacoes_consumidor WHERE empresa_id=$1 AND cliente_id=$2 ORDER BY solicitada_em DESC`,
                [customer.empresaId, customer.id])
        ]);
        response.set("Cache-Control", "no-store");
        response.set("Content-Disposition", `attachment; filename="petflow-meus-dados-${new Date().toISOString().slice(0,10)}.json"`);
        return response.json({ geradoEm: new Date().toISOString(), titular: profile,
            pedidos: ordersResult.rows, notificacoes: notices.rows,
            consentimentos: consents.rows, solicitacoes: requests.rows,
            solicitacoesAtendimento: consumerRequests.rows });
    } catch (error) { return next(error); }
}

async function createLgpdRequest(request, response, next) {
    try {
        const customer = getAuthenticatedCustomer(request, response);
        if (!customer) return;
        const tipo = String(request.body?.tipo || "").toUpperCase();
        const allowed = ["ACESSO","CORRECAO","ANONIMIZACAO","EXCLUSAO","PORTABILIDADE","REVOGACAO","INFORMACAO"];
        if (!allowed.includes(tipo)) return response.status(400).json({ success: false, message: "Tipo de solicitação inválido." });
        const details = String(request.body?.detalhes || "").trim().slice(0, 1000);
        if (details.length < 5) return response.status(400).json({ success: false, message: "Descreva sua solicitação." });
        const profile = await getProfileById(customer.id, customer.empresaId);
        const protocolo = buildLgpdProtocol();
        const result = await db.transaction(async client => {
            const { rows } = await client.query(
            `INSERT INTO lgpd_solicitacoes
             (protocolo,empresa_id,cliente_id,email_referencia,tipo,detalhes)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING protocolo,tipo,status,solicitada_em,prazo_em`,
            [protocolo, customer.empresaId, customer.id, profile?.email || customer.email, tipo, details]
        );
        if (tipo === "REVOGACAO") {
            await client.query("DELETE FROM newsletter_inscritos WHERE empresa_id=$1 AND LOWER(email)=LOWER($2)",
                [customer.empresaId, profile?.email || customer.email]);
            await client.query(
                `INSERT INTO lgpd_consentimentos
                 (empresa_id,cliente_id,finalidade,versao,concedido,origem,ip_hash,user_agent_hash)
                 VALUES ($1,$2,'MARKETING',$3,FALSE,'AREA_CLIENTE',$4,$5)`,
                [customer.empresaId, customer.id, PRIVACY_VERSION, digest(request.ip), digest(request.get("user-agent"))]
            );
        }
            return rows[0];
        });
        return response.status(201).json({ success: true, message: "Solicitação registrada com sucesso.", data: result });
    } catch (error) { return next(error); }
}

async function listLgpdRequests(request, response, next) {
    try {
        const customer = getAuthenticatedCustomer(request, response);
        if (!customer) return;
        const { rows } = await db.query(
            `SELECT protocolo,tipo,status,detalhes,resposta,solicitada_em,prazo_em,atendida_em
             FROM lgpd_solicitacoes
             WHERE empresa_id=$1 AND cliente_id=$2
             ORDER BY solicitada_em DESC`,
            [customer.empresaId, customer.id]
        );
        response.set("Cache-Control", "no-store");
        return response.json({ success: true, data: rows });
    } catch (error) { return next(error); }
}

function buildLgpdProtocol() {
    return `LGPD-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function createConsumerRequest(request, response, next) {
    try {
        const customer = getAuthenticatedCustomer(request, response);
        if (!customer) return;
        const vendaId = String(request.params.id || "");
        if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vendaId)) {
            return response.status(400).json({ success: false, message: "Pedido inválido." });
        }
        const tipo = String(request.body?.tipo || "").toUpperCase();
        if (!["CANCELAMENTO", "ARREPENDIMENTO", "DEVOLUCAO", "RECLAMACAO"].includes(tipo)) {
            return response.status(400).json({ success: false, message: "Tipo de solicitação inválido." });
        }
        const motivo = String(request.body?.motivo || "").trim().slice(0, 1000);
        if (motivo.length < 5) {
            return response.status(400).json({ success: false, message: "Explique o motivo da solicitação." });
        }

        const { rows } = await db.query(
            `SELECT v.*,c.nome AS cliente_nome,c.email AS cliente_email,
                    r.latitude,r.longitude,r.precisao_m,r.atualizado_em,r.rota
             FROM vendas v JOIN clientes c ON c.id=v.cliente_id AND c.empresa_id=v.empresa_id
             LEFT JOIN entrega_rastreamento r ON r.venda_id=v.id AND r.expira_em>NOW()
             WHERE v.id=$1 AND v.empresa_id=$2 AND v.cliente_id=$3 LIMIT 1`,
            [vendaId, customer.empresaId, customer.id]
        );
        const order = rows[0];
        if (!order) return response.status(404).json({ success: false, message: "Pedido não encontrado." });
        if (order.status === "CANCELADA" && tipo !== "RECLAMACAO") {
            return response.status(409).json({ success: false, message: "Este pedido já está cancelado. Use Reclamação se precisar de atendimento." });
        }
        const delivered = ["ENTREGUE", "FINALIZADA"].includes(order.status);
        if (tipo === "CANCELAMENTO" && delivered) {
            return response.status(400).json({ success: false, message: "Para um pedido entregue, escolha arrependimento ou devolução." });
        }
        if (tipo === "DEVOLUCAO" && !delivered) {
            return response.status(400).json({ success: false, message: "Antes da entrega, solicite o cancelamento do pedido." });
        }
        if (tipo === "ARREPENDIMENTO" && delivered &&
            Date.now() - new Date(order.entregue_em || order.updated_at || order.data_venda).getTime() > 7 * 86400000) {
            return response.status(409).json({ success: false,
                message: "O prazo de 7 dias para arrependimento terminou. Use Reclamação para solicitar análise da loja." });
        }
        const cancellation = avaliarCancelamento(order);
        if (tipo === "CANCELAMENTO" && !cancellation.permitido) {
            return response.status(409).json({ success: false,
                message: `${cancellation.mensagem} Você ainda pode registrar arrependimento ou reclamação para análise da loja.`,
                data: { cancelamento: cancellation } });
        }

        const existing = await db.query(
            `SELECT * FROM solicitacoes_consumidor WHERE empresa_id=$1 AND venda_id=$2
             AND status IN ('RECEBIDA','EM_ANALISE') ORDER BY solicitada_em DESC LIMIT 1`,
            [customer.empresaId, vendaId]
        );
        if (existing.rows[0]) {
            return response.status(200).json({ success: true,
                message: "A loja já recebeu uma solicitação para este pedido.", data: existing.rows[0] });
        }

        const protocolo = buildConsumerProtocol();
        let item;
        try {
            const inserted = await db.query(
                `INSERT INTO solicitacoes_consumidor
                 (protocolo,empresa_id,cliente_id,venda_id,email_referencia,tipo,motivo)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                [protocolo, customer.empresaId, customer.id, vendaId,
                    order.cliente_email || customer.email || null, tipo, motivo]
            );
            item = inserted.rows[0];
        } catch (error) {
            if (error.code !== "23505") throw error;
            const concurrent = await db.query(
                `SELECT * FROM solicitacoes_consumidor WHERE empresa_id=$1 AND venda_id=$2
                 AND status IN ('RECEBIDA','EM_ANALISE') ORDER BY solicitada_em DESC LIMIT 1`,
                [customer.empresaId, vendaId]
            );
            item = concurrent.rows[0];
            if (!item) {
                const conflict = new Error("Não foi possível gerar o protocolo. Tente novamente.");
                conflict.statusCode = 409;
                throw conflict;
            }
        }

        let automatic = false;
        if (!delivered && cancellation.permitido && ["CANCELAMENTO", "ARREPENDIMENTO"].includes(tipo)) {
            try {
                const canceled = await VendaService.cancelarPedido(customer.empresaId, vendaId, {
                    motivo: `Solicitação do cliente ${item.protocolo}: ${motivo}`
                });
                if (canceled?.status === "CANCELADA") {
                    automatic = true;
                    const updated = await db.query(
                        `UPDATE solicitacoes_consumidor SET status='ATENDIDA',
                         resposta='Pedido cancelado. Quando aplicável, o estorno foi solicitado ao PagBank.',
                         atendida_em=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`, [item.id]
                    );
                    item = updated.rows[0];
                }
            } catch (error) {
                console.warn("[atendimento] cancelamento automático pendente", { protocolo: item.protocolo, code: error.code || error.status });
            }
        }

        if (!automatic) {
            await createCustomerNotification({ clienteId: customer.id,
                titulo: "Solicitação recebida",
                mensagem: `Protocolo ${item.protocolo}. A loja responderá pelo site e pelo e-mail cadastrado.`,
                tipo: "ATENDIMENTO" });
        }
        await sendOptionalEmail({
            to: order.cliente_email || customer.email,
            subject: `Solicitação recebida ${item.protocolo} - PetFlow`,
            text: `Recebemos sua solicitação sobre o pedido #${vendaId.slice(0,8).toUpperCase()}. Protocolo: ${item.protocolo}. ${automatic ? "O pedido foi cancelado." : "A loja responderá em até 5 dias."}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px"><h1>Solicitação recebida</h1><p>Protocolo: <strong>${escapeHtml(item.protocolo)}</strong></p><p>Pedido #${escapeHtml(vendaId.slice(0,8).toUpperCase())}</p><p>${automatic ? "O pedido foi cancelado e o estorno foi solicitado quando aplicável." : "A loja responderá em até 5 dias."}</p></div>`,
            idempotencyKey: `atendimento/${item.id}/recebida`
        });
        return response.status(automatic ? 200 : 201).json({ success: true,
            message: automatic ? "Pedido cancelado com sucesso." : "Solicitação recebida e encaminhada à loja.",
            data: item });
    } catch (error) { return next(error); }
}

function buildConsumerProtocol() {
    return `ATD-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function orders(request, response, next) {

    try {

        const customer = getAuthenticatedCustomer(
            request,
            response
        );

        if (!customer) {

            return;

        }

        const { rows } = await db.query(
            `
                SELECT
                    v.id,
                    v.status,
                    CASE
                        WHEN v.pagseguro_response #>> '{charges,0,payment_method,type}' = 'CREDIT_CARD'
                            THEN 'CARTAO_CREDITO'
                        WHEN v.pagseguro_response #>> '{charges,0,payment_method,type}' = 'DEBIT_CARD'
                            THEN 'CARTAO_DEBITO'
                        WHEN v.pagseguro_response #>> '{charges,0,payment_method,type}' = 'PIX'
                            THEN 'PIX'
                        ELSE v.forma_pagamento
                    END AS forma_pagamento,
                    v.pagseguro_checkout_id,
                    v.pagseguro_checkout_url,
                    v.pagseguro_status,
                    v.pagamento_atualizado_em,
                    v.valor_total,
                      v.valor_final,
                      v.valor_frete,
                      v.endereco_entrega,
                    v.data_venda,
                    v.observacoes,
                    c.endereco,
                    c.numero,
                    c.complemento,
                    c.bairro,
                    c.cidade,
                    c.estado,
                    COALESCE(
                        JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'produto', COALESCE(
                                    p.nome,
                                    'Produto'
                                ),
                                'quantidade', iv.quantidade,
                                'preco_unitario', COALESCE(
                                    iv.preco_unitario,
                                    0
                                ),
                                'subtotal', iv.subtotal
                            )
                            ORDER BY p.nome
                        ) FILTER (
                            WHERE iv.id IS NOT NULL
                        ),
                        '[]'::JSON
                    ) AS itens
                FROM vendas v
                LEFT JOIN clientes c
                    ON c.id = v.cliente_id
                   AND c.empresa_id = v.empresa_id
                LEFT JOIN itens_venda iv
                    ON iv.venda_id = v.id
                   AND iv.empresa_id = v.empresa_id
                LEFT JOIN produtos p
                    ON p.id = iv.produto_id
                   AND p.empresa_id = v.empresa_id
                WHERE v.cliente_id = $1
                  AND v.empresa_id = $2
                GROUP BY
                    v.id,
                    c.id
                ORDER BY v.data_venda DESC
                LIMIT 50
            `,
            [
                customer.id,
                customer.empresaId
            ]
        );

        const { rows: requests } = await db.query(
            `SELECT DISTINCT ON (venda_id) id,protocolo,venda_id,tipo,status,motivo,resposta,
                    solicitada_em,prazo_em,atendida_em
             FROM solicitacoes_consumidor
             WHERE empresa_id=$1 AND cliente_id=$2
             ORDER BY venda_id,solicitada_em DESC`,
            [customer.empresaId, customer.id]
        );
        const requestByOrder = new Map(requests.map(item => [String(item.venda_id), item]));
        const { rows: trackingRows } = await db.query(
            `SELECT venda_id,latitude,longitude,precisao_m,atualizado_em,rota
             FROM entrega_rastreamento WHERE venda_id=ANY($1::uuid[]) AND expira_em>NOW()`,
            [rows.map(order => order.id)]
        );
        const trackingByOrder = new Map(trackingRows.map(item => [String(item.venda_id), item]));
        rows.forEach(order => {
            order.solicitacao = requestByOrder.get(String(order.id)) || null;
            const cancellation = avaliarCancelamento({ ...order, ...(trackingByOrder.get(String(order.id)) || {}) });
            order.cancelamento_disponivel = cancellation.permitido;
            order.cancelamento_mensagem = cancellation.mensagem;
            order.distancia_destino_m = cancellation.distanciaMetros;
        });

        return response.status(200).json({
            success: true,
            data: rows
        });

    } catch (error) {

        return next(error);

    }

}

async function notifications(request, response, next) {

    try {

        const customer = getAuthenticatedCustomer(
            request,
            response
        );

        if (!customer) {

            return;

        }

        const { rows } = await db.query(
            `
                SELECT
                    id,
                    titulo,
                    mensagem,
                    tipo,
                    lida,
                    venda_id,
                    status_pedido,
                    enviada_em
                FROM notificacoes
                WHERE cliente_id = $1
                  AND EXISTS (
                      SELECT 1
                      FROM clientes c
                      WHERE c.id = notificacoes.cliente_id
                        AND c.empresa_id = $2
                  )
                ORDER BY enviada_em DESC
                LIMIT 100
            `,
            [
                customer.id,
                customer.empresaId
            ]
        );

        return response.status(200).json({
            success: true,
            data: rows
        });

    } catch (error) {

        return next(error);

    }

}

async function markNotificationRead(request, response, next) {

    try {
        const ids = request.body?.ids;
        if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))) {
            return response.status(400).json({ success: false, message: "Notificações inválidas." });
        }

        const customer = getAuthenticatedCustomer(
            request,
            response
        );

        if (!customer) {

            return;

        }

        await db.query(
            `
                UPDATE notificacoes
                SET
                    lida = TRUE,
                    data_leitura = COALESCE(data_leitura, NOW()),
                    updated_at = NOW()
                WHERE cliente_id = $1
                  AND EXISTS (
                      SELECT 1
                      FROM clientes c
                      WHERE c.id = notificacoes.cliente_id
                        AND c.empresa_id = $3
                  )
                  AND (
                      $2::uuid IS NULL
                      OR id = $2
                  )
                  AND ($4::uuid[] IS NULL OR id = ANY($4::uuid[]))
            `,
            [
                customer.id,
                request.params.id || null,
                customer.empresaId,
                ids || null
            ]
        );

        return response.status(200).json({
            success: true,
            message: "Notificação marcada como lida."
        });

    } catch (error) {

        return next(error);

    }

}

async function getProfileById(id, empresaId, executor = db) {

    const { rows } = await executor.query(
        `
            SELECT
                id,
                empresa_id,
                nome,
                cpf,
                email,
                telefone,
                whatsapp,
                cep,
                endereco,
                numero,
                complemento,
                bairro,
                cidade,
                estado,
                data_nascimento
            FROM clientes
            WHERE id = $1
              AND empresa_id = $2
            LIMIT 1
        `,
        [
            id,
            empresaId
        ]
    );

    return rows[0] || null;

}

function buildAuthPayload(cliente) {

    const user = {
        id: cliente.id,
        empresaId: cliente.empresa_id,
        nome: cliente.nome,
        cpf: cliente.cpf,
        email: cliente.email,
        telefone: cliente.telefone,
        cep: cliente.cep,
        endereco: cliente.endereco,
        numero: cliente.numero,
        complemento: cliente.complemento,
        bairro: cliente.bairro,
        cidade: cliente.cidade,
        estado: cliente.estado,
        data_nascimento: cliente.data_nascimento
    };

    const token = jwt.sign(
        {
            type: "customer",
            id: cliente.id,
            empresaId: cliente.empresa_id,
            email: cliente.email,
            nome: cliente.nome,
            sv: Number(cliente.sessao_versao)
        },
        JWT_SECRET,
        {
            expiresIn: JWT_EXPIRES_IN
        }
    );

    return {
        token,
        user
    };

}

function getAuthenticatedCustomer(request, response) {

    const id = request.customer?.id;
    const empresaId = request.customer?.empresaId;

    if (
        !id ||
        !empresaId
    ) {

        response.status(401).json({
            success: false,
            message: "Sessão inválida. Faça login novamente."
        });

        return null;

    }

    return {
        id,
        empresaId
    };

}

/* ==================================================
   VALIDAÇÕES
================================================== */

function hasRequiredRegistrationData(data) {

    return Boolean(
        hasRequiredProfileData(data) &&
        typeof data.email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) &&
        data.email.length <= 150 &&
        typeof data.senha === "string" &&
        Buffer.byteLength(data.senha, "utf8") <= 72 &&
        hasText(data.senha) &&
        String(data.senha).length >= 8
    );

}

function hasRequiredProfileData(data) {

    return Boolean(
        hasText(data?.nome) &&
        isValidCpf(data?.cpf) &&
        hasText(data?.telefone) &&
        hasRequiredAddressData(data)
    );

}

function hasRequiredAddressData(data) {

    return Boolean(
        hasText(data?.cep) &&
        hasText(data?.endereco) &&
        hasText(data?.numero) &&
        hasText(data?.bairro) &&
        hasText(data?.cidade) &&
        hasText(data?.estado)
    );

}

function hasText(value) {

    return (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );

}

function onlyDigits(value) {

    return String(value || "")
        .replace(/\D/g, "");

}

function isValidCpf(value) {

    return /^\d{11}$/.test(onlyDigits(value));

}

function formatCpf(value) {

    const digits = onlyDigits(value);

    if (!isValidCpf(digits)) {

        return null;

    }

    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;

}

async function findDuplicateCustomer({
    cpf,
    telefone,
    whatsapp,
    excludeId,
    empresaId
}) {

    const normalizedCpf = onlyDigits(cpf);
    const normalizedTelefone = onlyDigits(telefone);
    const normalizedWhatsapp = onlyDigits(whatsapp);

    const { rows } = await db.query(
        `
            SELECT
                id,
                CASE
                    WHEN $1 <> ''
                     AND REGEXP_REPLACE(COALESCE(cpf, ''), '\\D', '', 'g') = $1 THEN 'cpf'
                    WHEN $4 <> ''
                     AND (
                        REGEXP_REPLACE(COALESCE(telefone, ''), '\\D', '', 'g') = $4
                        OR REGEXP_REPLACE(COALESCE(whatsapp, ''), '\\D', '', 'g') = $4
                     ) THEN 'telefone'
                    WHEN $5 <> ''
                     AND (
                        REGEXP_REPLACE(COALESCE(telefone, ''), '\\D', '', 'g') = $5
                        OR REGEXP_REPLACE(COALESCE(whatsapp, ''), '\\D', '', 'g') = $5
                     ) THEN 'whatsapp'
                    ELSE NULL
                END AS field
            FROM clientes
            WHERE id <> $2
              AND (
                  empresa_id = $3
                  OR empresa_id = get_petflow_empresa_id()
                  OR empresa_id IS NULL
              )
              AND (
                  (
                      $1 <> ''
                      AND REGEXP_REPLACE(COALESCE(cpf, ''), '\\D', '', 'g') = $1
                  )
                  OR (
                      $4 <> ''
                      AND (
                          REGEXP_REPLACE(COALESCE(telefone, ''), '\\D', '', 'g') = $4
                          OR REGEXP_REPLACE(COALESCE(whatsapp, ''), '\\D', '', 'g') = $4
                      )
                  )
                  OR (
                      $5 <> ''
                      AND (
                          REGEXP_REPLACE(COALESCE(telefone, ''), '\\D', '', 'g') = $5
                          OR REGEXP_REPLACE(COALESCE(whatsapp, ''), '\\D', '', 'g') = $5
                      )
                  )
              )
            LIMIT 1
        `,
        [
            normalizedCpf,
            excludeId,
            empresaId,
            normalizedTelefone,
            normalizedWhatsapp
        ]
    );

    return rows[0] || null;

}

function duplicateCustomerMessage(field) {

    const messages = {
        cpf: "Esse CPF já está cadastrado.",
        telefone: "Esse telefone já está cadastrado.",
        whatsapp: "Esse celular já está cadastrado.",
        email: "Esse e-mail já está cadastrado. Entre ou use Reenviar confirmação de e-mail."
    };

    return messages[field] || messages.email;

}

async function createCustomerNotification({ clienteId, titulo, mensagem, tipo }, executor = db) {

    await executor.query(
        `
            INSERT INTO notificacoes (
                cliente_id,
                titulo,
                mensagem,
                tipo
            )
            VALUES ($1, $2, $3, $4)
        `,
        [
            clienteId,
            titulo,
            mensagem,
            tipo || "SISTEMA"
        ]
    );

}

function firstName(name) {

    return String(name || "Cliente").trim().split(/\s+/)[0] || "Cliente";

}

function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {
    register,
    login,
    logout,
    forgotPassword,
    verifyEmail,
    resendVerification,
    resetPassword,
    me,
    update,
    remove,
    exportData,
    createLgpdRequest,
    listLgpdRequests,
    createConsumerRequest,
    orders,
    notifications,
    markNotificationRead
};
