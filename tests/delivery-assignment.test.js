"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
let activeDb,provider;
require.cache[require.resolve("../database/connection")]={exports:{query:(...args)=>activeDb.query(...args),transaction:callback=>activeDb.transaction(callback)}};
require.cache[require.resolve("../config/env")]={exports:{APP_URL:"https://assignment.example.invalid"}};
require.cache[require.resolve("../services/freteService")]={exports:{}};
require.cache[require.resolve("../services/entregaRotaService")]={exports:{calcularRotaEntrega:(...args)=>provider(...args)}};
require.cache[require.resolve("../services/deliveryCompletionService")]={exports:{receipt:async()=>null}};
const controller=require("../controllers/entregaController");
const company="11111111-1111-4111-8111-111111111111",otherCompany="22222222-2222-4222-8222-222222222222";
const orderId="33333333-3333-4333-8333-333333333333",driverId="44444444-4444-4444-8444-444444444444";
const customerId="55555555-5555-4555-8555-555555555555";
const profiles={CARRO:"DRIVE",MOTO:"TWO_WHEELER",BICICLETA:"BICYCLE",A_PE:"WALK"};
const hash=value=>crypto.createHash("sha256").update(value).digest("hex"),copy=value=>structuredClone(value);

function harness({status="SAIU_PARA_ENTREGA",orderCompany=company}={}){
    const state={order:{id:orderId,empresa_id:orderCompany,cliente_id:customerId,status,endereco_entrega:{endereco:"Destino congelado do pedido"}},tracking:null};
    const queries=[],providerCalls=[];
    const active=tokenHash=>state.tracking?.token_hash===tokenHash&&state.order.status==="SAIU_PARA_ENTREGA";
    activeDb={
        async transaction(callback){
            const before=copy(state.tracking);
            try{return await callback(this);}catch(error){state.tracking=before;throw error;}
        },
        async query(sql,values=[]){
            const statement=sql.trim().replace(/\s+/g," ");queries.push({sql:statement,values});
            if(statement.startsWith("SELECT status FROM vendas")){
                assert.match(statement,/WHERE id=\$1 AND empresa_id=\$2 FOR UPDATE$/);
                return{rows:values[0]===state.order.id&&values[1]===state.order.empresa_id?[{status:state.order.status}]:[]};
            }
            if(statement.startsWith("INSERT INTO entrega_rastreamento")){
                assert.match(statement,/\(venda_id,token_hash,expira_em,entregador_id,meio_transporte\)/);
                assert.match(statement,/VALUES \(\$1,\$2,NOW\(\)\+INTERVAL '12 hours',NULL,'CARRO'\)/);
                assert.match(statement,/entregador_id=EXCLUDED.entregador_id,meio_transporte=EXCLUDED.meio_transporte/);
                assert.match(statement,/latitude=NULL,longitude=NULL,precisao_m=NULL,atualizado_em=NULL,rota=NULL,rota_solicitada_em=NULL/);
                assert.equal(values.length,2);assert.equal(values[0],orderId);assert.match(values[1],/^[a-f0-9]{64}$/);
                state.tracking={venda_id:values[0],token_hash:values[1],entregador_id:null,meio_transporte:"CARRO",
                    latitude:null,longitude:null,precisao_m:null,atualizado_em:null,rota:null,rota_solicitada_em:null,recent:false};
                return{rows:[],rowCount:1};
            }
            if(statement.startsWith("SELECT v.id,v.endereco_entrega,r.*")){
                assert.match(statement,/token_hash=\$1.*expira_em>NOW\(\).*FOR UPDATE OF v,r$/);
                return{rows:active(values[0])?[{id:orderId,endereco_entrega:copy(state.order.endereco_entrega),...copy(state.tracking),recente:state.tracking.recent}]:[]};
            }
            if(statement.startsWith("UPDATE entrega_rastreamento SET rota_solicitada_em=")){
                assert.deepEqual(values,[orderId]);state.tracking.rota_solicitada_em=new Date();state.tracking.recent=true;
                return{rows:[{rota_solicitada_em:state.tracking.rota_solicitada_em}],rowCount:1};
            }
            if(statement.startsWith("UPDATE entrega_rastreamento SET rota=")){
                assert.match(statement,/token_hash=\$3.*rota_solicitada_em=\$4/);
                if(!active(values[2])||values[3]!==state.tracking.rota_solicitada_em)return{rows:[],rowCount:0};
                state.tracking.rota=copy(values[0]);return{rows:[],rowCount:1};
            }
            if(statement.startsWith("SELECT v.id,v.status,v.endereco_entrega,r.meio_transporte")){
                assert.match(statement,/token_hash=\$1.*expira_em>NOW\(\)/);
                return{rows:active(values[0])?[{id:orderId,status:state.order.status,endereco_entrega:copy(state.order.endereco_entrega),
                    meio_transporte:state.tracking.meio_transporte,latitude:state.tracking.latitude,longitude:state.tracking.longitude,
                    precisao_m:state.tracking.precisao_m,atualizado_em:state.tracking.atualizado_em,rota:copy(state.tracking.rota)}]:[]};
            }
            if(statement.startsWith("SELECT v.status,v.endereco_entrega,")){
                const administrative=statement.includes("r.entregador_id");
                assert.deepEqual(values,administrative?[orderId,company]:[orderId,customerId,company]);
                const data={status:state.order.status,endereco_entrega:copy(state.order.endereco_entrega),
                    latitude:state.tracking?.latitude??null,longitude:state.tracking?.longitude??null,
                    precisao_m:state.tracking?.precisao_m??null,atualizado_em:state.tracking?.atualizado_em??null,rota:copy(state.tracking?.rota??null)};
                if(administrative)Object.assign(data,{entregador_id:state.tracking?.entregador_id??null,meio_transporte:state.tracking?.meio_transporte??null});
                return{rows:[data]};
            }
            assert.fail("Operação inesperada na atribuição de entrega");
        }
    };
    provider=async(...args)=>{
        providerCalls.push(copy(args));return{tipoOrigem:"GPS_ENTREGADOR",modo:profiles[args[2]],polyline:"provider-route",origem:{latitude:args[0].latitude,longitude:args[0].longitude}};
    };
    return{state,queries,providerCalls,fix(){Object.assign(state.tracking,{latitude:-23.66,longitude:-46.55,precisao_m:5,atualizado_em:new Date()});}};
}

