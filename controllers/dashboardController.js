"use strict";

const DashboardService = require("../services/dashboardService");

class DashboardController {

    /* ==============================================
       DASHBOARD COMPLETO
    ============================================== */

    static async dashboard(req, res) {

        try {

            const empresaId = req.user.empresa_id;

            const dados = await DashboardService.obterDashboard(

                empresaId

            );

            return res.status(200).json({

                success: true,

                data: dados

            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                success: false,

                message: "Erro ao carregar dashboard."

            });

        }

    }

    /* ==============================================
       RESUMO
    ============================================== */

    static async resumo(req, res) {

        try {

            const empresaId = req.user.empresa_id;

            const dados = await DashboardService.resumo(

                empresaId

            );

            return res.json(dados);

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                message: "Erro ao buscar resumo."

            });

        }

    }

    /* ==============================================
       ÚLTIMAS VENDAS
    ============================================== */

    static async ultimasVendas(req, res) {

        try {

            const empresaId = req.user.empresa_id;

            const dados = await DashboardService.ultimasVendas(

                empresaId

            );

            return res.json(dados);

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                message: "Erro ao buscar vendas."

            });

        }

    }

    /* ==============================================
       ÚLTIMAS COMPRAS
    ============================================== */

    static async ultimasCompras(req, res) {

        try {

            const empresaId = req.user.empresa_id;

            const dados = await DashboardService.ultimasCompras(

                empresaId

            );

            return res.json(dados);

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                message: "Erro ao buscar compras."

            });

        }

    }

    /* ==============================================
       ESTOQUE BAIXO
    ============================================== */

    static async estoqueBaixo(req, res) {

        try {

            const empresaId = req.user.empresa_id;

            const dados = await DashboardService.estoqueBaixo(

                empresaId

            );

            return res.json(dados);

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                message: "Erro ao buscar estoque."

            });

        }

    }



    /* ==============================================
       CONTAS VENCIDAS
    ============================================== */

    static async contasVencidas(req, res) {

        try {

            const empresaId = req.user.empresa_id;

            const dados = await DashboardService.contasVencidas(

                empresaId

            );

            return res.json(dados);

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                message: "Erro ao buscar contas vencidas."

            });

        }

    }

    /* ==============================================
       PRODUTOS MAIS VENDIDOS
    ============================================== */

    static async produtosMaisVendidos(req, res) {

        try {

            const empresaId = req.user.empresa_id;

            const dados = await DashboardService.produtosMaisVendidos(

                empresaId

            );

            return res.json(dados);

        } catch (error) {

            console.error(error);

            return res.status(500).json({

                message: "Erro ao buscar produtos mais vendidos."

            });

        }

    }



}

module.exports = DashboardController;