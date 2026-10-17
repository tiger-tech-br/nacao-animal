"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { EventEmitter } = require("node:events");

function isolatedModule(relative, overrides, env = {}) {
    const filename = path.resolve(__dirname, "..", relative);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module, exports: module.exports, Buffer, URL, console: { error() {} },
        process: { env },
        require(name) { return Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name); }
    }, { filename });
    return module.exports;
}

function configured(env, ping = async () => ({ status: "ok" })) {
    let options;
    const sdk = { config(value) { if (value) options = value; return options; }, api: { ping } };
    return { config: isolatedModule("config/cloudinary.js", {
        dotenv: { config() {} }, cloudinary: { v2: sdk }
    }, env), sdk };
}

const credentials = {
    CLOUDINARY_CLOUD_NAME: "test-cloud", CLOUDINARY_API_KEY: "123456789012345",
    CLOUDINARY_API_SECRET: "only-a-fake-secret"
};

test("Cloudinary exige as três credenciais e rejeita placeholders", () => {
    for (const key of Object.keys(credentials)) {
        for (const invalid of [undefined, "", "  ", "seu_valor", "sua_chave", "your_key", "changeme", "change_me", "troque_aqui", "example", "demo"]) {
            const { config } = configured({ ...credentials, [key]: invalid });
            assert.equal(config.isCloudinaryConfigured(), false, `${key}: ${invalid}`);
            assert.throws(config.assertCloudinaryConfigured, error => error.status === 503 && error.code === "CLOUDINARY_NOT_CONFIGURED");
        }
    }
});

test("credenciais são aparadas e o SDK usa HTTPS", () => {
    const { config, sdk } = configured(Object.fromEntries(Object.entries(credentials).map(([key, value]) => [key, ` ${value} `])));
    assert.equal(config.isCloudinaryConfigured(), true);
    assert.equal(sdk.config().cloud_name, credentials.CLOUDINARY_CLOUD_NAME);
    assert.equal(sdk.config().api_key, credentials.CLOUDINARY_API_KEY);
    assert.equal(sdk.config().api_secret, credentials.CLOUDINARY_API_SECRET);
    assert.equal(sdk.config().secure, true);
});

test("ping usa timeout e só confirma resposta ok", async () => {
    let pingOptions;
    const { config } = configured(credentials, async options => { pingOptions = options; return { status: "ok" }; });
    assert.equal((await config.testCloudinary()).status, "ok");
    assert.equal(pingOptions.timeout, 10000);
    for (const response of [null, {}, { status: "error" }]) {
        await assert.rejects(configured(credentials, async () => response).config.testCloudinary(), error =>
            error.status === 503 && error.code === "CLOUDINARY_CONNECTION_FAILED");
    }
});

test("ping sanitiza erros do provedor sem divulgar credenciais", async () => {
    const privateMessage = `secret=${credentials.CLOUDINARY_API_SECRET} cloud_name mismatch`;
    const { config } = configured(credentials, async () => { throw new Error(privateMessage); });
    await assert.rejects(config.testCloudinary(), error => {
        assert.equal(error.status, 503);
        assert.equal(error.expose, true);
        assert.equal(error.code, "CLOUDINARY_CONNECTION_FAILED");
        assert.doesNotMatch(error.message, /only-a-fake-secret|cloud_name mismatch/);
        return true;
    });
});

test("ping não acessa SDK quando as credenciais estão ausentes", async () => {
    let called = false;
    const { config } = configured({}, async () => { called = true; });
    await assert.rejects(config.testCloudinary(), error => error.code === "CLOUDINARY_NOT_CONFIGURED");
    assert.equal(called, false);
});

function imageFixture(options = {}) {
    const calls = { uploads: [], destroys: [] };
    const cloudinary = {
        config: () => ({ cloud_name: "test-cloud" }),
        uploader: {
            upload_stream(uploadOptions, callback) {
                calls.uploads.push(uploadOptions);
                const stream = new EventEmitter();
                stream.end = buffer => {
                    calls.buffer = buffer;
                    if (options.throwError) throw options.throwError;
                    if (options.streamError) return stream.emit("error", options.streamError);
                    callback(options.error, Object.hasOwn(options, "result") ? options.result : {
                        public_id: "petflow-v2/new-image", secure_url: "https://res.cloudinary.com/test-cloud/image/upload/v1/petflow-v2/new-image.png"
                    });
                };
                return stream;
            },
            async destroy(publicId, destroyOptions) {
                calls.destroys.push({ publicId, options: destroyOptions });
                if (options.beforeDestroy) await options.beforeDestroy();
                if (options.destroyError) throw options.destroyError;
                return { result: options.destroyResult || "ok" };
            }
        }
    };
    const images = isolatedModule("services/imageService.js", {
        "node:crypto": { randomUUID: () => "new-image" },
        "../config/cloudinary": { cloudinary, assertCloudinaryConfigured() {
            if (options.unconfigured) throw Object.assign(new Error("Credenciais ausentes"), { status: 503, code: "CLOUDINARY_NOT_CONFIGURED" });
        } }
    });
    return { images, calls };
}

test("upload mantém buffer em memória, usa ID exclusivo e formatos permitidos", async () => {
    const { images, calls } = imageFixture();
    const buffer = Buffer.from("fake-image");
    const result = await images.uploadImage({ buffer });
    assert.equal(result.publicId, "petflow-v2/new-image");
    assert.equal(result.url, "https://res.cloudinary.com/test-cloud/image/upload/v1/petflow-v2/new-image.png");
    assert.equal(calls.buffer, buffer);
    const options = calls.uploads[0];
    assert.equal(options.folder, "petflow-v2");
    assert.equal(options.public_id, "new-image");
    assert.equal(options.overwrite, false);
    assert.equal(options.resource_type, "image");
    assert.deepEqual(Array.from(options.allowed_formats), ["jpg", "jpeg", "png", "webp"]);
    assert.equal(options.timeout, 60000);
});

