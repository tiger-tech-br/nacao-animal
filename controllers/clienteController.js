"use strict";

/* ==================================================
   MODEL
================================================== */

const clienteModel = require("../models/clienteModel");
const audit = require("../services/auditService");
const db = require("../database/connection");

/* ==================================================
   LISTAR
================================================== */

async function index(request, response, next) {

    try {

        const clientes = await clienteModel.findAll(

            request.user.empresaId

        );

        return response.status(200).json({

            success: true,

            data: clientes

        });

    } catch (error) {

        next(error);

    }

}

/* ==================================================
   BUSCAR POR ID
================================================== */

async function show(request, response, next) {

    try {

        const { id } = request.params;

        const cliente = await clienteModel.findById(

            id,

            request.user.empresaId

        );

        if (!cliente) {

            return response.status(404).json({

                success: false,

                message: "Cliente não encontrado."

            });

        }

        return response.status(200).json({

            success: true,

            data: cliente

        });

    } catch (error) {

        next(error);

    }

}

/* ==================================================
   CADASTRAR
================================================== */

async function store(request, response, next) {

    try {

        const cliente = await clienteModel.create({

            ...request.body,

            empresaId: request.user.empresaId

        });

        await audit.registrar({ ...audit.requestMeta(request), acao: "CRIAR", entidade: "CLIENTE",
            entidadeId: cliente.id, descricao: `Cliente ${cliente.nome} cadastrado pelo painel.` });

        return response.status(201).json({

            success: true,

            message: "Cliente cadastrado com sucesso.",

            data: cliente

        });

    } catch (error) {

        next(error);

    }

}

/* ==================================================
   ATUALIZAR
================================================== */

async function update(request, response, next) {

    try {

        const { id } = request.params;

        const anterior = await clienteModel.findById(id, request.user.empresaId);
        if (!anterior) return response.status(404).json({ success: false, message: "Cliente não encontrado." });

        const cliente = await clienteModel.update(

            id,

            request.body,

            request.user.empresaId

        );

        await audit.registrar({ ...audit.requestMeta(request), acao: "EDITAR", entidade: "CLIENTE",
            entidadeId: id, descricao: `Cadastro de ${cliente.nome} atualizado pelo painel.` });

        return response.status(200).json({

            success: true,

            message: "Cliente atualizado com sucesso.",

            data: cliente

        });

    } catch (error) {

        next(error);

    }

}

/* ==================================================
   EXCLUIR
================================================== */

async function destroy(request, response, next) {

    try {

        const { id } = request.params;

        const result = await db.transaction(async client => {
            const locked = await client.query(
                "SELECT * FROM clientes WHERE id=$1 AND empresa_id=$2 FOR UPDATE",
                [id, request.user.empresaId]
            );
            const anterior = locked.rows[0];
            if (!anterior) return null;

            const activeOrders = await client.query(
                `SELECT COUNT(*)::int AS total FROM vendas
                 WHERE empresa_id=$1 AND cliente_id=$2
                   AND status IN ('AGUARDANDO_PAGAMENTO','PAGAMENTO_APROVADO','EM_SEPARACAO','SAIU_PARA_ENTREGA')`,
                [request.user.empresaId, id]
            );
            if (activeOrders.rows[0].total > 0) {
                throw Object.assign(new Error("O cliente possui pedidos em andamento. Conclua ou cancele esses pedidos antes de excluir o acesso."), { status: 409 });
            }

            await client.query(
                "UPDATE clientes SET ativo=FALSE,updated_at=NOW() WHERE id=$1 AND empresa_id=$2",
                [id, request.user.empresaId]
            );
            await client.query(
                `UPDATE usuarios_clientes SET ativo=FALSE,sessao_versao=sessao_versao+1,
                 token_recuperacao=NULL,token_expiracao=NULL,updated_at=NOW() WHERE cliente_id=$1`,
                [id]
            );
            if (anterior.email) {
                await client.query(
                    "DELETE FROM newsletter_inscritos WHERE empresa_id=$1 AND LOWER(email)=LOWER($2)",
                    [request.user.empresaId, anterior.email]
                );
            }
            await audit.registrar({ ...audit.requestMeta(request), acao: "DESATIVAR", entidade: "CLIENTE",
                entidadeId: id, descricao: `Cadastro de ${anterior.nome} desativado pelo painel.`, anterior,
                novo: { ativo: false, acesso: false } }, client);
            return anterior;
        });
        if (!result) return response.status(404).json({ success: false, message: "Cliente não encontrado." });

        return response.status(200).json({

            success: true,

            message: "Cadastro e acesso do cliente desativados com sucesso. O histórico legal dos pedidos foi preservado."

        });

    } catch (error) {

        next(error);

    }

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    index,

    show,

    store,

    update,

    destroy

};
