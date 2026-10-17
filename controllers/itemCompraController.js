"use strict";

const ItemCompraModel = require("../models/itemCompraModel");

const ItemCompraController = {

    async listar(request, response, next) {

        try {

            const empresaId = request.user.empresaId;

            const { compraId } = request.params;

            const itens = await ItemCompraModel.listar(
                compraId,
                empresaId
            );

            return response.status(200).json({

                success: true,
                data: itens

            });

        } catch (error) {

            next(error);

        }

    },

    async buscarPorId(request, response, next) {

        try {

            const empresaId = request.user.empresaId;

            const { id } = request.params;

            const item = await ItemCompraModel.buscarPorId(
                id,
                empresaId
            );

            if (!item) {

                return response.status(404).json({

                    success: false,
                    message: "Item da compra não encontrado."

                });

            }

            return response.status(200).json({

                success: true,
                data: item

            });

        } catch (error) {

            next(error);

        }

    },

        async criar(request, response) {

            return response.status(405).json({

                success: false,

                message: "Os itens da compra são cadastrados automaticamente durante a criação da compra."

            });

    },
    async atualizar(request, response, next) {

        try {

            const empresaId = request.user.empresaId;

            const { id } = request.params;

            const {

                produto_id,
                quantidade,
                valor_unitario

            } = request.body;

            const subtotal = Number(quantidade) * Number(valor_unitario);

            const item = await ItemCompraModel.atualizar(

                id,

                empresaId,

                {

                    produto_id,
                    quantidade,
                    valor_unitario,
                    subtotal

                }

            );

            if (!item) {

                return response.status(404).json({

                    success: false,
                    message: "Item da compra não encontrado."

                });

            }

            return response.status(200).json({

                success: true,
                message: "Item atualizado com sucesso.",
                data: item

            });

        } catch (error) {

            next(error);

        }

    },

    async excluir(request, response, next) {

        try {

            const empresaId = request.user.empresaId;

            const { id } = request.params;

            const item = await ItemCompraModel.excluir(
                id,
                empresaId
            );

            if (!item) {

                return response.status(404).json({

                    success: false,
                    message: "Item da compra não encontrado."

                });

            }

            return response.status(200).json({

                success: true,
                message: "Item removido com sucesso."

            });

        } catch (error) {

            next(error);

        }

    }

};

module.exports = ItemCompraController;