"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createGpsDiagnosticController, positionFromBody, storeAddress } = require("../controllers/gpsDiagnosticController");

const now = Date.parse("2026-10-23T15:00:00.000Z");
const position = { latitude: -23.66, longitude: -46.55, precisao: 10, timestamp: now };
const address = { endereco: "Avenida Publica da Loja", numero: "100", bairro: "Centro", cidade: "Santo André", estado: "sp", cep: "09060-820" };
const driverId = "e30ceaf8-85a4-4dc9-8b59-ae4f81e67880";
const driverFixture = { id: driverId, empresa_id: "company-a", ativo: true, meio_transporte: "BICICLETA", nome: "Entregador de teste" };
const route = { tipoOrigem: "GPS_ENTREGADOR", polyline: "fixture-polyline", origem: { latitude: -23.66, longitude: -46.55 },
    destino: { latitude: -23.67, longitude: -46.56 }, distanciaMetros: 1200, duracao: "180s", etapas: [], calculadaEm: new Date(now).toISOString() };

function response() {
    return { statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; },
        status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
}

function harness({ store = address, driver = driverFixture, providerError, dbError } = {}) {
    const queries = [], routeCalls = [], deliveryRouteCalls = [];
    const controller = createGpsDiagnosticController({ now: () => now,
        db: { async query(sql, values) {
            queries.push({ sql, values });
            assert.match(sql, /^SELECT\s/);
            assert.ok(!/\b(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ALTER|CREATE|DROP)\b/i.test(sql));
            if (dbError) throw dbError;
            if (/FROM empresas WHERE/.test(sql)) {
                assert.match(sql, /FROM empresas WHERE id=\$1 LIMIT 1/);
                return { rows: store ? [store] : [] };
            }
            assert.match(sql, /SELECT id,meio_transporte,nome FROM entregadores\s+WHERE id=\$1 AND empresa_id=\$2 AND ativo=TRUE LIMIT 1/);
            return { rows: driver?.id === values[0] && driver.empresa_id === values[1] && driver.ativo === true ? [driver] : [] };
        } },
        async calcularRota(receivedPosition, destination) {
            routeCalls.push({ position: receivedPosition, destination });
            if (providerError) throw providerError;
            return route;
        },
        async calcularRotaEntrega(receivedPosition, destination, meioTransporte) {
            deliveryRouteCalls.push({ position: receivedPosition, destination, meioTransporte });
            if (providerError) throw providerError;
            return { ...route, modo: { CARRO: "DRIVE", MOTO: "TWO_WHEELER", BICICLETA: "BICYCLE", A_PE: "WALK" }[meioTransporte] };
        }
    });
    return { controller, queries, routeCalls, deliveryRouteCalls };
}

test("diagnostico valida coordenadas, precisao e timestamp fresco sem coercoes", () => {
    assert.deepEqual(positionFromBody(position, now), position);
    assert.deepEqual(positionFromBody({ ...position, timestamp: new Date(now).toISOString() }, now), position);
    assert.deepEqual(positionFromBody({ ...position, entregadorId: driverId }, now), position);
    for (const body of [null, [], {}, { ...position, latitude: 91 }, { ...position, longitude: -181 },
        { ...position, latitude: "-23.66" }, { ...position, precisao: Infinity }, { ...position, precisao: -1 },
        { ...position, precisao: 101 }, { ...position, timestamp: now - 30001 }, { ...position, timestamp: now + 5001 },
        { ...position, timestamp: "invalid" }, { ...position, timestamp: String(now) }, { ...position, timestamp: null },
        { ...position, destino: address }, { ...position, empresaId: "other-company" }]) assert.equal(positionFromBody(body, now), null);
    assert.ok(positionFromBody({ ...position, timestamp: now - 30000, precisao: 100 }, now));
    assert.ok(positionFromBody({ ...position, timestamp: now + 5000 }, now));
});

test("destino deve ser endereco completo da loja, normalizado sem dados de cliente", () => {
    const parsed = storeAddress({ ...address, email: "private@example.invalid", latitude: 80, telefone: "ignored" });
    assert.equal(parsed.estado, "SP");
    assert.equal(parsed.cep, "09060820");
    assert.equal(parsed.complemento, "");
    assert.equal(parsed.email, undefined);
    for (const store of [null, { ...address, numero: null }, { ...address, cep: "bad" }, { ...address, estado: "XYZ" }, { ...address, endereco: {} }]) assert.equal(storeAddress(store), null);
});

