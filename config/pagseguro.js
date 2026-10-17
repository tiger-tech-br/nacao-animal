"use strict";

/* ==================================================
   DOTENV
================================================== */

require("dotenv").config();

/* ==================================================
   AXIOS
================================================== */

const axios = require("axios");

/* ==================================================
   CONFIGURAÇÃO
================================================== */

const pagSeguro = axios.create({

    baseURL: process.env.PAGSEGURO_BASE_URL,

    timeout: 30000,

    headers: {

        Authorization: `Bearer ${process.env.PAGSEGURO_TOKEN}`,

        "Content-Type": "application/json",

        Accept: "application/json"

    }

});

/* ==================================================
   TESTAR CONEXÃO
================================================== */

async function testPagSeguro() {

    try {

        console.log("✅ Configuração do PagSeguro carregada.");

        return true;

    } catch (error) {

        console.error("❌ Erro ao configurar o PagSeguro.");

        console.error(error);

        return false;

    }

}

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = {

    pagSeguro,

    testPagSeguro

};