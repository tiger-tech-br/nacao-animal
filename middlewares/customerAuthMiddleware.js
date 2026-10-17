"use strict";

const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");
const db = require("../database/connection");

async function customerAuthMiddleware(request, response, next) {
    const authorization = request.headers.authorization;

    if (!authorization) {
        return response.status(401).json({
            success: false,
            message: "Faça login para continuar."
        });
    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
        return response.status(401).json({
            success: false,
            message: "Sessão inválida."
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        if (decoded.type !== "customer") {
            return response.status(403).json({
                success: false,
                message: "Acesso exclusivo para clientes."
            });
        }

        const { rows } = await db.query(
            `SELECT c.id,c.empresa_id,c.nome,COALESCE(c.email,uc.email) AS email,uc.sessao_versao
             FROM clientes c
             JOIN usuarios_clientes uc ON uc.cliente_id=c.id
             WHERE c.id=$1 AND c.empresa_id=$2 AND c.ativo=TRUE AND uc.ativo=TRUE
             LIMIT 1`,
            [decoded.id, decoded.empresaId]
        );
        const current = rows[0];
        if (!current || Number(decoded.sv) !== Number(current.sessao_versao)) {
            return response.status(401).json({
                success: false,
                message: "Sessão encerrada. Faça login novamente."
            });
        }

        request.customer = {
            type: "customer",
            id: current.id,
            empresaId: current.empresa_id,
            email: current.email,
            nome: current.nome,
            sv: Number(current.sessao_versao)
        };
        next();
    } catch {
        return response.status(401).json({
            success: false,
            message: "Sessão expirada. Faça login novamente."
        });
    }
}

module.exports = customerAuthMiddleware;
