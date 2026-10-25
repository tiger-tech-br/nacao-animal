"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const express = require("express");

// Módulos isolados impedem carregar .env, conectar PostgreSQL ou chamar Cloudinary.
function isolatedModule(relative, overrides = {}, env = {}) {
    const filename = path.resolve(__dirname, "..", relative);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module, exports: module.exports, Buffer, console: { error() {} }, process: { env },
        require(name) { return Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name); }
    }, { filename });
    return module.exports;
}

const productId = "72b22596-546e-4e08-89ca-e864455abcaf";
const companyId = "b32f4d85-393c-4ec9-9cdb-4c3a8b717531";
const oldPublicId = "petflow-v2/old-image";
const newPublicId = "petflow-v2/new-image";
const imageUrl = id => `https://res.cloudinary.com/test-cloud/image/upload/v1/${id}.png`;
const productFields = {
    categoriaId: "7f54909f-bd74-4595-8736-bdfc425bc7cb", nome: "Ração teste",
    descricao: "Ração para teste de upload", sku: "TEST-IMAGE", preco: "10", custo: "5"
};
const companyFields = {
    nome: "Loja teste", razaoSocial: "Loja teste", cnpj: "12345678000190", telefone: "11999999999",
    email: "store@example.invalid", endereco: "Rua Teste", numero: "1", bairro: "Centro",
    cidade: "São Paulo", estado: "SP", cep: "01001000"
};

