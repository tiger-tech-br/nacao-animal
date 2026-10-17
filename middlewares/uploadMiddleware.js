"use strict";

const multer = require("multer");
const maxFileSize = process.env.MAX_FILE_SIZE?.trim()
    ? Number(process.env.MAX_FILE_SIZE) : 5 * 1024 * 1024;
if (!Number.isSafeInteger(maxFileSize) || maxFileSize <= 0 || maxFileSize > 20 * 1024 * 1024) {
    throw new Error("MAX_FILE_SIZE deve ser um inteiro entre 1 e 20971520 bytes (20 MB).");
}
// O arquivo só chega ao Cloudinary depois da validação e da busca do registro.
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter(request, file, callback) {
        if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.mimetype)) {
            return callback(Object.assign(new Error("Formato de imagem não permitido. Envie JPG, PNG ou WebP."), {
                status: 400, code: "INVALID_IMAGE_FORMAT"
            }));
        }
        callback(null, true);
    },
    limits: { fileSize: maxFileSize, files: 1, fields: 32, fieldSize: 64 * 1024, parts: 33 }
});
module.exports = upload;
