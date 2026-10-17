"use strict";

/* ==================================================
   AUTH SERVICE
================================================== */

const AuthService = {

    /* ==============================================
       LOGIN
    ============================================== */

    async login(credentials) {

        return await apiPost(

            "/auth/login",

            credentials

        );

    },

    /* ==============================================
       LOGOUT
    ============================================== */

    async logout() {

        return await apiPost(

            "/auth/logout",

            {}

        );

    },

    /* ==============================================
       RECUPERAR SENHA
    ============================================== */

    async forgotPassword(email) {

        return await apiPost(

            "/auth/forgot-password",

            {

                email

            }

        );

    },

    /* ==============================================
       REDEFINIR SENHA
    ============================================== */

    async resetPassword(data) {

        return await apiPost(

            "/auth/reset-password",

            data

        );

    },

    /* ==============================================
       VERIFICAR TOKEN
    ============================================== */

    async verifyToken() {

        return await apiGet(

            "/auth/verify"

        );

    }

};