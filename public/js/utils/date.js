"use strict";

/* ==================================================
   FORMATA DATA (YYYY-MM-DD → DD/MM/YYYY)
================================================== */

function formatDate(date) {

    if (!date) {

        return "";

    }

    const [year, month, day] = date.split("-");

    return `${day}/${month}/${year}`;

}

/* ==================================================
   FORMATA DATA PARA INPUT
   (DD/MM/YYYY → YYYY-MM-DD)
================================================== */

function formatInputDate(date) {

    if (!date) {

        return "";

    }

    const [day, month, year] = date.split("/");

    return `${year}-${month}-${day}`;

}

/* ==================================================
   FORMATA DATA E HORA
================================================== */

function formatDateTime(dateTime) {

    if (!dateTime) {

        return "";

    }

    const [date, time] = dateTime.split("T");

    return `${formatDate(date)} ${time.substring(0, 5)}`;

}

/* ==================================================
   DATA ATUAL
================================================== */

function getCurrentDate() {

    const today = new Date();

    const year = today.getFullYear();

    const month = String(

        today.getMonth() + 1

    ).padStart(2, "0");

    const day = String(

        today.getDate()

    ).padStart(2, "0");

    return `${year}-${month}-${day}`;

}

/* ==================================================
   HORA ATUAL
================================================== */

function getCurrentTime() {

    const today = new Date();

    const hour = String(

        today.getHours()

    ).padStart(2, "0");

    const minute = String(

        today.getMinutes()

    ).padStart(2, "0");

    return `${hour}:${minute}`;

}

/* ==================================================
   DATA E HORA ATUAL
================================================== */

function getCurrentDateTime() {

    return `${getCurrentDate()} ${getCurrentTime()}`;

}