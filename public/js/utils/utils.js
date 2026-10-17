"use strict";

/* ==================================================
   SELETOR
================================================== */

function $(selector) {

    return document.querySelector(selector);

}

function $$(selector) {

    return document.querySelectorAll(selector);

}

/* ==================================================
   EXIBIR
================================================== */

function show(element) {

    element.hidden = false;

}

/* ==================================================
   OCULTAR
================================================== */

function hide(element) {

    element.hidden = true;

}

/* ==================================================
   ALTERNAR VISIBILIDADE
================================================== */

function toggle(element) {

    element.hidden = !element.hidden;

}

/* ==================================================
   LIMPAR FORMULÁRIO
================================================== */

function clearForm(form) {

    form.reset();

}

/* ==================================================
   DESABILITAR BOTÃO
================================================== */

function disableButton(button) {

    button.disabled = true;

}

/* ==================================================
   HABILITAR BOTÃO
================================================== */

function enableButton(button) {

    button.disabled = false;

}

/* ==================================================
   LOADING
================================================== */

function showLoading(button, text = "Carregando...") {

    button.dataset.text = button.innerHTML;

    button.disabled = true;

    button.innerHTML = text;

}

function hideLoading(button) {

    button.disabled = false;

    button.innerHTML = button.dataset.text;

}

/* ==================================================
   REDIRECIONAR
================================================== */

function redirect(url) {

    window.location.href = url;

}

/* ==================================================
   VOLTAR
================================================== */

function goBack() {

    history.back();

}

/* ==================================================
   ROLAR PARA O TOPO
================================================== */

function scrollTopPage() {

    window.scrollTo({

        top: 0,

        behavior: "smooth"

    });

}