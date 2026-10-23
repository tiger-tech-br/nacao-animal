"use strict";

// Confere exclusivamente a demonstracao configurada. Credenciais e token
// permanecem em memoria; nao cria clientes/pedidos nem envia mensagens.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { target } = require("./configure-railway-demo");
const { loadRemoteContext } = require("./bootstrap-railway-demo-db");

async function main() {
    const envPath = path.join(__dirname, "..", ".env");
    const digest = () => crypto.createHash("sha256").update(fs.readFileSync(envPath)).digest("hex");
    const before = digest();
    const context = loadRemoteContext();
    const base = `https://${target.domain}`;
    const request = (url, options = {}) => fetch(url, { ...options,
        redirect: "error", signal: AbortSignal.timeout(25000) });
    const paths = ["/", "/admin/", "/login", "/produtos", "/api/health",
        "/api/public/produtos", "/api/public/categorias"];
    const pages = await Promise.all(paths.map(async pathname => {
        const response = await request(base + pathname);
        const body = pathname.startsWith("/api/") ? await response.json() : (await response.text(), null);
        if (response.status !== 200 || (body && body.success !== true)) throw new Error("REMOTE_PAGE_FAILED");
        return { pathname, status: response.status, body };
    }));
    const products = pages.find(page => page.pathname === "/api/public/produtos").body.data;
    if (!Array.isArray(products) || !products.length) throw new Error("REMOTE_CATALOG_EMPTY");
    const pictures = [...new Set(products.map(product => product.foto))];
    if (pictures.some(picture => typeof picture !== "string" || !/^\/images\/products\/[a-z0-9-]+\.jpg$/.test(picture))) {
        throw new Error("REMOTE_PICTURES_UNEXPECTED");
    }
    await Promise.all(pictures.map(async picture => {
        const response = await request(base + picture);
        const contentType = response.headers.get("content-type") || "";
        await response.arrayBuffer();
        if (response.status !== 200 || !contentType.startsWith("image/")) throw new Error("REMOTE_PICTURE_FAILED");
    }));
    const login = await request(base + "/api/auth/login", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: context.appVariables.ADMIN_EMAIL, senha: context.appVariables.ADMIN_PASSWORD }) });
    const logged = await login.json();
    if (login.status !== 200 || !logged.success || typeof logged.data?.token !== "string") throw new Error("REMOTE_ADMIN_LOGIN_FAILED");
    const authenticated = await request(base + "/api/auth/me", {
        headers: { Authorization: `Bearer ${logged.data.token}` } });
    const profile = await authenticated.json();
    if (authenticated.status !== 200 || !profile.success || profile.data?.perfil !== "ADMIN") throw new Error("REMOTE_ADMIN_PROFILE_FAILED");
    // Token descartado: nao revogar outras sessoes administrativas do usuario.
    const local = await request("http://localhost:4600/api/health");
    const localHealth = await local.json();
    if (local.status !== 200 || localHealth.success !== true || before !== digest()) throw new Error("LOCAL_PRESERVATION_FAILED");
    console.log(JSON.stringify({ url: base, pages: pages.map(({ pathname, status }) => ({ pathname, status })),
        products: products.length, pictures: pictures.length, adminLogin: "ok", adminProfile: "ok",
        paymentsEnabled: false, localStatus: local.status, localEnvUnchanged: true }));
}

if (require.main === module) main().catch(error => {
    const code = /^(REMOTE_[A-Z_]+|LOCAL_PRESERVATION_FAILED)$/.test(error.message || "") ? error.message : "VERIFICATION_FAILED";
    console.error(`${code}: Verificacao nao concluiu; nenhum dado privado foi exibido.`);
    process.exitCode = 1;
});

module.exports = { main };