async function invoke(name,{body,id=orderId,empresaId=company,token}={}){
    let error;const res={headers:{},set(name,value){this.headers[name]=value;return this;},json(value){this.body=value;return this;}};
    await controller[name]({params:{id},user:{empresaId,cargo:"ADMIN"},customer:{id:customerId,empresaId:company},body,
        method:"POST",get:()=>token?`Bearer ${token}`:""},res,caught=>{error=caught;});
    return{...res,error};
}

test("gerar link recusa cadastro, transporte ou campos extras antes do banco",async()=>{
    const h=harness();
    for(const body of [null,[],"",1,{entregadorId:null},{entregadorId:driverId},
        {entregadorId:driverId,meio_transporte:"MOTO"},{entregadorId:driverId,modo:"WALK"}]){
        const result=await invoke("criarLink",{body});assert.equal(result.error?.status,400);
    }
    assert.equal((await invoke("criarLink",{id:"invalid",body:{entregadorId:driverId}})).error?.status,400);
    assert.equal(h.queries.length,0);assert.equal(h.providerCalls.length,0);assert.equal(h.state.tracking,null);
});

test("link nasce para o único carro sem cadastro, com corpo vazio ou ausente",async()=>{
    for(const body of [{},undefined]){
        const h=harness(),result=await invoke("criarLink",{body});
        assert.equal(result.error,undefined);assert.equal(result.headers["Cache-Control"],"no-store");
        const token=new URL(result.body.data.url).hash.slice(1);
        assert.match(token,/^[a-f0-9]{64}$/);assert.equal(h.state.tracking.token_hash,hash(token));
        assert.equal(h.queries.length,2);assert.ok(h.queries.every(query=>!query.sql.includes("entregadores")));
        assert.equal(h.state.tracking.entregador_id,null);assert.equal(h.state.tracking.meio_transporte,"CARRO");
        assert.equal(h.providerCalls.length,0);
    }
});

