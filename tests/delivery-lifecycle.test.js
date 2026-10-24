"use strict";

const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const settle=async()=>{for(let index=0;index<12;index++)await new Promise(resolve=>setImmediate(resolve));};
const source=name=>fs.readFileSync(`public/js/pages/delivery/${name}.js`,"utf8");
const response=data=>({ok:true,json:async()=>({data})});
function element(){
    const classes=new Set(),children={};
    return {hidden:false,disabled:false,textContent:"",events:{},
        classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},contains:name=>classes.has(name),toggle(name,enabled){const next=enabled===undefined?!classes.has(name):enabled;next?classes.add(name):classes.delete(name);return next;}},
        addEventListener(name,callback){this.events[name]=callback;},setAttribute(name,value){this[name]=value;},
        querySelector(selector){return children[selector]||(children[selector]=element());}};
}
function clock(){
    let now=Date.UTC(2026,9,24,12,0,58),id=0;const timers=new Map(),intervals=new Set();
    class ClockDate extends Date{constructor(value){super(arguments.length?value:now);}static now(){return now;}}
    return {Date:ClockDate,now:()=>now,intervals,
        setTimeout(callback,delay){const key=++id;timers.set(key,{callback,at:now+delay});return key;},clearTimeout(key){timers.delete(key);},
        setInterval(callback){intervals.add(callback);return callback;},clearInterval(callback){intervals.delete(callback);},
        async advance(ms){now+=ms;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.callback();}await settle();}};
}
function driverHarness(){
    const time=clock(),elements=Object.fromEntries(["gpsStatus","startGps","stopGps","refreshRoute","routeStatus","mapStatus"].map(id=>[id,element()]));
    const watches=[],calls=[],mapUpdates=[],navigationUpdates=[],documentEvents={},windowEvents={};let pauses=0,stops=0,responder;
    const context={...time,URLSearchParams,AbortSignal,AbortController,console,isSecureContext:true,
        location:{hash:"#"+"a".repeat(64),pathname:"/entregador"},history:{replaceState(){}},
        document:{hidden:false,getElementById:id=>elements[id],addEventListener(name,callback){documentEvents[name]=callback;}},
        addEventListener(name,callback){windowEvents[name]=callback;},
        navigator:{geolocation:{watchPosition(success,error){const id=watches.length;watches.push({success,error,id});return id;},clearWatch(id){watches[id].cleared=true;}}},
        PetFlowDeliveryMap:()=>({update(data){mapUpdates.push(JSON.parse(JSON.stringify(data)));},hide(){}}),
        PetFlowDeliveryNavigation:()=>({start(){},update(data){navigationUpdates.push(JSON.parse(JSON.stringify(data)));},pause(){pauses++;},stop(){stops++;},needsRoute:()=>false}),
        fetch:async(url,options)=>{calls.push({url,options});if(responder)return responder(url,options);return response(url.endsWith("/viagem")?{id:"order",endereco_entrega:{endereco:"Rua"}}:{tipoOrigem:"GPS_ENTREGADOR",polyline:"route"});}};
    context.window=context;vm.runInNewContext(source("driver"),context);
    return {context,time,elements,watches,calls,mapUpdates,navigationUpdates,documentEvents,windowEvents,pauses:()=>pauses,stops:()=>stops,
        respond(callback){responder=callback;},
        fix(coords={}){watches.at(-1).success({timestamp:time.now(),coords:{latitude:-23.66,longitude:-46.55,accuracy:5,...coords}});}};
}

test("resposta de rota pendente não reativa orientações depois de perder GPS",async()=>{
    const h=driverHarness();let finishRoute;
    h.respond(async(url)=>url.endsWith("/rota")?new Promise(resolve=>{finishRoute=resolve;}):response(url.endsWith("/viagem")?{id:"order"}:{}));
    await h.elements.startGps.events.click();h.fix();await settle();
    const count=h.navigationUpdates.length,routeRequest=h.calls.find(call=>call.url.endsWith("/rota"));h.watches[0].error({code:2,message:"Sinal perdido"});
    finishRoute(response({tipoOrigem:"GPS_ENTREGADOR",polyline:"new-route"}));await settle();
    assert.equal(h.navigationUpdates.length,count);assert.ok(h.pauses()>0);assert.match(h.elements.gpsStatus.textContent,/Sinal perdido/);
    assert.equal(routeRequest.options.signal.aborted,true,"A consulta anterior é cancelada junto com a perda de sinal");
    await h.time.advance(1);h.fix();assert.notEqual(h.navigationUpdates.at(-1).rota?.polyline,"new-route","Retomar aguarda novo cálculo e não reaproveita a resposta cancelada");
});

