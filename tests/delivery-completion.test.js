"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const token = "a".repeat(64);
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const receipt = { id: "11111111-1111-4111-8111-111111111111", status: "ENTREGUE",
    entregue_em: "2026-10-25T12:00:00.000Z", concluida_pelo_entregador: true };
const complete = { id: receipt.id, status: "ENTREGUE", entregueEm: receipt.entregue_em, changed: true, emailStatus: "sent" };
let completionCalls, receiptCalls, databaseCalls, completionError, receiptResult;
require.cache[require.resolve("../database/connection")] = { exports: {
    async query() { databaseCalls++; return { rows: [] }; },
    async transaction() { databaseCalls++; assert.fail("Controller delega a transação ao serviço de conclusão"); }
} };
require.cache[require.resolve("../config/env")] = { exports: { APP_URL: "https://demo.example.invalid", RESEND_API_KEY: "", EMAIL_FROM: "" } };
require.cache[require.resolve("../services/freteService")] = { exports: {} };
require.cache[require.resolve("../services/deliveryCompletionService")] = { exports: {
    async concluir(hash) {
        completionCalls.push(hash);
        if (completionError) throw completionError;
        return complete;
    },
    async receipt(hash) { receiptCalls.push(hash); return receiptResult; }
} };
const controller = require("../controllers/entregaController");

function reset() {
    completionCalls = []; receiptCalls = []; databaseCalls = 0;
    completionError = null; receiptResult = receipt;
}
async function invoke(name, body, authorization = `Bearer ${token}`, extra = {}) {
    let error;
    const res = { headers: {}, set(name, value) { this.headers[name] = value; return this; },
        json(value) { this.body = value; return this; } };
    await controller[name]({ method: name === "viagem" ? "GET" : "POST", body,
        get: name=>name.toLowerCase()==="authorization" ? authorization : undefined, ...extra },res,caught=>{error=caught;});
    return { ...res,error };
}

test("conclusão pelo entregador exige o Bearer privado antes de consultar banco ou serviço", async()=>{
    for (const authorization of [null,"","Basic "+token,"Bearer customer.jwt.signature","Bearer admin.jwt.signature",
        "Bearer "+"a".repeat(63),"Bearer "+"A".repeat(64),"Bearer "+token+" extra"]) {
        reset();
        const result = await invoke("concluir",{confirmar:true},authorization,
            { user:{id:"admin",empresaId:"store"},customer:{id:"customer"},query:{token},params:{token} });
        assert.equal(result.error?.status,401,authorization);
        assert.equal(result.body,undefined);
        assert.equal(databaseCalls,0);
        assert.deepEqual(completionCalls,[]);
        assert.deepEqual(receiptCalls,[]);
    }
});

test("conclusão recusa confirmação ausente, falsa ou campos adicionais antes de mutar a entrega",async()=>{
    for (const body of [undefined,null,[],"true",true,{}, {confirmar:false},{confirmar:1},{confirmar:"true"},
        {confirmar:true,status:"ENTREGUE"},{confirmar:true,id:receipt.id},{confirmar:true,latitude:0},
        {confirmar:true,cliente_id:"other-customer"}]) {
        reset();
        const result = await invoke("concluir",body);
        assert.equal(result.error?.status,400,JSON.stringify(body));
        assert.equal(result.body,undefined);
        assert.equal(databaseCalls,0);
        assert.deepEqual(completionCalls,[]);
    }
});

test("conclusão válida passa somente o hash ao serviço e devolve confirmação sem endereço",async()=>{
    reset();
    const result = await invoke("concluir",{confirmar:true});
    assert.equal(result.error,undefined);
    assert.deepEqual(completionCalls,[tokenHash]);
    assert.equal(databaseCalls,0);
    assert.deepEqual(result.body,{success:true,data:complete});
    assert.equal(result.headers["Cache-Control"],"no-store");
    assert.equal(result.body.data.endereco_entrega,undefined);
    assert.ok(!JSON.stringify(result.body).includes(token));
});

test("link expirado, revogado ou status bloqueado não vira resposta de sucesso",async()=>{
    for (const status of [410,409]) {
        reset();
        completionError = Object.assign(new Error("Entrega indisponível"),{status});
        const result = await invoke("concluir",{confirmar:true});
        assert.equal(result.error,completionError);
        assert.equal(result.body,undefined);
        assert.deepEqual(completionCalls,[tokenHash]);
    }
});

test("viagem concluída pelo mesmo link devolve só o recibo após limpeza do rastreamento",async()=>{
    reset();
    const result = await invoke("viagem");
    assert.equal(result.error,undefined);
    assert.equal(databaseCalls,1);
    assert.deepEqual(receiptCalls,[tokenHash]);
    assert.deepEqual(result.body,{success:true,data:receipt});
    assert.equal(result.headers["Cache-Control"],"no-store");
    for (const field of ["endereco_entrega","latitude","longitude","rota","compartilhamento","token_hash"])
        assert.equal(result.body.data[field],undefined);
});

test("recibo ausente ou expirado mantém a viagem encerrada e não consulta dados por ID informado",async()=>{
    reset(); receiptResult = null;
    const result = await invoke("viagem",undefined,`Bearer ${token}`,{query:{id:receipt.id}});
    assert.equal(result.error?.status,410);
    assert.equal(result.body,undefined);
    assert.deepEqual(receiptCalls,[tokenHash]);
});
