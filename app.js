"use strict";

/* ==================================================
   DEPENDÊNCIAS
================================================== */

require("dotenv").config();

const express = require("express");

const path = require("path");

/* ==================================================
   MIDDLEWARES
================================================== */

const securityMiddleware = require("./middlewares/securityMiddleware");

const errorMiddleware = require("./middlewares/errorMiddleware");

/* ==================================================
   ROTAS
================================================== */

const authRoutes = require("./routes/authRoutes");

const clienteRoutes = require("./routes/clienteRoutes");



const empresaRoutes = require("./routes/empresaRoutes");

const categoriaRoutes = require("./routes/categoriaRoutes");

const produtoRoutes = require("./routes/produtoRoutes");

const estoqueRoutes = require("./routes/estoqueRoutes");

const vendaRoutes = require("./routes/vendaRoutes");

const itemVendaRoutes = require("./routes/itemVendaRoutes");


const fornecedorRoutes = require("./routes/fornecedorRoutes");

const compraRoutes = require("./routes/compraRoutes");

const itemCompraRoutes = require("./routes/itemCompraRoutes");

const financeiroRoutes = require("./routes/financeiroRoutes");
const cupomAdminRoutes = require("./routes/cupomAdminRoutes");
const usuarioAdminRoutes = require("./routes/usuarioAdminRoutes");
const auditoriaRoutes = require("./routes/auditoriaRoutes");
const lgpdAdminRoutes = require("./routes/lgpdAdminRoutes");
const consumerRequestAdminRoutes = require("./routes/consumerRequestAdminRoutes");
const healthRoutes = require("./routes/healthRoutes");

const publicCatalogRoutes = require("./routes/publicCatalogRoutes");

const publicPaymentRoutes = require("./routes/publicPaymentRoutes");

/* ==========================
   DASHBOARD
========================== */

const dashboardRoutes = require("./routes/dashboardRoutes");

/* ==================================================
   APP
================================================== */

const app = express();

app.set("trust proxy", 1);

/* ==================================================
   SEGURANÇA
================================================== */

securityMiddleware(app);

/* ==================================================
   MIDDLEWARES NATIVOS
================================================== */

app.use(express.json({
    verify: (request, response, buffer, encoding) => {
        const isPagSeguroWebhook =
            request.originalUrl?.split("?")[0] ===
            "/api/public/pagamentos/webhook";

        if (isPagSeguroWebhook) {
            request.rawBody = buffer.toString(encoding || "utf8");
        }
    }
}));

app.use(express.urlencoded({

    extended: true

}));

/* ==================================================
   ARQUIVOS ESTÁTICOS
================================================== */

app.use(express.static(path.join(__dirname, "public")));

// Modulos fora do escopo da loja de produtos, inclusive acesso direto.
app.use(["/admin/pages/servicos", "/admin/pages/agendamentos", "/admin/pages/pets", "/admin/pages/funcionarios"], (req, res) => {
    res.status(404).json({ success: false, message: "Modulo indisponivel nesta loja." });
});

app.use("/admin", express.static(path.join(__dirname, "admin")));

/* ==================================================
   ROTA INICIAL
================================================== */

app.get("/", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "home", "index.html"));

});

app.get("/login", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "auth", "login.html"));

});

app.get("/login-admin", (request, response) => {

    response.redirect("/admin/");

});

app.get("/redefinir-senha", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "auth", "reset-password.html"));

});

app.get("/conta", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "auth", "account.html"));

});

app.get("/meus-pedidos", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "auth", "orders.html"));

});



app.get("/sacola", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "cart", "index.html"));

});

app.get("/entregador", (request, response) => {
    response.set("Cache-Control", "no-store");
    response.sendFile(path.join(__dirname, "views", "delivery", "driver.html"));
});
app.get("/acompanhar-entrega", (request, response) => {
    response.sendFile(path.join(__dirname, "views", "delivery", "tracking.html"));
});
app.get("/admin/acompanhar-entrega", (request, response) => {
    response.set("Cache-Control", "no-store");
    response.sendFile(path.join(__dirname, "views", "delivery", "tracking.html"));
});

app.get("/politica-de-privacidade", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "legal", "privacy.html"));

});

app.get("/termos-de-uso", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "legal", "terms.html"));

});

app.get("/newsletter/cancelar", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "newsletter", "unsubscribe.html"));

});

app.get("/categorias/:slug", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "categories", "detail.html"));

});

app.get("/produtos/:slug", (request, response) => {

    response.sendFile(path.join(__dirname, "views", "products", "detail.html"));

});



app.get("/api", (request, response) => {

    response.status(200).json({

        success: true,

        message: "Bem-vindo a API do PetFlow."

    });

});

app.use("/api", healthRoutes);

/* ==================================================
   ROTAS API
================================================== */

app.use("/api/auth", authRoutes);

app.use("/api/public/pagamentos", publicPaymentRoutes);

app.use("/api/public", publicCatalogRoutes);

app.use("/api/clientes", clienteRoutes);



app.use("/api/empresa", empresaRoutes);

app.use("/api/categorias", categoriaRoutes);

app.use("/api/produtos", produtoRoutes);

app.use("/api/estoque", estoqueRoutes);

app.use("/api/vendas", vendaRoutes);

app.use("/api/itens-venda", itemVendaRoutes);


app.use("/api/fornecedores", fornecedorRoutes);

app.use("/api/compras", compraRoutes);

app.use("/api/itens-compra", itemCompraRoutes);

app.use("/api/financeiro", financeiroRoutes);
app.use("/api/cupons", cupomAdminRoutes);
app.use("/api/usuarios-admin", usuarioAdminRoutes);
app.use("/api/auditoria", auditoriaRoutes);
app.use("/api/lgpd", lgpdAdminRoutes);
app.use("/api/atendimento", consumerRequestAdminRoutes);

/* ==========================
   DASHBOARD
========================== */

app.use("/api/dashboard", dashboardRoutes);

/* ==================================================
   ROTA NÃO ENCONTRADA
================================================== */

app.use((request, response) => {

    response.status(404).json({

        success: false,

        message: "Rota não encontrada."

    });

});

/* ==================================================
   MIDDLEWARE DE ERRO
================================================== */

app.use(errorMiddleware);

/* ==================================================
   EXPORTAÇÃO
================================================== */

module.exports = app;
