"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
let activeDb,provider;
require.cache[require.resolve("../database/connection")]={exports:{query:(...args)=>activeDb.query(...args),transaction:callback=>activeDb.transaction(callback)}};
require.cache[require.resolve("../config/env")]={exports:{APP_URL:"https://route-selection.example.invalid"}};
require.cache[require.resolve("../services/freteService")]={exports:{}};
require.cache[require.resolve("../services/entregaRotaService")]={exports:{calcularRota:(...args)=>provider(...args),validarModo(value){
    if(!["DRIVE","WALK","BICYCLE","TWO_WHEELER","TRANSIT"].includes(value))throw Object.assign(new Error("Modo inválido"),{status:400});return value;
}}};
const controller=require("../controllers/entregaController");
const token="a".repeat(64),tokenHash=crypto.createHash("sha256").update(token).digest("hex"),orderId="11111111-1111-4111-8111-111111111111";
const clone=value=>JSON.parse(JSON.stringify(value));
function bundle(){
    const calculadaEm=new Date(Date.now()-1000).toISOString();
    const alternativas=[0,1,2].map(index=>({id:`rota-${index}`,modo:"WALK",principal:index===0,resumo:index?`Alternativa ${index}`:"Rota principal",
        calculadaEm,tipoOrigem:"GPS_ENTREGADOR",polyline:`stored-route-${index}`,distanciaMetros:100+index*20,duracao:`${80+index*10}s`,
        origem:{latitude:1,longitude:1},destino:{latitude:1.001,longitude:1.001},etapas:[],avisos:["Aviso do provedor"]}));
    return {...alternativas[0],alternativas};
}
function harness({valid=true,route=bundle()}={}){
    const state={valid,rota:clone(route),reservation:new Date(Date.now()-1000),recent:false,
        latitude:1,longitude:1,precisao_m:8,atualizado_em:new Date(),endereco_entrega:{endereco:"Destino fixo do pedido"}},queries=[],providerCalls=[];
    let reservationIndex=0;
    activeDb={async transaction(callback){return callback(this);},async query(sql,values){
        const normalized=sql.trim().replace(/\s+/g," ");queries.push({sql:normalized,values});
        if(/^SELECT\b/.test(normalized)){
            assert.ok(values.includes(tokenHash),"O acesso usa o hash do link privado, não o token bruto");
            assert.match(normalized,/token_hash\s*=/);assert.match(normalized,/expira_em\s*>\s*NOW\(\)/);
            assert.match(normalized,/status\s*=\s*'SAIU_PARA_ENTREGA'/);
            if(!state.valid)return {rows:[]};
            if(/^SELECT 1\b/.test(normalized))return {rows:[{exists:1}]};
            assert.match(normalized,/FOR UPDATE/,
                "Escolha e reserva devem ser serializadas com alterações da entrega");
            return {rows:[{id:orderId,...clone({...state,reservation:undefined}),rota:clone(state.rota),recente:state.recent}]};
        }
        if(/^UPDATE entrega_rastreamento SET rota_solicitada_em=/.test(normalized)){
            assert.deepEqual(values,[orderId]);state.reservation=new Date(Date.now()+ ++reservationIndex);state.recent=true;
            return {rows:[{rota_solicitada_em:state.reservation}],rowCount:1};
        }
        if(/^UPDATE entrega_rastreamento SET rota=/.test(normalized)){
            assert.equal(values[1],orderId);assert.equal(values[2],tokenHash);
            assert.ok(!/\b(?:latitude|longitude|precisao_m|atualizado_em)\s*=/.test(normalized),"Selecionar rota não escreve uma posição de GPS");
            if(normalized.includes("GREATEST")){
                assert.match(normalized,/rota_solicitada_em\s*=.*\+\s*INTERVAL\s*'1 millisecond'/i,
                    "A seleção deve invalidar qualquer reserva anterior por ao menos um milissegundo");
                if(!state.valid)return {rows:[],rowCount:0};
                state.rota=clone(values[0]);state.reservation=new Date(Math.max(state.reservation?.getTime()||0,Date.now())+1);
                return {rows:[],rowCount:1};
            }
            assert.match(normalized,/rota_solicitada_em\s*=\s*\$4/,
                "O cálculo só grava se sua reserva continuar sendo a atual");
            if(!state.valid||state.reservation!==values[3])return {rows:[],rowCount:0};
            state.rota=clone(values[0]);return {rows:[],rowCount:1};
        }
        assert.fail("Operação de banco inesperada no teste de seleção de rota");
    }};
    provider=async(...args)=>{providerCalls.push(args);return bundle();};
    return {state,queries,providerCalls,respond(next){provider=async(...args)=>{providerCalls.push(args);return next(...args);};}};
}
async function invoke(name,body,authorization=`Bearer ${token}`){
    let error;const res={headers:{},set(name,value){this.headers[name]=value;return this;},json(value){this.body=value;return this;}};
    await controller[name]({body,method:name==="selecionarRota"?"PATCH":"POST",get:()=>authorization},res,caught=>{error=caught;});
    return {...res,error};
}
const selection=state=>({rotaId:"rota-1",calculadaEm:state.rota.calculadaEm});
const gps=state=>({latitude:state.latitude,longitude:state.longitude,precisao_m:state.precisao_m,atualizado_em:state.atualizado_em});

