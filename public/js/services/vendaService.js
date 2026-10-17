"use strict";

/* ==================================================
   VENDA SERVICE
================================================== */

const VendaService = {

    /* ==============================================
       LISTAR
    ============================================== */

    async getAll() {

        return await apiGet(

            "/vendas"

        );

    },

    /* ==============================================
       BUSCAR POR ID
    ============================================== */

    async getById(id) {

        return await apiGet(

            `/vendas/${id}`

        );

    },

    /* ==============================================
       LISTAR POR CLIENTE
    ============================================== */

    async getByClient(clienteId) {

        return await apiGet(

            `/vendas/cliente/${clienteId}`

        );

    },

    /* ==============================================
       CADASTRAR
    ============================================== */

    async create(venda) {

        return await apiPost(

            "/vendas",

            venda

        );

    },

    /* ==============================================
       ATUALIZAR
    ============================================== */

    async update(id, venda) {

        return await apiPut(

            `/vendas/${id}`,

            venda

        );

    },

    /* ==============================================
       FINALIZAR
    ============================================== */

    async finish(id) {

        return await apiPut(

            `/vendas/${id}/finalizar`,

            {}

        );

    },

    /* ==============================================
       CANCELAR
    ============================================== */

    async cancel(id) {

        return await apiPut(

            `/vendas/${id}/cancelar`,

            {}

        );

    },

    /* ==============================================
       EXCLUIR
    ============================================== */

    async delete(id) {

        return await apiDelete(

            `/vendas/${id}`

        );

    },

    /* ==============================================
       PROCESSAR PAGAMENTO
    ============================================== */

    async payment(dados) {

        return await apiPost(

            "/vendas/pagamento",

            dados

        );

    },

    /* ==============================================
       COMPROVANTE
    ============================================== */

    async printReceipt(id) {

        return await apiGet(

            `/vendas/${id}/comprovante`

        );

    }

};

/* ==================================================
   EXPORTAÇÃO
================================================== */

window.VendaService = VendaService;