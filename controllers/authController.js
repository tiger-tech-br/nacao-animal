"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const authModel = require("../models/authModel");
const {
    JWT_SECRET,
    JWT_EXPIRES_IN,
    APP_URL
} = require("../config/env");
const {
    sendEmail,
    passwordResetTemplate
} = require("../services/emailService");

async function login(request, response, next) {
    try {
        const { email } = request.body;
        const senha = request.body.senha || request.body.password;

        const usuario = await authModel.findByEmail(email);

        if (!usuario || !usuario.status) {
            return response.status(401).json({
                success: false,
                message: "E-mail ou senha inválidos."
            });
        }

        const senhaValida = await bcrypt.compare(
            senha,
            usuario.senha
        );

        if (!senhaValida) {
            return response.status(401).json({
                success: false,
                message: "E-mail ou senha inválidos."
            });
        }

        await authModel.updateLastLogin(usuario.id);

        const payload = {
            id: usuario.id,
            empresaId: usuario.empresa_id,
            empresa_id: usuario.empresa_id,
            nome: usuario.nome,
            email: usuario.email,
            cargo: usuario.cargo,
            perfil: usuario.cargo,
            sv: Number(usuario.sessao_versao)
        };

        const token = jwt.sign(
            payload,
            JWT_SECRET,
            {
                expiresIn: JWT_EXPIRES_IN
            }
        );

        return response.status(200).json({
            success: true,
            message: "Login realizado com sucesso.",
            data: {
                token,
                user: payload
            }
        });
    } catch (error) {
        next(error);
    }
}

async function me(request, response, next) {
    try {
        return response.status(200).json({
            success: true,
            data: request.user
        });
    } catch (error) {
        next(error);
    }
}

async function logout(request, response, next) {
    try {
        await authModel.revokeSessions(request.user.id);
        return response.status(200).json({
            success: true,
            message: "Logout realizado com sucesso."
        });
    } catch (error) {
        next(error);
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

        const usuario = await authModel.findByEmail(email);

        if (!usuario || !usuario.status) {
            return response.status(200).json({
                success: true,
                message: "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação."
            });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

        await authModel.setPasswordResetToken(
            usuario.id,
            token,
            expiresAt
        );

        const template = passwordResetTemplate({
            name: usuario.nome,
            resetUrl: `${APP_URL}/redefinir-senha?tipo=admin&token=${token}`
        });

        await sendEmail({
            to: usuario.email,
            subject: template.subject,
            html: template.html,
            text: template.text
        });

        return response.status(200).json({
            success: true,
            message: "Enviamos as instruções de recuperação para seu e-mail."
        });
    } catch (error) {
        next(error);
    }
}

async function resetPassword(request, response, next) {
    try {
        const { token, senha } = request.body;

        if (!token || !senha || String(senha).length < 8 || Buffer.byteLength(String(senha), "utf8") > 72) {
            return response.status(400).json({
                success: false,
                message: "Informe o token e uma senha entre 8 e 72 caracteres."
            });
        }

        const usuario = await authModel.findByPasswordResetToken(token);

        if (!usuario) {
            return response.status(400).json({
                success: false,
                message: "Link inválido ou expirado."
            });
        }

        const senhaHash = await bcrypt.hash(senha, 10);

        await authModel.updatePassword(usuario.id, senhaHash);

        return response.status(200).json({
            success: true,
            message: "Senha redefinida com sucesso."
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    login,
    me,
    logout,
    forgotPassword,
    resetPassword
};
