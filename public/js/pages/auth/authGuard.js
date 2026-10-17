"use strict";

/* ==================================================
   AUTH GUARD
================================================== */

function isAuthenticated() {

    const token = getToken();

    return Boolean(token);

}

/* ==================================================
   PROTEGER PÁGINA
================================================== */

function requireAuth() {

    if (!isAuthenticated()) {

        window.location.href = "/admin/index.html";

    }

}

/* ==================================================
   USUÁRIO LOGADO
================================================== */

function getAuthenticatedUser() {

    return getUser();

}
