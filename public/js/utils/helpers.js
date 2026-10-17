"use strict";

/* ==================================================
   DEBOUNCE
================================================== */

function debounce(callback, delay = 300) {

    let timeout;

    return (...args) => {

        clearTimeout(timeout);

        timeout = setTimeout(() => {

            callback(...args);

        }, delay);

    };

}

/* ==================================================
   THROTTLE
================================================== */

function throttle(callback, delay = 300) {

    let waiting = false;

    return (...args) => {

        if (waiting) {

            return;

        }

        callback(...args);

        waiting = true;

        setTimeout(() => {

            waiting = false;

        }, delay);

    };

}

/* ==================================================
   FORMATA DATA
================================================== */

function formatDate(date) {

    if (!date) {

        return "";

    }

    const [year, month, day] = date.split("-");

    return `${day}/${month}/${year}`;

}

/* ==================================================
   FORMATA DATA E HORA
================================================== */

function formatDateTime(dateTime) {

    if (!dateTime) {

        return "";

    }

    const [date, time] = dateTime.split("T");

    const [year, month, day] = date.split("-");

    return `${day}/${month}/${year} ${time.substring(0, 5)}`;

}

/* ==================================================
   FORMATA MOEDA
================================================== */

function formatCurrency(value) {

    return Number(value).toLocaleString(

        "pt-BR",

        {

            style: "currency",

            currency: "BRL"

        }

    );

}

/* ==================================================
   CAPITALIZAR TEXTO
================================================== */

function capitalize(text) {

    return text.replace(

        /\b\w/g,

        letter => letter.toUpperCase()

    );

}

/* ==================================================
   REMOVER ACENTOS
================================================== */

function removeAccents(text) {

    return text.normalize("NFD")

        .replace(/[\u0300-\u036f]/g, "");

}

/* ==================================================
   COPIAR TEXTO
================================================== */

async function copyToClipboard(text) {

    try {

        await navigator.clipboard.writeText(text);

        return true;

    } catch {

        return false;

    }

}

/* ==================================================
   GERAR ID
================================================== */

function generateId() {

    return crypto.randomUUID();

}

/* ==================================================
   SCROLL SUAVE
================================================== */

function scrollToElement(selector) {

    const element = document.querySelector(selector);

    if (!element) {

        return;

    }

    element.scrollIntoView({

        behavior: "smooth",

        block: "start"

    });

}

/* ==================================================
   VERIFICAR SE É MOBILE
================================================== */

function isMobile() {

    return window.innerWidth <= 768;

}