test("controlador consulta somente empresa da sessao e chama rota existente sem gravar GPS/pedido", async () => {
    const h = harness(), res = response();
    await h.controller({ user: { empresaId: "authenticated-company", cargo: "ADMIN" }, body: position }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: route });
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.equal(h.queries.length, 1);
    assert.deepEqual(h.queries[0].values, ["authenticated-company"]);
    assert.deepEqual(h.routeCalls, [{ position: { latitude: position.latitude, longitude: position.longitude }, destination: storeAddress(address) }]);
    assert.ok(!JSON.stringify(h.queries).includes(String(position.latitude)));
});

test("diagnóstico usa por padrão a chamada interna a pé sem receber perfil no GPS",async()=>{
    const service=require("../services/entregaRotaService"),original=service.calcularRotaDiagnostico,calls=[];
    service.calcularRotaDiagnostico=async(...args)=>{calls.push(args);return{...route,modo:"WALK"};};
    try{
        const controller=createGpsDiagnosticController({now:()=>now,db:{query:async()=>({rows:[address]})}}),res=response();
        await controller({user:{empresaId:"authenticated-company",cargo:"ADMIN"},body:position},res);
        assert.equal(res.statusCode,200);assert.equal(res.body.data.modo,"WALK");
        assert.deepEqual(calls,[[{latitude:position.latitude,longitude:position.longitude},storeAddress(address)]]);
    }finally{service.calcularRotaDiagnostico=original;}
});

test("ADMIN ou GERENTE testa perfil do cadastro ativo sem aceitar transporte no GPS ou expor identificadores",async()=>{
    for(const cargo of ["ADMIN","GERENTE"]){
        for(const [meioTransporte,mode] of [["CARRO","DRIVE"],["MOTO","TWO_WHEELER"],["BICICLETA","BICYCLE"],["A_PE","WALK"]]){
            const h=harness({driver:{...driverFixture,meio_transporte:meioTransporte,nome:`  ${"José".repeat(60)}\u0000  `}}),res=response();
            await h.controller({user:{empresaId:"company-a",cargo},body:{...position,entregadorId:driverId}},res);
            assert.equal(res.statusCode,200);assert.equal(res.body.data.modo,mode);
            assert.equal(res.body.data.entregadorNome.length,150);assert.ok(!res.body.data.entregadorNome.includes("\u0000"));
            assert.equal(res.body.data.entregadorNome.startsWith("José"),true);
            assert.equal(res.body.data.id,undefined);assert.equal(res.body.data.entregadorId,undefined);
            assert.equal(res.body.data.empresa_id,undefined);assert.equal(res.body.data.meio_transporte,undefined);
            assert.equal(h.routeCalls.length,0);assert.equal(h.queries.length,2);
            assert.deepEqual(h.queries[1].values,[driverId,"company-a"]);
            assert.deepEqual(h.deliveryRouteCalls,[{position:{latitude:position.latitude,longitude:position.longitude},
                destination:storeAddress(address),meioTransporte}]);
            assert.ok(!JSON.stringify(h.queries).includes(String(position.latitude)));
        }
    }
});

test("UUID ausente explicitamente ou inválido é recusado antes de consultar banco e rotas",async()=>{
    for(const entregadorId of [null,undefined,"","not-a-uuid",` ${driverId}`,`${driverId} `,driverId.replaceAll("-",""),[],{},1]){
        const body={...position,entregadorId},h=harness(),res=response();
        assert.equal(positionFromBody(body,now),null);
        await h.controller({user:{empresaId:"company-a",cargo:"ADMIN"},body},res);
        assert.equal(res.statusCode,400);assert.equal(h.queries.length,0);
        assert.equal(h.routeCalls.length,0);assert.equal(h.deliveryRouteCalls.length,0);
    }
});

test("entregador de outra loja, inativo ou inexistente recebe a mesma recusa sem consultar Google",async()=>{
    for(const driver of [null,{...driverFixture,empresa_id:"company-b"},{...driverFixture,ativo:false},
        {...driverFixture,id:"24a5a0d8-bfc2-4ac8-8564-589fb38b170a"}]){
        const h=harness({driver}),res=response();
        await h.controller({user:{empresaId:"company-a",cargo:"ADMIN"},body:{...position,entregadorId:driverId}},res);
        assert.equal(res.statusCode,404);assert.equal(res.body.message,"O entregador ativo não foi encontrado nesta loja.");
        assert.equal(h.queries.length,2);assert.deepEqual(h.queries[1].values,[driverId,"company-a"]);
        assert.equal(h.routeCalls.length,0);assert.equal(h.deliveryRouteCalls.length,0);
    }
});

