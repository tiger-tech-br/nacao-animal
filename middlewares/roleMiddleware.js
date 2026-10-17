"use strict";

/* ==================================================
   PERMISSÕES
================================================== */

function roleMiddleware(...allowedRoles) {

    const roles = allowedRoles.flat();

    return (request, response, next) => {

        if (!request.user) {

            return response.status(401).json({

                success: false,

                message: "Usuário não autenticado."

            });

        }

        const userRole = request.user.cargo || request.user.perfil;

        if (!roles.includes(userRole)) {

            return response.status(403).json({

                success: false,

                message: "Você não possui permissão para acessar este recurso."

            });

        }

        next();

    };

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = roleMiddleware;
