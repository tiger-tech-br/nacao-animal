"use strict";

/* ==================================================
   MÁSCARA CPF
================================================== */

function maskCPF(field) {

    let value = field.value.replace(/\D/g, "");

    value = value.replace(/(\d{3})(\d)/, "$1.$2");

    value = value.replace(/(\d{3})(\d)/, "$1.$2");

    value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");

    field.value = value;

}

/* ==================================================
   MÁSCARA TELEFONE
================================================== */

function maskPhone(field) {

    let value = field.value.replace(/\D/g, "");

    value = value.replace(/^(\d{2})(\d)/g, "($1) $2");

    value = value.replace(/(\d)(\d{4})$/, "$1-$2");

    field.value = value;

}

/* ==================================================
   MÁSCARA CEP
================================================== */

function maskCEP(field) {

    let value = field.value.replace(/\D/g, "");

    value = value.replace(/^(\d{5})(\d)/, "$1-$2");

    field.value = value;

}

/* ==================================================
   MÁSCARA DATA
================================================== */

function maskDate(field) {

    let value = field.value.replace(/\D/g, "");

    value = value.replace(/^(\d{2})(\d)/, "$1/$2");

    value = value.replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");

    field.value = value;

}

/* ==================================================
   MÁSCARA MOEDA
================================================== */

function maskCurrency(field) {

    let value = field.value.replace(/\D/g, "");

    value = (Number(value) / 100).toLocaleString("pt-BR", {

        minimumFractionDigits: 2,

        maximumFractionDigits: 2

    });

    field.value = value;

}

/* ==================================================
   APENAS NÚMEROS
================================================== */

function onlyNumbers(field) {

    field.value = field.value.replace(/\D/g, "");

}

/* ==================================================
   LETRAS E ESPAÇOS
================================================== */

function onlyLetters(field) {

    field.value = field.value.replace(/[^A-Za-zÀ-ÿ\s]/g, "");

}