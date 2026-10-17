"use strict";

/* ==================================================
   REGEX
================================================== */

const REGEX = {

    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

    password: /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{6,}$/,

    phone: /^\(\d{2}\)\s\d{4,5}-\d{4}$/,

    cpf: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,

    cep: /^\d{5}-\d{3}$/,

    date: /^\d{2}\/\d{2}\/\d{4}$/,

    number: /^\d+$/,

    price: /^\d+([.,]\d{2})?$/,

    name: /^[A-Za-zÀ-ÿ\s]{3,100}$/

};

/* ==================================================
   CAMPO OBRIGATÓRIO
================================================== */

function validateRequired(field, message) {

    if (field.value.trim() === "") {

        alert(message);

        field.focus();

        return false;

    }

    return true;

}

/* ==================================================
   EMAIL
================================================== */

function validateEmail(field) {

    if (!REGEX.email.test(field.value.trim())) {

        alert("Informe um e-mail válido.");

        field.focus();

        return false;

    }

    return true;

}

/* ==================================================
   SENHA
================================================== */

function validatePassword(field) {

    if (!REGEX.password.test(field.value)) {

        alert(
            "A senha deve possuir pelo menos 6 caracteres, uma letra maiúscula, uma minúscula e um número."
        );

        field.focus();

        return false;

    }

    return true;

}

/* ==================================================
   TELEFONE
================================================== */

function validatePhone(field) {

    if (!REGEX.phone.test(field.value.trim())) {

        alert("Telefone inválido.");

        field.focus();

        return false;

    }

    return true;

}

/* ==================================================
   CPF
================================================== */

function validateCPF(field) {

    if (!REGEX.cpf.test(field.value.trim())) {

        alert("CPF inválido.");

        field.focus();

        return false;

    }

    return true;

}

/* ==================================================
   CEP
================================================== */

function validateCEP(field) {

    if (!REGEX.cep.test(field.value.trim())) {

        alert("CEP inválido.");

        field.focus();

        return false;

    }

    return true;

}