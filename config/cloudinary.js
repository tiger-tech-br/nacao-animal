"use strict";

require("dotenv").config({ quiet: true });
const cloudinary = require("cloudinary").v2;
const credentials = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim()
};
cloudinary.config({ ...credentials, secure: true });

function isCloudinaryConfigured() {
    return Object.values(credentials).every(value =>
        Boolean(value) && !/^(?:seu_|sua_|your_|changeme|change_me|troque_|example|demo$)/i.test(value)
    );
}
function assertCloudinaryConfigured() {
    if (!isCloudinaryConfigured()) {
        throw Object.assign(new Error("Upload indisponível. Configure as credenciais do Cloudinary no servidor."), {
            status: 503, expose: true, code: "CLOUDINARY_NOT_CONFIGURED"
        });
    }
}
async function testCloudinary() {
    assertCloudinaryConfigured();
    try {
        const result = await cloudinary.api.ping({ timeout: 10000 });
        if (result.status !== "ok") throw new Error("Ping recusado");
        return result;
    } catch {
        throw Object.assign(new Error("Não foi possível autenticar no Cloudinary. Confira as credenciais e a conexão do servidor."), {
            status: 503, expose: true, code: "CLOUDINARY_CONNECTION_FAILED"
        });
    }
}
module.exports = { cloudinary, isCloudinaryConfigured, assertCloudinaryConfigured, testCloudinary };
