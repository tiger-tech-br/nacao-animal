"use strict";

/* ==================================================
   RELATÓRIO SERVICE
================================================== */

const RelatorioService = {

    /* ==============================================
       DASHBOARD
    ============================================== */

    async getDashboard() {

        return await apiGet(

            "/relatorios/dashboard"

        );

    },

    /* ==============================================
       VENDAS
    ============================================== */

    async getSales(periodo) {

        return await apiGet(

            `/relatorios/vendas/${periodo}`

        );

    },

    /* ==============================================
       CLIENTES
    ============================================== */

    async getClients(periodo) {

        return await apiGet(

            `/relatorios/clientes/${periodo}`

        );

    },



    /* ==============================================
       PRODUTOS
    ============================================== */

    async getProducts(periodo) {

        return await apiGet(

            `/relatorios/produtos/${periodo}`

        );

    },

    /* ==============================================
       ESTOQUE
    ============================================== */

    async getInventory() {

        return await apiGet(

            "/relatorios/estoque"

        );

    },

    /* ==============================================
       FINANCEIRO
    ============================================== */

    async getFinancial(periodo) {

        return await apiGet(

            `/relatorios/financeiro/${periodo}`

        );

    },



    /* ==============================================
       EXPORTAR PDF
    ============================================== */

    async exportPDF(data) {

        return await apiPost(

            "/relatorios/pdf",

            data

        );

    },

    /* ==============================================
       EXPORTAR EXCEL
    ============================================== */

    async exportExcel(data) {

        return await apiPost(

            "/relatorios/excel",

            data

        );

    }

};