async function fixture(options, run) {
    const events = [];
    const previous = {
        id: options.company ? companyId : productId, nome: "Produto anterior",
        categoria_id: productFields.categoriaId, subcategoria: options.previousSubcategory || null,
        foto: imageUrl(oldPublicId), foto_public_id: oldPublicId,
        logo: imageUrl(oldPublicId), logo_public_id: oldPublicId
    };
    let savedPayload;
    const model = {
        async findById(id, empresaId) {
            events.push("lookup");
            assert.equal(id, options.company ? companyId : productId);
            if (!options.company) assert.equal(empresaId, companyId);
            return options.findMissing ? null : previous;
        },
        async create(payload) {
            events.push("save"); savedPayload = payload;
            if (options.dbFailure) throw new Error("database private details");
            return { id: productId, nome: payload.nome, foto: payload.foto, foto_public_id: payload.fotoPublicId };
        },
        async update(id, payload, empresaId) {
            events.push("save"); savedPayload = payload;
            assert.equal(id, options.company ? companyId : productId);
            if (!options.company) assert.equal(empresaId, companyId);
            if (options.dbFailure) throw new Error("database private details");
            if (options.saveMissing) return null;
            const result = { ...previous,
                foto: payload.foto || previous.foto, foto_public_id: payload.fotoPublicId || previous.foto_public_id,
                logo: payload.logo || previous.logo, logo_public_id: payload.logoPublicId || previous.logo_public_id
            };
            if (options.actualPrevious) Object.defineProperty(result, "previousImage", { value: options.actualPrevious });
            return result;
        }
    };
    const images = {
        async uploadImage(file) {
            if (!file) return null;
            events.push("upload");
            if (options.uploadFailure) throw Object.assign(new Error("Imagem inválida"), { status: 400 });
            return { url: imageUrl(newPublicId), publicId: newPublicId };
        },
        getImagePublicId(url, stored) {
            return url === imageUrl(stored) && stored.startsWith("petflow-v2/") ? stored : null;
        },
        async removeImageSafely(id) { if (id) events.push(`remove:${id}`); }
    };
    const audit = {
        requestMeta: () => ({}),
        async registrar() { events.push("audit"); if (options.auditFailure) throw new Error("audit private details"); }
    };
    const controller = isolatedModule(options.company ? "controllers/empresaController.js" : "controllers/produtoController.js", {
        "../models/produtoModel": model, "../models/empresaModel": model,
        "../models/categoriaModel": { async findById(id, empresaId) {
            assert.equal(id, productFields.categoriaId);
            assert.equal(empresaId, companyId);
            return options.categoryMissing ? null : { id, nome: options.categoryName || "Cães" };
        } },
        "../services/imageService": images, "../services/auditService": audit
    });
    // O Express recebe Promises do contexto nativo, não thenables de outro VM.
    const handlers = Object.fromEntries(Object.entries(controller).map(([name, handler]) =>
        [name, async (...args) => handler(...args)]));
    const upload = isolatedModule("middlewares/uploadMiddleware.js", {}, { MAX_FILE_SIZE: "32" });
    const router = isolatedModule(options.company ? "routes/empresaRoutes.js" : "routes/produtoRoutes.js", {
        "../controllers/produtoController": handlers, "../controllers/empresaController": handlers,
        "../middlewares/uploadMiddleware": upload,
        "../middlewares/authMiddleware": (request, response, next) => {
            request.user = { empresaId: companyId, role: "ADMIN" }; next();
        },
        "../middlewares/roleMiddleware": () => (request, response, next) => next()
    });
    const app = express();
    app.use("/images", router);
    app.use(isolatedModule("middlewares/errorMiddleware.js", {}, { NODE_ENV: "production" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(settings = {}) {
        const form = new FormData();
        const fields = { ...(options.company ? companyFields : productFields), ...settings.fields };
        for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
        if (!settings.noFile) form.append(settings.fileField || (options.company ? "logo" : "foto"),
            new Blob([settings.buffer || Buffer.from("fake-image")], { type: settings.mime || "image/png" }), "photo.png");
        if (settings.secondFile) form.append(options.company ? "logo" : "foto",
            new Blob([Buffer.from("second-image")], { type: "image/png" }), "second.png");
        const method = settings.method || (options.store ? "POST" : "PUT");
        const url = options.company || options.store ? "/images" : `/images/${settings.id || productId}`;
        const response = await fetch(base + url, { method, body: form });
        return { status: response.status, body: await response.json() };
    }
    try { await run({ request, events, get payload() { return savedPayload; } }); }
    finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}

test("multipart rejeita MIME inválido com 400 antes de Cloudinary e banco", async () => {
    await fixture({ store: true }, async ({ request, events }) => {
        const result = await request({ mime: "text/plain" });
        assert.equal(result.status, 400);
        assert.match(result.body.message, /Formato de imagem/);
        assert.deepEqual(events, []);
    });
});

test("multipart rejeita imagem grande com 413 antes de Cloudinary e banco", async () => {
    await fixture({ store: true }, async ({ request, events }) => {
        const result = await request({ buffer: Buffer.alloc(33) });
        assert.equal(result.status, 413);
        assert.match(result.body.message, /limite de tamanho/);
        assert.deepEqual(events, []);
    });
});

test("multipart aceita somente o campo correto e uma imagem", async () => {
    await fixture({ store: true }, async ({ request, events }) => {
        assert.equal((await request({ fileField: "logo" })).status, 400);
        assert.equal((await request({ secondFile: true })).status, 400);
        assert.deepEqual(events, []);
    });
});

test("limite de upload inválido impede configuração silenciosa sem proteção", () => {
    for (const invalid of ["0", "-1", "1.5", "NaN", "20971521"]) {
        assert.throws(() => isolatedModule("middlewares/uploadMiddleware.js", {}, { MAX_FILE_SIZE: invalid }), /MAX_FILE_SIZE/);
    }
});

test("validação de produto inválido termina antes do upload", async () => {
    await fixture({ store: true }, async ({ request, events }) => {
        const result = await request({ fields: { nome: "", categoriaId: "bad-id", preco: "-10" } });
        assert.equal(result.status, 400);
        assert.deepEqual(events, []);
    });
});

test("ID de produto inválido termina antes de buscar ou enviar imagem", async () => {
    await fixture({}, async ({ request, events }) => {
        assert.equal((await request({ id: "bad-id" })).status, 400);
        assert.deepEqual(events, []);
    });
});

test("cadastro exige foto não vazia antes de salvar", async () => {
    await fixture({ store: true }, async ({ request, events }) => {
        for (const settings of [{ noFile: true }, { buffer: Buffer.alloc(0) }]) {
            assert.equal((await request(settings)).status, 400);
        }
        assert.deepEqual(events, []);
    });
});

test("cadastro salva URL e public_id antes de confirmar sucesso", async () => {
    await fixture({ store: true }, async state => {
        assert.equal((await state.request()).status, 201);
        assert.equal(state.payload.empresaId, companyId);
        assert.equal(state.payload.foto, imageUrl(newPublicId));
        assert.equal(state.payload.fotoPublicId, newPublicId);
        assert.deepEqual(state.events, ["upload", "save", "audit"]);
    });
});

test("produto recusa subcategoria incompatível ou categoria de outra loja antes de enviar a imagem", async () => {
    await fixture({ store: true, categoryName: "Peixes" }, async ({ request, events }) => {
        const response = await request({ fields: { subcategoria: "racoes-umidas" } });
        assert.equal(response.status, 400);
        assert.match(response.body.message, /subcategoria válida/);
        assert.deepEqual(events, []);
    });
    await fixture({ store: true, categoryMissing: true }, async ({ request, events }) => {
        assert.equal((await request({ fields: { subcategoria: "acessorios" } })).status, 400);
        assert.deepEqual(events, []);
    });
});

test("produto normaliza a subcategoria e preserva classificação ao editar sem esse campo", async () => {
    await fixture({ store: true }, async state => {
        assert.equal((await state.request({ fields: { subcategoria: "Rações úmidas" } })).status, 201);
        assert.equal(state.payload.subcategoria, "racoes-umidas");
    });
    await fixture({ previousSubcategory: "racoes-umidas" }, async state => {
        assert.equal((await state.request({ noFile: true })).status, 200);
        assert.equal(state.payload.subcategoria, "racoes-umidas");
        assert.equal((await state.request({ noFile: true, fields: { subcategoria: "" } })).status, 200);
        assert.equal(state.payload.subcategoria, null);
    });
});

test("falha no cadastro limpa imagem nova e mantém erro sanitizado", async () => {
    await fixture({ store: true, dbFailure: true }, async ({ request, events }) => {
        const result = await request();
        assert.equal(result.status, 500);
        assert.doesNotMatch(result.body.message, /private|database/);
        assert.deepEqual(events, ["upload", "save", `remove:${newPublicId}`]);
    });
});

test("auditoria falhando depois do cadastro preserva a imagem salva", async () => {
    await fixture({ store: true, auditFailure: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 500);
        assert.deepEqual(events, ["upload", "save", "audit"]);
    });
});

test("produto inexistente responde 404 sem enviar foto", async () => {
    await fixture({ findMissing: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 404);
        assert.deepEqual(events, ["lookup"]);
    });
});

test("falha ao atualizar limpa foto nova e preserva foto anterior", async () => {
    await fixture({ dbFailure: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 500);
        assert.deepEqual(events, ["lookup", "upload", "save", `remove:${newPublicId}`]);
    });
});