test("upload sem arquivo não exige configuração, mas arquivo vazio é 400", async () => {
    const { images, calls } = imageFixture({ unconfigured: true });
    assert.equal(await images.uploadImage(), null);
    for (const buffer of [undefined, Buffer.alloc(0), "fake-image"]) {
        await assert.rejects(images.uploadImage({ buffer }), error => error.status === 400);
    }
    await assert.rejects(images.uploadImage({ buffer: Buffer.from("fake") }), error => error.code === "CLOUDINARY_NOT_CONFIGURED");
    assert.equal(calls.uploads.length, 0);
});

test("conteúdo inválido, rede e erros de stream recebem mensagens sanitizadas", async () => {
    for (const options of [
        { error: { http_code: 400, message: "secret=private" } },
        { error: { http_code: 401, message: "secret=private" } },
        { streamError: new Error("secret=private") },
        { throwError: new Error("secret=private") }
    ]) {
        const { images } = imageFixture(options);
        await assert.rejects(images.uploadImage({ buffer: Buffer.from("fake") }), error => {
            assert.equal(error.status, options.error?.http_code === 400 ? 400 : 503);
            assert.doesNotMatch(error.message, /secret|private/);
            return true;
        });
    }
});

test("upload rejeita resposta malformada e limpa somente o asset recém-solicitado", async () => {
    for (const result of [null, {},
        { public_id: "petflow-v2/new-image", secure_url: "http://invalid.test/image.png" },
        { public_id: "petflow-v2/new-image", secure_url: "https://res.cloudinary.com/other/image/upload/v1/petflow-v2/new-image.png" },
        { public_id: "petflow-v2/existing-product", secure_url: "https://res.cloudinary.com/test-cloud/image/upload/v1/petflow-v2/existing-product.png" }
    ]) {
        const { images, calls } = imageFixture({ result });
        await assert.rejects(images.uploadImage({ buffer: Buffer.from("fake") }), error => error.code === "CLOUDINARY_UPLOAD_FAILED");
        assert.deepEqual(calls.destroys.map(call => call.publicId), result?.public_id === "petflow-v2/new-image" ? ["petflow-v2/new-image"] : []);
    }
});

test("resposta malformada espera concluir limpeza antes de rejeitar upload", async () => {
    let finishCleanup;
    const cleanup = new Promise(resolve => { finishCleanup = resolve; });
    const { images, calls } = imageFixture({
        result: { public_id: "petflow-v2/new-image", secure_url: "invalid" },
        beforeDestroy: () => cleanup
    });
    let rejected = false;
    const pending = images.uploadImage({ buffer: Buffer.from("fake") }).catch(error => {
        rejected = true;
        return error;
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.destroys.length, 1);
    assert.equal(rejected, false);
    finishCleanup();
    assert.equal((await pending).code, "CLOUDINARY_UPLOAD_FAILED");
    assert.equal(rejected, true);
});

test("limpeza reconhece apenas URL HTTPS original da conta e pasta gerenciadas", () => {
    const { images } = imageFixture();
    const url = "https://res.cloudinary.com/test-cloud/image/upload/v123/petflow-v2/products/photo.webp";
    assert.equal(images.getImagePublicId(url), "petflow-v2/products/photo");
    assert.equal(images.getImagePublicId(url, "petflow-v2/products/photo"), "petflow-v2/products/photo");
    for (const invalid of [
        url.replace("https:", "http:"), url.replace("test-cloud", "other-cloud"),
        url.replace("res.cloudinary.com", "res.cloudinary.com.evil.test"),
        url.replace("res.cloudinary.com", "user@res.cloudinary.com"),
        url.replace("res.cloudinary.com", "res.cloudinary.com:444"),
        url.replace("petflow-v2", "another-app"), url.replace("v123/", "c_fill,w_100/"),
        url.replace("photo.webp", "%2E%2E/other.webp"), url.replace("photo.webp", "../other.webp"),
        url.replace("photo.webp", "..\\other.webp"), "invalid", null
    ]) assert.equal(images.getImagePublicId(invalid), null, String(invalid));
    assert.equal(images.getImagePublicId(url, "petflow-v2/different"), null);
});

test("destroy invalida CDN, aceita arquivo já ausente e rejeita IDs externos", async () => {
    const { images, calls } = imageFixture({ destroyResult: "not found" });
    await images.removeImage("petflow-v2/old-image");
    assert.equal(calls.destroys[0].options.invalidate, true);
    assert.equal(calls.destroys[0].options.resource_type, "image");
    assert.equal(calls.destroys[0].options.timeout, 10000);
    for (const id of ["other/image", "petflow-v2/../image", "petflow-v2", null]) await assert.rejects(images.removeImage(id));
    assert.equal(calls.destroys.length, 1);
    await assert.rejects(imageFixture({ destroyResult: "pending" }).images.removeImage("petflow-v2/old-image"));
});

test("falha de cleanup não desfaz operação comercial", async () => {
    const { images } = imageFixture({ destroyError: new Error("private-secret") });
    await assert.doesNotReject(images.removeImageSafely("petflow-v2/old-image"));
    await assert.doesNotReject(images.removeImageSafely(null));
});
