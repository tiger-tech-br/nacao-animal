"use strict";

/* ==================================================
   PRODUTO SERVICE
================================================== */

const ProdutoService = {

    /* ==============================================
       LISTAR
    ============================================== */

    async getAll() {

        return await apiGet(

            "/produtos"

        );

    },

    /* ==============================================
       BUSCAR POR ID
    ============================================== */

    async getById(id) {

        return await apiGet(

            `/produtos/${id}`

        );

    },

    /* ==============================================
       CADASTRAR
    ============================================== */

    async create(produto) {

        return await apiPost(

            "/produtos",

            produto

        );

    },

    /* ==============================================
       ATUALIZAR
    ============================================== */

    async update(id, produto) {

        return await apiPut(

            `/produtos/${id}`,

            produto

        );

    },

    /* ==============================================
       EXCLUIR
    ============================================== */

    async delete(id) {

        return await apiDelete(

            `/produtos/${id}`

        );

    },

    /* ==============================================
       BUSCAR POR CATEGORIA
    ============================================== */

    async getByCategory(categoria) {

        return await apiGet(

            `/produtos/categoria/${categoria}`

        );

    },

    /* ==============================================
       PESQUISAR
    ============================================== */

    async search(termo) {

        return await apiGet(

            `/produtos/search/${encodeURIComponent(termo)}`

        );

    }

};