test("GPS com erro elimina posição enfileirada e rota que retorna na aba oculta não redesenha",async()=>{
    const h=driverHarness();let finishRoute;
    h.respond(async(url)=>url.endsWith("/rota")?new Promise(resolve=>{finishRoute=resolve;}):response(url.endsWith("/viagem")?{id:"order"}:{}));
    await h.elements.startGps.events.click();h.fix();await settle();await h.time.advance(500);h.fix({latitude:-23.6599});
    h.watches[0].error({code:2});await h.time.advance(2000);
    assert.equal(h.calls.filter(call=>call.url.endsWith("/localizacao")&&call.options.method==="POST").length,1);
    h.context.document.hidden=true;h.documentEvents.visibilitychange();const count=h.mapUpdates.length;
    finishRoute(response({tipoOrigem:"GPS_ENTREGADOR",polyline:"new-route"}));await settle();
    assert.equal(h.mapUpdates.length,count);assert.equal(h.watches[0].cleared,true);
    h.context.document.hidden=false;h.documentEvents.visibilitychange();assert.equal(h.navigationUpdates.length,2,"Retomar a aba aguarda novo fix antes das manobras");
});

test("falha síncrona do GPS devolve botão de iniciar e não deixa relógio de viagem ativo",async()=>{
    const h=driverHarness();h.context.navigator.geolocation.watchPosition=()=>{throw new Error("Permissão indisponível");};
    await h.elements.startGps.events.click();assert.equal(h.elements.startGps.disabled,false);assert.equal(h.time.intervals.size,0);
    assert.ok(h.stops()>0);assert.match(h.elements.gpsStatus.textContent,/Permissão indisponível/);
});

test("wake lock que chega depois de ocultar ou sair é liberado",async()=>{
    const h=driverHarness(),requests=[];let releases=0;
    h.context.navigator.wakeLock={request:()=>new Promise(resolve=>requests.push(resolve))};
    await h.elements.startGps.events.click();h.context.document.hidden=true;h.documentEvents.visibilitychange();
    requests[0]({release:async()=>{releases++;}});await settle();assert.equal(releases,1);
    h.context.document.hidden=false;h.documentEvents.visibilitychange();h.windowEvents.pagehide();
    requests[1]({release:async()=>{releases++;}});await settle();assert.equal(releases,2);
});

function trackingHarness(responder,initialData={}){
    const time=clock(),ids=["trackingStatus","trackingUpdated","trackingLogin","trackingStage","trackingLive","trackingHeadline","trackingDistance","trackingDuration","trackingArrival","expandTrackingMap","expandTrackingLabel"];
    const elements=Object.fromEntries(ids.map(id=>[id,element()])),body=element(),updates=[],calls=[],documentEvents={},windowEvents={};let token="customer-token",tick;
    let data={status:"SAIU_PARA_ENTREGA",latitude:-23.66,longitude:-46.55,precisao_m:5,atualizado_em:new Date(time.now()).toISOString(),rota:{distanciaMetros:1200,duracao:"120s",calculadaEm:new Date(time.now()).toISOString()},...initialData};
    const context={...time,URLSearchParams,AbortSignal,AbortController,location:{pathname:"/acompanhar-entrega",search:"?pedido=example"},
        document:{hidden:false,body,getElementById:id=>elements[id],addEventListener(name,callback){documentEvents[name]=callback;}},
        addEventListener(name,callback){windowEvents[name]=callback;},sessionStorage:{getItem:()=>token},setInterval(callback){tick=callback;},
        PetFlowDeliveryMap:()=>({update(value){updates.push(JSON.parse(JSON.stringify(value)));},hide(){},resize(){}}),
        fetch:async(url,options)=>{calls.push({url,options});return responder?responder(url,options):response(data);}};
    context.window=context;vm.runInNewContext(source("tracking"),context);
    return {context,time,elements,body,updates,calls,documentEvents,windowEvents,tick:()=>tick(),setToken(value){token=value;},setData(value){data=value;},data:()=>data};
}

