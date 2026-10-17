"use strict";

require("dotenv").config({ quiet: true });
const { testCloudinary } = require("../config/cloudinary");
const { uploadImage, removeImage } = require("../services/imageService");

async function main() {
    await testCloudinary();
    console.log("OK - Credenciais autenticadas no Cloudinary.");
    if (!process.argv.includes("--upload")) {
        console.log("Use --upload para validar envio e remoção de uma imagem temporária de 1 pixel.");
        return;
    }
    let image;
    try {
        image = await uploadImage({ buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64"
        ) });
        console.log("OK - Upload assinado e URL HTTPS recebida.");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(image.url, { signal: controller.signal });
            if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
                throw new Error("A imagem enviada não pôde ser entregue pela CDN.");
            }
            await response.arrayBuffer();
            console.log("OK - Imagem acessível pela CDN.");
        } finally { clearTimeout(timer); }
    } finally {
        if (image) {
            try {
                await removeImage(image.publicId);
                console.log("OK - Imagem temporária removida.");
            } catch {
                throw new Error(`Falha de limpeza. Remova somente a imagem temporária ${image.publicId} no Cloudinary.`);
            }
        }
    }
}
main().catch(error => {
    console.error(`FALHA - ${error.message}`);
    process.exitCode = 1;
});
