"use strict";

/* ==================================================
   DEPENDÊNCIAS
================================================== */

const ItemVendaModel = require("../models/itemVendaModel");

/* ==================================================
   CONTROLLER
================================================== */

class ItemVendaController {

    /* ==========================
       LISTAR ITENS DA VENDA
    ========================== */

    static async listar(req, res, next) {

        try {

            const empresaId = req.usuario.empresaId;

            const { vendaId } = req.params;

            const itens = await ItemVendaModel.listar(

                vendaId,

                empresaId

            );

            return res.status(200).json({

                success: true,

                data: itens

            });

        } catch (error) {

            next(error);

        }

    }

    /* ==========================
       BUSCAR ITEM
    ========================== */

    static async buscarPorId(req, res, next) {

        try {

            const empresaId = req.usuario.empresaId;

            const { id } = req.params;

            const item = await ItemVendaModel.buscarPorId(

                id,

                empresaId

            );

            if (!item) {

                return res.status(404).json({

                    success: false,

                    message: "Item da venda não encontrado."

                });

            }

            return res.status(200).json({

                success: true,

                data: item

            });

        } catch (error) {

            next(error);

        }

    }

    /* ==========================
       CRIAR ITEM
    ========================== */

    static async criar(req, res) {

        return res.status(405).json({

            success: false,

            message: "Os itens da venda são cadastrados automaticamente durante a finalização da venda."

        });

    }

    /* ==========================
       ATUALIZAR ITEM
    ========================== */

    static async atualizar(req, res) {

        return res.status(405).json({

            success: false,

            message: "A edição de itens da venda deve ser realizada através do VendaService."

        });

    }

    /* ==========================
       EXCLUIR ITEM
    ========================== */

    static async excluir(req, res) {

        return res.status(405).json({

            success: false,

            message: "A exclusão de itens da venda deve ser realizada através do VendaService."

        });

    }

}

module.exports = ItemVendaController;