test("pedido de outra loja ou fora da entrega não gera link",async()=>{
    for(const [options,status] of [[{orderCompany:otherCompany},404],[{status:"EM_SEPARACAO"},409]]){
        const h=harness(options),result=await invoke("criarLink");
        assert.equal(result.error?.status,status);assert.equal(h.queries.length,1);
        assert.equal(h.state.tracking,null);assert.equal(h.providerCalls.length,0);
    }
});

test("links legados preservam seu perfil até regenerar; novo link usa carro, limpa GPS e revoga o anterior",async()=>{
    for(const initial of Object.keys(profiles)){
        const h=harness(),created=await invoke("criarLink");
        assert.equal(created.error,undefined);assert.equal(created.headers["Cache-Control"],"no-store");
        const token=new URL(created.body.data.url).hash.slice(1);
        assert.match(token,/^[a-f0-9]{64}$/);assert.equal(h.state.tracking.token_hash,hash(token));
        assert.equal(h.providerCalls.length,0,"Gerar link não calcula rota paga");
        Object.assign(h.state.tracking,{entregador_id:driverId,meio_transporte:initial});h.fix();
        const calculated=await invoke("rota",{token});
        assert.equal(calculated.error,undefined);assert.equal(calculated.body.data.modo,profiles[initial]);
        assert.equal(h.providerCalls[0][2],initial);
        const trip=await invoke("viagem",{token});assert.equal(trip.body.data.meio_transporte,initial);
        assert.equal(trip.body.data.entregador_id,undefined);assert.equal(trip.body.data.token_hash,undefined);
        const replacement=await invoke("criarLink",{body:{}});
        assert.equal(replacement.error,undefined);
        const newToken=new URL(replacement.body.data.url).hash.slice(1);assert.notEqual(newToken,token);
        assert.equal(h.state.tracking.meio_transporte,"CARRO");assert.equal(h.state.tracking.entregador_id,null);assert.equal(h.state.tracking.latitude,null);
        assert.equal(h.state.tracking.rota,null);assert.equal(h.state.tracking.rota_solicitada_em,null);
        assert.equal((await invoke("viagem",{token})).error?.status,410);
        assert.equal((await invoke("rota",{token})).error?.status,410);
        h.fix();const fresh=await invoke("rota",{token:newToken});
        assert.equal(fresh.error,undefined);assert.equal(fresh.body.data.modo,"DRIVE");
        assert.equal(h.providerCalls[1][2],"CARRO");
    }
});

test("admin e cliente recebem o mesmo GPS sem expor token nem exigir registro de entregador",async()=>{
    const h=harness(),created=await invoke("criarLink");
    const token=new URL(created.body.data.url).hash.slice(1);h.fix();await invoke("rota",{token});
    const administrative=(await invoke("acompanharAdmin")).body.data,customer=(await invoke("acompanhar")).body.data;
    assert.equal(administrative.entregador_id,null);assert.equal(administrative.meio_transporte,"CARRO");
    assert.equal(customer.entregador_id,undefined);assert.equal(customer.meio_transporte,undefined);
    for(const field of ["status","endereco_entrega","latitude","longitude","precisao_m","atualizado_em","rota"])
        assert.deepEqual(administrative[field],customer[field],field);
    assert.equal(administrative.token_hash,undefined);assert.equal(customer.token_hash,undefined);
});
