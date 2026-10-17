"use strict";

/* ==================================================
   CLIENTE SERVICE
================================================== */

const ClienteService = {

    /* ==============================================
       LISTAR
    ============================================== */

    async getAll() {

        return await apiGet(

            "/clientes"

        );

    },

    /* ==============================================
       BUSCAR POR ID
    ============================================== */

    async getById(id) {

        return await apiGet(

            `/clientes/${id}`

        );

    },

    /* ==============================================
       CADASTRAR
    ============================================== */

    async create(cliente) {

        return await apiPost(

            "/clientes",

            cliente

        );

    },

    /* ==============================================
       ATUALIZAR
    ============================================== */

    async update(id, cliente) {

        return await apiPut(

            `/clientes/${id}`,

            cliente

        );

    },

    /* ==============================================
       EXCLUIR
    ============================================== */

    async delete(id) {

        return await apiDelete(

            `/clientes/${id}`

        );

    }

};