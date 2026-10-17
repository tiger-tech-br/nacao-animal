"use strict";

/* ==================================================
   USUÁRIO SERVICE
================================================== */

const UsuarioService = {

    /* ==============================================
       LISTAR
    ============================================== */

    async getAll() {

        return await apiGet(

            "/usuarios"

        );

    },

    /* ==============================================
       BUSCAR POR ID
    ============================================== */

    async getById(id) {

        return await apiGet(

            `/usuarios/${id}`

        );

    },

    /* ==============================================
       CADASTRAR
    ============================================== */

    async create(usuario) {

        return await apiPost(

            "/usuarios",

            usuario

        );

    },

    /* ==============================================
       ATUALIZAR
    ============================================== */

    async update(id, usuario) {

        return await apiPut(

            `/usuarios/${id}`,

            usuario

        );

    },

    /* ==============================================
       ALTERAR SENHA
    ============================================== */

    async changePassword(id, data) {

        return await apiPut(

            `/usuarios/${id}/senha`,

            data

        );

    },

    /* ==============================================
       ALTERAR PERFIL
    ============================================== */

    async changeRole(id, role) {

        return await apiPut(

            `/usuarios/${id}/perfil`,

            {

                role

            }

        );

    },

    /* ==============================================
       ATIVAR / DESATIVAR
    ============================================== */

    async changeStatus(id, ativo) {

        return await apiPut(

            `/usuarios/${id}/status`,

            {

                ativo

            }

        );

    },

    /* ==============================================
       EXCLUIR
    ============================================== */

    async delete(id) {

        return await apiDelete(

            `/usuarios/${id}`

        );

    }

};