"use strict";

const DashboardModel = require("../models/dashboardModel");

class DashboardService {

    /* ==============================================
       DASHBOARD COMPLETO
    ============================================== */

    static async obterDashboard(empresaId) {

        const [

            resumo,

            ultimasVendas,

            ultimasCompras,

            estoqueBaixo,

            contasVencidas,

            produtosMaisVendidos

        ] = await Promise.all([

            DashboardModel.resumo(empresaId),

            DashboardModel.ultimasVendas(empresaId),

            DashboardModel.ultimasCompras(empresaId),

            DashboardModel.estoqueBaixo(empresaId),

            DashboardModel.contasVencidas(empresaId),

            DashboardModel.produtosMaisVendidos(empresaId)

        ]);

        return {

            resumo,

            ultimasVendas,

            ultimasCompras,

            estoqueBaixo,

            contasVencidas,

            produtosMaisVendidos

        };

    }

    /* ==============================================
       RESUMO
    ============================================== */

    static async resumo(empresaId) {

        return DashboardModel.resumo(empresaId);

    }

    /* ==============================================
       VENDAS
    ============================================== */

    static async ultimasVendas(empresaId) {

        return DashboardModel.ultimasVendas(empresaId);

    }

    /* ==============================================
       COMPRAS
    ============================================== */

    static async ultimasCompras(empresaId) {

        return DashboardModel.ultimasCompras(empresaId);

    }

    /* ==============================================
       ESTOQUE BAIXO
    ============================================== */

    static async estoqueBaixo(empresaId) {

        return DashboardModel.estoqueBaixo(empresaId);

    }



    /* ==============================================
       CONTAS VENCIDAS
    ============================================== */

    static async contasVencidas(empresaId) {

        return DashboardModel.contasVencidas(empresaId);

    }

    /* ==============================================
       PRODUTOS MAIS VENDIDOS
    ============================================== */

    static async produtosMaisVendidos(empresaId) {

        return DashboardModel.produtosMaisVendidos(empresaId);

    }



}

module.exports = DashboardService;