test("produto desaparecendo durante gravação limpa foto nova e responde 404", async () => {
    await fixture({ saveMissing: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 404);
        assert.deepEqual(events, ["lookup", "upload", "save", `remove:${newPublicId}`]);
    });
});

test("troca de foto remove imagem anterior somente depois da gravação", async () => {
    await fixture({}, async state => {
        assert.equal((await state.request()).status, 200);
        assert.equal(state.payload.replaceImage, true);
        assert.equal(state.payload.fotoPublicId, newPublicId);
        assert.deepEqual(state.events, ["lookup", "upload", "save", `remove:${oldPublicId}`, "audit"]);
    });
});

test("troca concorrente limpa previousImage devolvida pelo banco", async () => {
    const latestId = "petflow-v2/last-committed-image";
    await fixture({ actualPrevious: { url: imageUrl(latestId), publicId: latestId } }, async ({ request, events }) => {
        assert.equal((await request()).status, 200);
        assert.deepEqual(events, ["lookup", "upload", "save", `remove:${latestId}`, "audit"]);
    });
});

test("auditoria falhando depois da troca preserva a foto nova", async () => {
    await fixture({ auditFailure: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 500);
        assert.deepEqual(events, ["lookup", "upload", "save", `remove:${oldPublicId}`, "audit"]);
    });
});

test("edição sem arquivo preserva a foto e desativa substituição no banco", async () => {
    await fixture({}, async state => {
        assert.equal((await state.request({ noFile: true })).status, 200);
        assert.equal(state.payload.foto, imageUrl(oldPublicId));
        assert.equal(state.payload.fotoPublicId, oldPublicId);
        assert.equal(state.payload.replaceImage, false);
        assert.deepEqual(state.events, ["lookup", "save", "audit"]);
    });
});

test("falha de conteúdo da imagem não altera registro nem remove foto antiga", async () => {
    await fixture({ uploadFailure: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 400);
        assert.deepEqual(events, ["lookup", "upload"]);
    });
});

test("validação da empresa acontece antes de enviar logo", async () => {
    await fixture({ company: true }, async ({ request, events }) => {
        assert.equal((await request({ fields: { email: "bad-email" } })).status, 400);
        assert.deepEqual(events, []);
    });
});

test("empresa inexistente responde 404 sem enviar logo", async () => {
    await fixture({ company: true, findMissing: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 404);
        assert.deepEqual(events, ["lookup"]);
    });
});

test("troca de logo salva public_id e remove anterior após gravação", async () => {
    await fixture({ company: true }, async state => {
        assert.equal((await state.request()).status, 200);
        assert.equal(state.payload.logo, imageUrl(newPublicId));
        assert.equal(state.payload.logoPublicId, newPublicId);
        assert.equal(state.payload.replaceImage, true);
        assert.deepEqual(state.events, ["lookup", "upload", "save", `remove:${oldPublicId}`, "audit"]);
    });
});

test("falha no banco ao trocar logo limpa novo e preserva antigo", async () => {
    await fixture({ company: true, dbFailure: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 500);
        assert.deepEqual(events, ["lookup", "upload", "save", `remove:${newPublicId}`]);
    });
});

test("auditoria falhando depois da troca preserva logo novo", async () => {
    await fixture({ company: true, auditFailure: true }, async ({ request, events }) => {
        assert.equal((await request()).status, 500);
        assert.deepEqual(events, ["lookup", "upload", "save", `remove:${oldPublicId}`, "audit"]);
    });
});

test("edição sem arquivo preserva logo e desativa substituição no banco", async () => {
    await fixture({ company: true }, async state => {
        assert.equal((await state.request({ noFile: true })).status, 200);
        assert.equal(state.payload.logo, imageUrl(oldPublicId));
        assert.equal(state.payload.logoPublicId, oldPublicId);
        assert.equal(state.payload.replaceImage, false);
        assert.deepEqual(state.events, ["lookup", "save", "audit"]);
    });
});
