"use strict";

/* ==================================================
   ESTOQUE SERVICE
================================================== */

const EstoqueService = {

    /* ==============================================
       LISTAR
    ============================================== */

    async getAll() {

        return await apiGet(

            "/estoque"

        );

    },

    /* ==============================================
       BUSCAR POR ID
    ============================================== */

    async getById(id) {

        return await apiGet(

            `/estoque/${id}`

        );

    },

    /* ==============================================
       BUSCAR POR PRODUTO
    ============================================== */

    async getByProduct(produtoId) {

        return await apiGet(

            `/estoque/produto/${produtoId}`

        );

    },

    /* ==============================================
       ENTRADA DE ESTOQUE
    ============================================== */

    async input(data) {

        return await apiPost(

            "/estoque/entrada",

            data

        );

    },

    /* ==============================================
       SAÍDA DE ESTOQUE
    ============================================== */

    async output(data) {

        return await apiPost(

            "/estoque/saida",

            data

        );

    },

    /* ==============================================
       AJUSTE DE ESTOQUE
    ============================================== */

    async adjust(id, data) {

        return await apiPut(

            `/estoque/${id}/ajuste`,

            data

        );

    },

    /* ==============================================
       ATUALIZAR
    ============================================== */

    async update(id, estoque) {

        return await apiPut(

            `/estoque/${id}`,

            estoque

        );

    },

    /* ==============================================
       EXCLUIR
    ============================================== */

    async delete(id) {

        return await apiDelete(

            `/estoque/${id}`

        );

    }

};