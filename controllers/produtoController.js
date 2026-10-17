"use strict";

/* ==================================================
   MODEL
================================================== */

const produtoModel = require("../models/produtoModel");
const audit = require("../services/auditService");
const images = require("../services/imageService");

/* ==================================================
   LISTAR
================================================== */

async function index(request, response, next) {

    try {

        const produtos = await produtoModel.findAll(

            request.user.empresaId

        );

        return response.status(200).json({

            success: true,

            data: produtos

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

        const produto = await produtoModel.findById(

            id,

            request.user.empresaId

        );

        if (!produto) {

            return response.status(404).json({

                success: false,

                message: "Produto não encontrado."

            });

        }

        return response.status(200).json({

            success: true,

            data: produto

        });

    } catch (error) {

        next(error);

    }

}

/* ==================================================
   CADASTRAR
================================================== */

async function store(request, response, next) {

    let image = null;
    let saved = false;
    try {

        if (!request.file?.buffer?.length) {

            return response.status(400).json({

                success: false,

                message: "A foto do produto é obrigatória. Envie uma imagem JPG, PNG ou WebP."

            });

        }

        image = await images.uploadImage(request.file);
        const produto = await produtoModel.create({

            ...request.body,

            empresaId: request.user.empresaId,

            foto: image.url,
            fotoPublicId: image.publicId

        });

        saved = true;
        await audit.registrar({ ...audit.requestMeta(request), acao: "CRIAR", entidade: "PRODUTO",
            entidadeId: produto.id, descricao: `Produto ${produto.nome} cadastrado.`, novo: produto });

        return response.status(201).json({

            success: true,

            message: "Produto cadastrado com sucesso.",

            data: produto

        });

    } catch (error) {

        if (image && !saved) await images.removeImageSafely(image.publicId);
        next(error);

    }

}

/* ==================================================
   ATUALIZAR
================================================== */

async function update(request, response, next) {

    let image = null;
    let saved = false;
    try {

        const { id } = request.params;

        const existente = await produtoModel.findById(

            id,

            request.user.empresaId

        );

        if (!existente) {

            return response.status(404).json({

                success: false,

                message: "Produto não encontrado."

            });

        }

        image = await images.uploadImage(request.file);
        const produto = await produtoModel.update(

            id,

            {

                ...request.body,

                foto: image?.url || existente.foto,
                fotoPublicId: image?.publicId || existente.foto_public_id || null,
                replaceImage: Boolean(image)

            },

            request.user.empresaId

        );

        if (!produto) throw Object.assign(new Error("Produto não encontrado."), { status: 404 });
        saved = true;
        if (image) {
            const previous = produto.previousImage || { url: existente.foto, publicId: existente.foto_public_id };
            await images.removeImageSafely(images.getImagePublicId(previous.url, previous.publicId));
        }
        await audit.registrar({ ...audit.requestMeta(request), acao: "EDITAR", entidade: "PRODUTO",
            entidadeId: id, descricao: `Produto ${produto.nome} atualizado.`, anterior: existente, novo: produto });

        return response.status(200).json({

            success: true,

            message: "Produto atualizado com sucesso.",

            data: produto

        });

    } catch (error) {

        if (image && !saved) await images.removeImageSafely(image.publicId);
        next(error);

    }

}

/* ==================================================
   REMOVER
================================================== */

async function destroy(request, response, next) {

    try {

        const { id } = request.params;

        const existente = await produtoModel.findById(id, request.user.empresaId);
        if (!existente) {
            return response.status(404).json({ success: false, message: "Produto não encontrado." });
        }
        const produto = await produtoModel.remove(

            id,

            request.user.empresaId

        );

        await audit.registrar({ ...audit.requestMeta(request), acao: "DESATIVAR", entidade: "PRODUTO",
            entidadeId: id, descricao: `Produto ${existente.nome} desativado.`, anterior: existente, novo: produto });

        return response.status(200).json({

            success: true,

            message: "Produto removido com sucesso."

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
