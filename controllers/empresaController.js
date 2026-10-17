"use strict";

/* ==================================================
   MODEL
================================================== */

const empresaModel = require("../models/empresaModel");
const audit = require("../services/auditService");
const images = require("../services/imageService");

/* ==================================================
   BUSCAR EMPRESA
================================================== */

async function show(request, response, next) {

    try {

        const empresa = await empresaModel.findById(

            request.user.empresaId

        );

        if (!empresa) {

            return response.status(404).json({

                success: false,

                message: "Empresa não encontrada."

            });

        }

        return response.status(200).json({

            success: true,

            data: empresa

        });

    } catch (error) {

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

        const anterior = await empresaModel.findById(request.user.empresaId);

        if (!anterior) return response.status(404).json({ success: false, message: "Empresa não encontrada." });
        image = await images.uploadImage(request.file);
        const empresa = await empresaModel.update(

            request.user.empresaId,

            {

                ...request.body,

                logo: image?.url || anterior.logo || null,
                logoPublicId: image?.publicId || anterior.logo_public_id || null,
                replaceImage: Boolean(image)

            }

        );

        if (!empresa) throw Object.assign(new Error("Empresa não encontrada."), { status: 404 });
        saved = true;
        if (image) {
            const previous = empresa.previousImage || { url: anterior.logo, publicId: anterior.logo_public_id };
            await images.removeImageSafely(images.getImagePublicId(previous.url, previous.publicId));
        }
        await audit.registrar({ ...audit.requestMeta(request), acao: "EDITAR", entidade: "EMPRESA",
            entidadeId: empresa.id, descricao: "Configurações da loja atualizadas.", anterior, novo: empresa });

        return response.status(200).json({

            success: true,

            message: "Empresa atualizada com sucesso.",

            data: empresa

        });

    } catch (error) {

        if (image && !saved) await images.removeImageSafely(image.publicId);
        next(error);

    }

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    show,

    update

};
