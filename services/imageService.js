"use strict";

const { randomUUID } = require("node:crypto");
const { cloudinary, assertCloudinaryConfigured } = require("../config/cloudinary");
const folder = "petflow-v2";
function ownedPublicId(publicId) {
    return typeof publicId === "string" &&
        /^petflow-v2\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(publicId);
}
function imageError(error) {
    if (Number(error?.http_code) === 400) {
        return Object.assign(new Error("Imagem inválida. Envie um arquivo JPG, PNG ou WebP válido."), {
            status: 400, code: "INVALID_IMAGE_CONTENT"
        });
    }
    return Object.assign(new Error("Não foi possível enviar a imagem. Tente novamente em alguns minutos."), {
        status: 503, expose: true, code: "CLOUDINARY_UPLOAD_FAILED"
    });
}
async function uploadImage(file) {
    if (!file) return null;
    if (!Buffer.isBuffer(file.buffer) || !file.buffer.length) {
        throw Object.assign(new Error("O arquivo de imagem está vazio."), { status: 400 });
    }
    assertCloudinaryConfigured();
    const requestedId = randomUUID();
    const expectedPublicId = `${folder}/${requestedId}`;
    return new Promise((resolve, reject) => {
        try {
            const stream = cloudinary.uploader.upload_stream({
                folder, public_id: requestedId, overwrite: false,
                resource_type: "image", allowed_formats: ["jpg", "jpeg", "png", "webp"],
                timeout: 60000
            }, async (error, result) => {
                if (error) return reject(imageError(error));
                if (result?.public_id !== expectedPublicId || !getImagePublicId(result?.secure_url, expectedPublicId)) {
                    // Uma resposta incompleta pode ter criado o arquivo. Só limpamos o ID
                    // aleatório deste pedido, nunca um asset inesperado retornado pelo SDK.
                    if (result?.public_id === expectedPublicId) await removeImageSafely(expectedPublicId);
                    return reject(imageError());
                }
                resolve({ url: result.secure_url, publicId: result.public_id });
            });
            stream.on("error", error => reject(imageError(error)));
            stream.end(file.buffer);
        } catch (error) {
            reject(imageError(error));
        }
    });
}
// URLs antigas só podem ser removidas se forem originais desta conta e desta pasta.
function getImagePublicId(imageUrl, storedPublicId) {
    try {
        // URL normaliza segmentos ".." antes da inspeção; recusamos a entrada
        // original para que um caminho alterado não autorize a limpeza de outro asset.
        if (typeof imageUrl !== "string" || imageUrl.includes("\\") ||
            /(?:\/|%2f)(?:\.|%2e){1,2}(?=\/|%2f|[?#]|$)/i.test(imageUrl)) return null;
        const url = new URL(imageUrl);
        if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.port || url.username || url.password) return null;
        const cloudName = cloudinary.config().cloud_name;
        const prefix = `/${cloudName}/image/upload/`;
        if (!url.pathname.startsWith(prefix)) return null;
        const publicId = decodeURIComponent(url.pathname.slice(prefix.length))
            .replace(/^v\d+\//, "").replace(/\.(?:jpe?g|png|webp)$/i, "");
        if (!ownedPublicId(publicId)) return null;
        if (storedPublicId && storedPublicId !== publicId) return null;
        return publicId;
    } catch { return null; }
}
async function removeImage(publicId) {
    if (!ownedPublicId(publicId)) throw new Error("Imagem fora da pasta gerenciada pelo PetFlow v2.");
    assertCloudinaryConfigured();
    const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image", type: "upload", invalidate: true, timeout: 10000
    });
    if (!["ok", "not found"].includes(result?.result)) throw new Error("Remoção de imagem recusada.");
}
async function removeImageSafely(publicId) {
    if (!publicId) return;
    try { await removeImage(publicId); }
    catch {
        console.error("[cloudinary] Falha ao limpar imagem sem uso.", { code: "CLOUDINARY_CLEANUP_FAILED", publicId });
    }
}
module.exports = { uploadImage, getImagePublicId, removeImage, removeImageSafely };