test("diagnóstico de cadastro usa export de entrega e sanitiza falhas do provedor",async()=>{
    const service=require("../services/entregaRotaService"),original=service.calcularRotaEntrega,calls=[];
    service.calcularRotaEntrega=async(...args)=>{calls.push(args);return{...route,modo:"BICYCLE"};};
    const db={query:async sql=>({rows:[/FROM empresas WHERE/.test(sql)?address:driverFixture]})};
    try{
        const controller=createGpsDiagnosticController({now:()=>now,db}),res=response();
        await controller({user:{empresaId:"company-a",cargo:"ADMIN"},body:{...position,entregadorId:driverId}},res);
        assert.equal(res.statusCode,200);assert.equal(res.body.data.modo,"BICYCLE");
        assert.deepEqual(calls,[[{latitude:position.latitude,longitude:position.longitude},storeAddress(address),"BICICLETA"]]);
        service.calcularRotaEntrega=async()=>{throw new Error("private-provider-key-and-location");};
        const failure=response();
        await controller({user:{empresaId:"company-a",cargo:"ADMIN"},body:{...position,entregadorId:driverId}},failure);
        assert.equal(failure.statusCode,503);assert.ok(!JSON.stringify(failure.body).includes("private-provider"));
    }finally{service.calcularRotaEntrega=original;}
});

test("GPS invalido, impreciso, antigo ou destino enviado pelo cliente nao consulta SQL nem Google", async () => {
    for (const body of [{ ...position, latitude: 100 }, { ...position, timestamp: now - 60000 },
        { ...position, precisao: 500 }, { ...position, endereco: { ...address, cidade: "Outra loja" } }]) {
        const h = harness(), res = response();
        await h.controller({ user: { empresaId: "company", cargo: "ADMIN" }, body }, res);
        assert.equal(res.statusCode, 400);
        assert.equal(h.queries.length, 0);
        assert.equal(h.routeCalls.length, 0);
    }
});

test("opções de locomoção ou campos extras são recusados antes de SQL ou provedor",async()=>{
    for(const body of [{...position,modo:"DRIVE"},{...position,modo:"WALK"},{...position,modo:"TRANSIT"},
        {...position,modo:null},{...position,modo:"WALKING"},{...position,modo:""},
        {...position,modo:[]},{...position,modo:"DRIVE",travelMode:"WALK"},
        {...position,entregadorId:driverId,meio_transporte:"MOTO"},{...position,entregadorId:driverId,travelMode:"WALK"},
        {...position,entregadorId:driverId,endereco:address}]){
        assert.equal(positionFromBody(body,now),null);
        const h=harness(),res=response();
        await h.controller({user:{empresaId:"company",cargo:"ADMIN"},body},res);
        assert.equal(res.statusCode,400);assert.equal(h.queries.length,0);assert.equal(h.routeCalls.length,0);assert.equal(h.deliveryRouteCalls.length,0);
    }
});

test("loja ausente ou endereco incompleto nao chama provedor", async () => {
    for (const [store, status] of [[null, 404], [{ ...address, cep: "" }, 422]]) {
        const h = harness({ store }), res = response();
        await h.controller({ user: { empresaId: "company", cargo: "GERENTE" }, body: position }, res);
        assert.equal(res.statusCode, status);
        assert.equal(h.routeCalls.length, 0);
    }
});

test("falhas de SQL/provedor sao sanitizadas sem logs, endereco ou GPS na mensagem", async () => {
    const rawError = new Error(`secret-provider-key latitude=${position.latitude} ${address.endereco}`);
    const logCalls = [], oldError = console.error, oldLog = console.log;
    console.error = (...values) => logCalls.push(values);
    console.log = (...values) => logCalls.push(values);
    try {
        for (const options of [{ providerError: rawError }, { dbError: rawError }]) {
            const h = harness(options), res = response();
            await h.controller({ user: { empresaId: "company", cargo: "ADMIN" }, body: position }, res);
            assert.equal(res.statusCode, 503);
            assert.equal(res.body.success, false);
            assert.ok(!JSON.stringify(res.body).includes("secret-provider-key"));
            assert.ok(!JSON.stringify(res.body).includes(String(position.latitude)));
            assert.ok(!JSON.stringify(res.body).includes(address.endereco));
        }
        assert.equal(logCalls.length, 0);
    } finally { console.error = oldError; console.log = oldLog; }
});