test("rastreamento ignora resposta que chega após logout e troca de sessão cancela consulta anterior",async()=>{
    const requests=[],h=trackingHarness(async()=>new Promise(resolve=>requests.push(resolve)));
    h.setToken(null);requests[0](response(h.data()));await settle();assert.equal(h.updates.length,0);assert.equal(h.elements.trackingLogin.hidden,false);
    h.setToken("new-customer");h.tick();h.setToken("another-customer");h.tick();assert.equal(h.calls[1].options.signal.aborted,true);
    requests[1](response({...h.data(),latitude:-23.5}));requests[2](response(h.data()));await settle();
    assert.equal(h.updates.length,1);assert.equal(h.updates[0].latitude,-23.66);
});

test("rastreamento cancela GET ao ocultar página e faz nova consulta ao voltar",async()=>{
    const requests=[],h=trackingHarness(async()=>new Promise(resolve=>requests.push(resolve)));
    h.context.document.hidden=true;h.documentEvents.visibilitychange();assert.equal(h.calls[0].options.signal.aborted,true);
    h.context.document.hidden=false;h.documentEvents.visibilitychange();assert.equal(requests.length,2);
    requests[0](response({...h.data(),latitude:-23.5}));requests[1](response(h.data()));await settle();
    assert.equal(h.updates.length,1);assert.equal(h.updates[0].latitude,-23.66);
});

test("entrega concluída fecha mapa ampliado e devolve rolagem da página",async()=>{
    const h=trackingHarness();await settle();h.elements.expandTrackingMap.events.click();assert.equal(h.body.classList.contains("tracking-map-open"),true);
    h.setData({status:"ENTREGUE"});await h.tick();assert.equal(h.elements.trackingStage.hidden,true);
    assert.equal(h.body.classList.contains("tracking-map-open"),false);assert.equal(h.elements.expandTrackingMap["aria-pressed"],"false");
});

test("dados GPS inválidos ou futuros não são mostrados como acompanhamento ao vivo",async()=>{
    for(const invalid of [{latitude:200},{longitude:undefined},{precisao_m:-1},{atualizado_em:"invalid"},{atualizado_em:new Date(Date.UTC(2026,9,24,12,1,4)).toISOString()}]){
        const h=trackingHarness(undefined,invalid);await settle();await h.tick();
        assert.equal(h.elements.trackingStage.hidden,true);assert.equal(h.elements.trackingLive.hidden,true);assert.match(h.elements.trackingStatus.textContent,/não é válida/);
    }
});

test("GPS atrasado mantém posição conhecida sem selo ao vivo nem previsão vencida",async()=>{
    const h=trackingHarness(undefined,{atualizado_em:new Date(Date.UTC(2026,9,24,12,0,42)).toISOString()});await settle();await h.tick();
    assert.equal(h.elements.trackingStage.hidden,false);assert.equal(h.elements.trackingLive.hidden,true);assert.equal(h.elements.trackingArrival.textContent,"—");
    assert.match(h.elements.trackingStatus.textContent,/última posição conhecida/);
});

test("rastreamento não retrocede GPS e limpa a posição anterior quando link fica sem GPS",async()=>{
    const h=trackingHarness();await settle();h.setData({...h.data(),latitude:-23.5,atualizado_em:new Date(h.time.now()-1000).toISOString()});await h.tick();
    assert.equal(h.updates.at(-1).latitude,-23.66);
    h.setData({...h.data(),latitude:null,longitude:null});await h.tick();
    h.setData({...h.data(),latitude:-23.4,longitude:-46.5});await h.tick();assert.equal(h.updates.at(-1).latitude,-23.4);
});