test("seleção de rota exige token estrito e recusa geometria ou campos adicionais antes do banco",async()=>{
    const h=harness();
    for(const authorization of ["",`Bearer ${token.toUpperCase()}`,`Bearer ${token.slice(1)}`,`Bearer ${token}extra`,"Basic abc"]){
        const result=await invoke("selecionarRota",selection(h.state),authorization);assert.equal(result.error?.status,401);
    }
    for(const body of [undefined,null,[],{},selection({...h.state,rota:{calculadaEm:"invalid"}}),{...selection(h.state),rotaId:1},
        {...selection(h.state),rotaId:"rota-4"},{...selection(h.state),polyline:"injected-route"},
        {...selection(h.state),endereco_entrega:{endereco:"Outro destino"}},{...selection(h.state),latitude:2},
        {...selection(h.state),modo:"DRIVE"}]){
        const result=await invoke("selecionarRota",body);assert.equal(result.error?.status,400);
    }
    assert.equal(h.queries.length,0);assert.equal(h.providerCalls.length,0);
});

test("link revogado ou expirado não seleciona alternativa armazenada",async()=>{
    const h=harness({valid:false}),before=clone(h.state.rota),position=gps(h.state);
    const result=await invoke("selecionarRota",selection(h.state));
    assert.equal(result.error?.status,410);assert.deepEqual(h.state.rota,before);assert.deepEqual(gps(h.state),position);
    assert.ok(h.queries.every(query=>query.sql.startsWith("SELECT")));assert.equal(h.providerCalls.length,0);
});

test("lista antiga e opção não retornada pelo provedor preservam a rota atual",async()=>{
    const h=harness(),before=clone(h.state.rota);
    const stale=await invoke("selecionarRota",{...selection(h.state),calculadaEm:new Date(Date.now()-60000).toISOString()});
    assert.equal(stale.error?.status,409);
    const absent=await invoke("selecionarRota",{...selection(h.state),rotaId:"rota-3"});
    assert.equal(absent.error?.status,400);assert.deepEqual(h.state.rota,before);
    assert.ok(h.queries.every(query=>query.sql.startsWith("SELECT")));assert.equal(h.providerCalls.length,0);
});

test("escolher alternativa usa somente a geometria armazenada e preserva modo, lote, destino e GPS",async()=>{
    const h=harness(),before=clone(h.state.rota),position=gps(h.state),reservation=h.state.reservation.getTime();
    const result=await invoke("selecionarRota",selection(h.state));
    assert.equal(result.error,undefined);assert.equal(result.headers["Cache-Control"],"no-store");
    assert.equal(result.body.success,true);assert.equal(result.body.data.id,"rota-1");assert.equal(result.body.data.modo,"WALK");
    assert.equal(result.body.data.polyline,before.alternativas[1].polyline);
    assert.equal(result.body.data.calculadaEm,before.calculadaEm);
    assert.deepEqual(result.body.data.alternativas,before.alternativas);
    assert.deepEqual(result.body.data.destino,before.destino);assert.deepEqual(h.state.rota,result.body.data);
    assert.deepEqual(gps(h.state),position);assert.ok(h.state.reservation.getTime()>reservation);
    assert.equal(h.providerCalls.length,0,"Trocar entre alternativas não faz outra consulta paga ao Google");
});

test("rota calculada antes de uma seleção não a sobrescreve nem encerra o link ativo",async()=>{
    const h=harness();let release,started;
    const providerStarted=new Promise(resolve=>{started=resolve;});
    h.respond(()=>{started();return new Promise(resolve=>{release=resolve;});});
    const pending=invoke("rota",{});await providerStarted;
    const result=await invoke("selecionarRota",selection(h.state));assert.equal(result.error,undefined);
    const selected=clone(h.state.rota);release(bundle());
    assert.equal((await pending).error?.status,409);
    assert.deepEqual(h.state.rota,selected);assert.equal(h.state.valid,true);
});

test("resposta de cálculo após revogação é410 e não restaura rota no link encerrado",async()=>{
    const h=harness();let release,started;
    const providerStarted=new Promise(resolve=>{started=resolve;});
    h.respond(()=>{started();return new Promise(resolve=>{release=resolve;});});
    const pending=invoke("rota",{});await providerStarted;h.state.valid=false;
    const previous=clone(h.state.rota);release(bundle());
    assert.equal((await pending).error?.status,410);assert.deepEqual(h.state.rota,previous);
});
