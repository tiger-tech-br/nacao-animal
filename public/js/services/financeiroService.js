"use strict";

/* ==================================================
   FINANCEIRO SERVICE
================================================== */

const FinanceiroService = {

    /* ==============================================
       LISTAR MOVIMENTAÇÕES
    ============================================== */

    async getAll() {

        return await apiGet(

            "/financeiro"

        );

    },

    /* ==============================================
       BUSCAR POR ID
    ============================================== */

    async getById(id) {

        return await apiGet(

            `/financeiro/${id}`

        );

    },

    /* ==============================================
       CONTAS A RECEBER
    ============================================== */

    async getReceivable() {

        return await apiGet(

            "/financeiro/receber"

        );

    },

    /* ==============================================
       CONTAS A PAGAR
    ============================================== */

    async getPayable() {

        return await apiGet(

            "/financeiro/pagar"

        );

    },

    /* ==============================================
       FLUXO DE CAIXA
    ============================================== */

    async getCashFlow() {

        return await apiGet(

            "/financeiro/fluxo-caixa"

        );

    },

    /* ==============================================
       CADASTRAR MOVIMENTAÇÃO
    ============================================== */

    async create(data) {

        return await apiPost(

            "/financeiro",

            data

        );

    },

    /* ==============================================
       ATUALIZAR MOVIMENTAÇÃO
    ============================================== */

    async update(id, data) {

        return await apiPut(

            `/financeiro/${id}`,

            data

        );

    },

    /* ==============================================
       RECEBER PAGAMENTO
    ============================================== */

    async receive(id, data) {

        return await apiPut(

            `/financeiro/${id}/receber`,

            data

        );

    },

    /* ==============================================
       PAGAR DESPESA
    ============================================== */

    async pay(id, data) {

        return await apiPut(

            `/financeiro/${id}/pagar`,

            data

        );

    },

    /* ==============================================
       EXCLUIR
    ============================================== */

    async delete(id) {

        return await apiDelete(

            `/financeiro/${id}`

        );

    },

    /* ==============================================
       RELATÓRIO FINANCEIRO
    ============================================== */

    async getReport(periodo) {

        return await apiGet(

            `/financeiro/relatorio/${periodo}`

        );

    }

};