// Autenticacao real com JWT e usuario ativo; somente o banco e o provedor sao
// substituidos por fixtures em memoria. Nenhuma conexao externa ou .env e lido.
const secret = "isolated-gps-auth-fixture-secret";
const authUsers = new Map([
    ["admin", { id: "admin", empresa_id: "company-a", nome: "Admin", email: "admin@example.invalid", perfil: "ADMIN", sessao_versao: 1 }],
    ["manager", { id: "manager", empresa_id: "company-b", nome: "Gerente", email: "manager@example.invalid", perfil: "GERENTE", sessao_versao: 1 }],
    ["employee", { id: "employee", empresa_id: "company-a", nome: "Caixa", email: "employee@example.invalid", perfil: "CAIXA", sessao_versao: 1 }]
]);
require.cache[require.resolve("../config/env")] = { exports: { JWT_SECRET: secret } };
require.cache[require.resolve("../database/connection")] = { exports: { async query(sql, values) {
    assert.match(sql, /^\s*SELECT\s/);
    assert.match(sql, /FROM usuarios/);
    const user = authUsers.get(values[0]);
    return { rows: user?.empresa_id === values[1] ? [user] : [] };
} } };
const { createGpsDiagnosticRouter } = require("../routes/gpsDiagnosticRoutes");

function token(id, claims = {}) {
    const user = authUsers.get(id);
    return jwt.sign({ id, empresaId: user?.empresa_id || "company-a", cargo: "ADMIN", sv: 1, ...claims }, secret, { expiresIn: "5m" });
}
async function withServer(run) {
    const h = harness();
    const app = express();
    app.use(express.json());
    app.use("/api/gps-diagnostico", createGpsDiagnosticRouter({ routeController: h.controller }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/gps-diagnostico/rota`;
    const request = async (authorization,body=position) => {
        const result = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) }, body: JSON.stringify(body) });
        return { status: result.status, headers: result.headers, body: await result.json() };
    };
    try { await run({ ...h, request }); }
    finally { await new Promise(resolve => server.close(resolve)); }
}

test("rota privada recusa sem sessao, JWT invalido, cliente, usuario ausente e perfil adulterado", async () => {
    await withServer(async h => {
        assert.equal((await h.request()).status, 401);
        assert.equal((await h.request("invalid-token")).status, 401);
        assert.equal((await h.request(token("admin", { type: "customer" }))).status, 403);
        assert.equal((await h.request(token("missing"))).status, 401);
        assert.equal((await h.request(token("employee"))).status, 403, "Cargo do banco prevalece sobre ADMIN declarado no JWT");
        assert.equal(h.routeCalls.length, 0);
        assert.equal(h.queries.length, 0);
    });
});

test("ADMIN/GERENTE usam apenas empresa validada na sessao e empresa adulterada e recusada", async () => {
    await withServer(async h => {
        assert.equal((await h.request(token("admin"))).status, 200);
        assert.deepEqual(h.queries[0].values, ["company-a"]);
        assert.equal((await h.request(token("manager"))).status, 200);
        assert.deepEqual(h.queries[1].values, ["company-b"]);
        assert.equal((await h.request(token("admin", { empresaId: "company-b" }))).status, 401);
        assert.equal(h.routeCalls.length, 2);
    });
});

test("JWT validado limita o cadastro consultado à loja da sessão antes de usar perfil de entrega",async()=>{
    await withServer(async h=>{
        const body={...position,entregadorId:driverId};
        assert.equal((await h.request(token("admin"),body)).status,200);
        assert.equal((await h.request(token("manager"),body)).status,404);
        assert.equal((await h.request(token("admin",{empresaId:"company-b"}),body)).status,401);
        assert.equal(h.deliveryRouteCalls.length,1);assert.equal(h.routeCalls.length,0);
        assert.deepEqual(h.queries.filter(query=>/FROM entregadores/.test(query.sql)).map(query=>query.values),
            [[driverId,"company-a"],[driverId,"company-b"]]);
    });
});

test("limite privado permite quatro consultas por minuto e impede quinta chamada ao provedor", async () => {
    await withServer(async h => {
        for (let index = 0; index < 4; index++) assert.equal((await h.request(token("admin"))).status, 200);
        const limited = await h.request(token("admin"));
        assert.equal(limited.status, 429);
        assert.equal(limited.body.success, false);
        assert.equal(h.routeCalls.length, 4);
        assert.equal(h.queries.length, 4);
        assert.ok(limited.headers.get("ratelimit-policy"));
    });
});
