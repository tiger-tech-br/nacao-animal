"use strict";

/* ==================================================
   JWT
================================================== */

const jwt = require("jsonwebtoken");
const db = require("../database/connection");

/* ==================================================
   ENV
================================================== */

const { JWT_SECRET } = require("../config/env");

/* ==================================================
   AUTENTICAÇÃO
================================================== */

async function authMiddleware(request, response, next) {

    const authorization = request.headers.authorization;

    if (!authorization) {

        return response.status(401).json({

            success: false,

            message: "Token não informado."

        });

    }

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {

        return response.status(401).json({

            success: false,

            message: "Token inválido."

        });

    }

    try {

        const decoded = jwt.verify(

            token,

            JWT_SECRET

        );

        if (decoded.type === "customer" || !decoded.id || !(decoded.empresaId || decoded.empresa_id)) {
            return response.status(403).json({
                success: false,
                message: "Acesso exclusivo para a administração."
            });
        }

        const empresaId = decoded.empresaId || decoded.empresa_id;
        const { rows } = await db.query(
            `SELECT id,empresa_id,nome,email,perfil,sessao_versao
             FROM usuarios
             WHERE id=$1 AND empresa_id=$2 AND ativo=TRUE
             LIMIT 1`,
            [decoded.id, empresaId]
        );
        const current = rows[0];
        if (!current || Number(decoded.sv) !== Number(current.sessao_versao)) {
            return response.status(401).json({
                success: false,
                message: "Sessão encerrada. Faça login novamente."
            });
        }

        request.user = {
            ...decoded,
            id: current.id,
            empresaId: current.empresa_id,
            empresa_id: current.empresa_id,
            nome: current.nome,
            email: current.email,
            cargo: current.perfil,
            perfil: current.perfil,
            sv: Number(current.sessao_versao)
        };

        request.usuario = request.user;

        next();

    } catch (error) {

        return response.status(401).json({

            success: false,

            message: "Token expirado ou inválido."

        });

    }

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = authMiddleware;
