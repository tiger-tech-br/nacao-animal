"use strict";

/* ==================================================
   LOCAL STORAGE
================================================== */

function setLocalStorage(key, value) {

    localStorage.setItem(

        key,

        JSON.stringify(value)

    );

}

function getLocalStorage(key) {

    const data = localStorage.getItem(key);

    return data ?JSON.parse(data) : null;

}

function removeLocalStorage(key) {

    localStorage.removeItem(key);

}

function clearLocalStorage() {

    localStorage.clear();

}

/* ==================================================
   SESSION STORAGE
================================================== */

function setSessionStorage(key, value) {

    sessionStorage.setItem(

        key,

        JSON.stringify(value)

    );

}

function getSessionStorage(key) {

    const data = sessionStorage.getItem(key);

    return data ?JSON.parse(data) : null;

}

function removeSessionStorage(key) {

    sessionStorage.removeItem(key);

}

function clearSessionStorage() {

    sessionStorage.clear();

}

/* ==================================================
   TOKEN JWT
================================================== */

function saveToken(token) {

    sessionStorage.setItem("token", token);
    localStorage.removeItem("token");

}

function getToken() {

    return sessionStorage.getItem("token");

}

function removeToken() {

    sessionStorage.removeItem("token");
    localStorage.removeItem("token");

}

/* ==================================================
   USUÁRIO LOGADO
================================================== */

function saveUser(user) {

    setSessionStorage("user", user);
    removeLocalStorage("user");

}

function getUser() {

    return getSessionStorage("user");

}

function removeUser() {

    removeSessionStorage("user");
    removeLocalStorage("user");

}

/* ==================================================
   LOGOUT
================================================== */

function logout() {

    removeToken();

    removeUser();

    sessionStorage.clear();

}
