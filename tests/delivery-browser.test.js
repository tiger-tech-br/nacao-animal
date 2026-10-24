"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs");
const source = file => fs.readFileSync(`public/js/pages/delivery/${file}.js`,"utf8");
const settle = async () => { for (let i=0;i<15;i++) await new Promise(resolve => setImmediate(resolve)); };
function element() {
    const classes = new Set();
    return { hidden: false, disabled: false, textContent: "", events: {},
        classList: { add(...names){names.forEach(name=>classes.add(name));}, remove(...names){names.forEach(name=>classes.delete(name));}, contains(name){return classes.has(name);}, toggle(name,force){const next=force===undefined?!classes.has(name):force;next?classes.add(name):classes.delete(name);return next;} },
        addEventListener(name,fn) { this.events[name]=fn; }, setAttribute(name,value){this[name]=value;}, removeAttribute(name) { delete this[name]; }
    };
}
function driverHarness() {
    const elements = Object.fromEntries(["startGps","stopGps","refreshRoute","gpsStatus","routeStatus","mapStatus"].map(id => [id,element()]));
    const calls = [], updates = [], gps = [], intervals = new Set(), timeouts = new Map(), clearedWatches=[];
    const route = { tipoOrigem:"GPS_ENTREGADOR", polyline: "route", destino: { latitude: -23.6, longitude: -46.5 } };
    const navigationCalls=[], events={}, documentEvents={}; let mapOptions;
    let now=Date.now(),nextTimeout=0;
    class ClockDate extends Date { constructor(value){super(arguments.length ? value : now);} static now(){return now;} }
    const context = { URLSearchParams, AbortSignal, AbortController, Date:ClockDate, console,
        location: { hash: "#"+"a".repeat(64), pathname: "/entregador" }, history: { replaceState() {} },
        document: { hidden: false, getElementById: id => elements[id], addEventListener(name,fn) {documentEvents[name]=fn;} },
        navigator: { geolocation: {
            getCurrentPosition(){assert.fail("Navegação usa watchPosition contínuo");},
            watchPosition(resolve,reject,options) {const id=gps.length;gps.push({resolve:position=>resolve({timestamp:now,...position}),reject,options,id});return id;},
            clearWatch(id){clearedWatches.push(id);}
        } },
        isSecureContext: true, addEventListener(name,fn) {events[name]=fn;},
        setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); },
        setTimeout(fn,delay){const id=++nextTimeout;timeouts.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timeouts.delete(id);},
        PetFlowDeliveryMap: options => { mapOptions=options; assert.equal(options.mode,"driver"); return { update(data) { updates.push(JSON.parse(JSON.stringify(data))); }, hide() {elements.mapStatus.textContent="";options.onStatus?.({message:"",state:"ready"});} }; },
        PetFlowDeliveryNavigation:()=>({start(){navigationCalls.push("start");},update(data){navigationCalls.push({update:JSON.parse(JSON.stringify(data))});},stop(){navigationCalls.push("stop");},pause(){navigationCalls.push("pause");},needsRoute(){return false;}}),
        fetch: async (url,options) => {
            calls.push({url,options});
            const data = url.endsWith("/viagem") ? { id: "order", endereco_entrega: { endereco: "Rua", numero: "123" } } : url.endsWith("/rota") ? route : {};
            return { ok: true, json: async () => ({data}) };
        }
    };
    context.window = context; vm.runInNewContext(source("driver"),context);
    return { context,elements,calls,updates,gps,intervals,navigationCalls,events,documentEvents,timeouts,clearedWatches,
        now:()=>now,
        async advance(ms){const target=now+ms;let ready;while((ready=[...timeouts].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0])){now=ready[1].at;timeouts.delete(ready[0]);ready[1].fn();await settle();}now=target;await settle();},
        fix(coords={},index=gps.length-1,timestamp=now){gps[index].resolve({timestamp,coords:{latitude:-23.66,longitude:-46.55,accuracy:10,...coords}});},
        mapNotice(notice){elements.mapStatus.textContent=notice.message;mapOptions.onStatus(notice);} };
}
test("iniciar viagem solicita permissão, publica GPS e usa direção local na navegação", async () => {
    const h = driverHarness();
    assert.equal(h.calls.length,0,"Não transmite GPS antes do clique");
    await h.elements.startGps.events.click();
    assert.equal(h.gps.length,1);
    assert.equal(h.gps[0].options.maximumAge,0);assert.equal(h.gps[0].options.enableHighAccuracy,true);
    h.gps[0].resolve({coords:{latitude:-23.66,longitude:-46.55,accuracy:10,heading:90,speed:5}}); await settle();
    assert.ok(h.calls.some(c=>c.url.endsWith("/localizacao") && c.options.method === "POST"));
    assert.equal(h.updates.at(-1).rota.polyline,"route");
    assert.equal(h.updates.at(-1).latitude,-23.66);
    assert.equal(h.updates.at(-1).heading,90);
    assert.equal(h.updates.at(-1).velocidade_mps,5);
    assert.ok(h.navigationCalls.some(call=>call.update?.latitude===-23.66));
    assert.equal(JSON.parse(h.calls.find(c=>c.url.endsWith("/localizacao") && c.options.method === "POST").options.body).heading,undefined,"A direção permanece no aparelho do entregador");
    assert.equal(JSON.parse(h.calls.find(c=>c.url.endsWith("/localizacao") && c.options.method === "POST").options.body).capturadoEm,new Date(h.now()).toISOString());
    assert.ok(h.elements.gpsStatus.textContent.includes("Viagem em andamento"));
    assert.equal(h.elements.gpsStatus.hidden,true,"Sucesso não cobre o mapa continuamente");
    await h.elements.stopGps.events.click();
    assert.equal(h.intervals.size,0);
    assert.equal(h.calls.at(-1).options.method,"DELETE");
    assert.equal(h.elements.startGps.disabled,true);
    assert.deepEqual(h.clearedWatches,[0]);
});

test("watch atualiza manobras sem aguardar rede e fila publica só a posição mais recente a cada 2 s", async () => {
    const h=driverHarness(),originalFetch=h.context.fetch,pending=[];
    h.context.fetch=async(url,options)=>{
        if(url.endsWith("/localizacao")&&options.method==="POST") return new Promise(resolve=>pending.push({resolve,body:JSON.parse(options.body)}));
        return originalFetch(url,options);
    };
    await h.elements.startGps.events.click();h.fix({heading:10,speed:4});
    assert.equal(pending.length,1);assert.equal(h.updates.at(-1).heading,10);
    assert.ok(h.navigationCalls.some(call=>call.update?.heading===10),"A orientação recebe o fix antes da resposta da loja");
    await h.advance(400);h.fix({latitude:-23.6599,heading:20,speed:5});
    await h.advance(400);h.fix({latitude:-23.6598,heading:30,speed:6});
    assert.equal(h.updates.at(-1).latitude,-23.6598);assert.equal(h.updates.at(-1).heading,30);
    assert.equal(pending.length,1,"Uma publicação lenta não cria requisições concorrentes");
    pending[0].resolve({ok:true,json:async()=>({})});await settle();
    assert.equal(pending.length,1,"Não publica antes de completar os 2 s");
    await h.advance(1200);
    assert.equal(pending.length,2);assert.equal(pending[1].body.latitude,-23.6598,"Descarta posições intermediárias da fila");
    assert.equal(pending[1].body.capturadoEm,new Date(h.now()-1200).toISOString());
    assert.equal(h.updates.at(-1).latitude,-23.6598,"Resposta antiga não faz a seta retroceder");
    pending[1].resolve({ok:true,json:async()=>({})});await settle();await h.advance(4000);
    assert.equal(pending.length,2,"Não retransmite o mesmo fix na ausência de nova captura");
    const count=h.updates.length;h.fix({latitude:-23.5},0,h.now()-6000);
    assert.equal(h.updates.length,count,"Fix repetido ou fora de ordem não move a seta");
});

test("falha de publicação preserva navegação local com novos fixes reais", async () => {
    const h=driverHarness(),originalFetch=h.context.fetch;
    h.context.fetch=async(url,options)=>url.endsWith("/localizacao")&&options.method==="POST" ? Promise.reject(new Error("Rede indisponível")) : originalFetch(url,options);
    await h.elements.startGps.events.click();h.fix({heading:80});await settle();
    assert.equal(h.navigationCalls.filter(call=>call==="pause").length,0);
    assert.match(h.elements.gpsStatus.textContent,/navegação local continua/);
    await h.advance(500);h.fix({latitude:-23.6599,heading:90,speed:7});
    assert.equal(h.updates.at(-1).latitude,-23.6599);assert.equal(h.updates.at(-1).heading,90);
    assert.equal(h.navigationCalls.filter(call=>call==="pause").length,0,"Rede não interrompe GPS e orientação no aparelho");
    assert.ok(h.navigationCalls.some(call=>call.update?.velocidade_mps===7));
    assert.equal(h.elements.gpsStatus.hidden,false,"Mantém aviso sobre compartilhamento com a loja");
});

test("posição enfileirada que envelheceu não é enviada quando a rede responde", async () => {
    const h=driverHarness(),originalFetch=h.context.fetch;let finish,posts=0;
    h.context.fetch=async(url,options)=>{
        if(url.endsWith("/localizacao")&&options.method==="POST") {posts++;return new Promise(resolve=>{finish=resolve;});}
        return originalFetch(url,options);
    };
    await h.elements.startGps.events.click();h.fix();await h.advance(100);h.fix({latitude:-23.6599});
    await h.advance(16000);finish({ok:true,json:async()=>({})});await settle();
    assert.equal(posts,1,"A fila descarta o fix que já não é recente");
    assert.equal(h.calls.filter(call=>call.url.endsWith("/rota")).length,0,"Não calcula rota a partir de GPS já antigo");
});

test("atualizar rota respeita margem de 16 s e aguarda publicação do GPS", async () => {
    const h=driverHarness();await h.elements.startGps.events.click();
    await h.elements.refreshRoute.events.click();assert.equal(h.calls.filter(call=>call.url.endsWith("/rota")).length,0);
    h.fix();await settle();assert.equal(h.calls.filter(call=>call.url.endsWith("/rota")).length,1);
    await h.advance(2000);h.fix();await settle();await h.elements.refreshRoute.events.click();
    assert.equal(h.calls.filter(call=>call.url.endsWith("/rota")).length,1,"Não chama Google novamente a cada leitura GPS");
    await h.advance(14000);h.fix();await settle();await h.elements.refreshRoute.events.click();
    assert.equal(h.calls.filter(call=>call.url.endsWith("/rota")).length,2);
});

test("GPS antigo ou inválido não é publicado e orientações aguardam sinal confiável", async () => {
    const h=driverHarness();await h.elements.startGps.events.click();
    h.fix({},0,h.now()-16000);await settle();
    assert.equal(h.calls.filter(c=>c.url.endsWith("/localizacao")).length,0);
    assert.match(h.elements.gpsStatus.textContent,/desatualizada/);
    h.fix({accuracy:80});await settle();
    assert.equal(h.navigationCalls.at(-1).update.precisao_m,80,"Motor recebe precisão para suspender manobras imprecisas");
    assert.match(h.elements.gpsStatus.textContent,/GPS impreciso/);
    await h.advance(1);h.fix({accuracy:5});await settle();assert.equal(h.elements.gpsStatus.hidden,true);
    await h.advance(16000);[...h.intervals][0]();
    assert.match(h.elements.gpsStatus.textContent,/GPS sem atualização recente/);
    assert.equal(h.navigationCalls.at(-1),"pause");
    const last=h.updates.length;h.fix({latitude:200});await settle();assert.equal(h.updates.length,last);
});

test("ocultar página limpa watch e voltar retoma apenas a viagem já autorizada", async () => {
    const h=driverHarness();h.context.document.hidden=true;h.documentEvents.visibilitychange();assert.equal(h.gps.length,0);
    h.context.document.hidden=false;await h.elements.startGps.events.click();h.fix();await settle();
    h.context.document.hidden=true;h.documentEvents.visibilitychange();assert.deepEqual(h.clearedWatches,[0]);
    const count=h.updates.length;await h.advance(100);h.fix({latitude:-23.5},0);assert.equal(h.updates.length,count);
    h.context.document.hidden=false;h.documentEvents.visibilitychange();assert.equal(h.gps.length,2);
    assert.match(h.elements.gpsStatus.textContent,/Aguardando uma nova posição/);
    await h.advance(1);h.fix({latitude:-23.6599});assert.equal(h.updates.at(-1).latitude,-23.6599);
});

test("parar aborta envio, limpa watch e descarta a última posição enfileirada", async () => {
    const h=driverHarness(),originalFetch=h.context.fetch;let finish,signal,posts=0;
    h.context.fetch=async(url,options)=>{
        if(url.endsWith("/localizacao")&&options.method==="POST") {posts++;signal=options.signal;return new Promise(resolve=>{finish=resolve;});}
        return originalFetch(url,options);
    };
    await h.elements.startGps.events.click();h.fix();await h.advance(100);h.fix({latitude:-23.6599});
    await h.elements.stopGps.events.click();assert.equal(signal.aborted,true);assert.deepEqual(h.clearedWatches,[0]);
    const count=h.updates.length;h.fix({latitude:-23.5},0);assert.equal(h.updates.length,count);
    finish({ok:true,json:async()=>({})});await settle();await h.advance(3000);
    assert.equal(posts,1);
    assert.equal(h.timeouts.size,0);assert.equal(h.intervals.size,0);
});
test("encerrar enquanto aguarda GPS impede envio tardio da posição", async () => {
    const h = driverHarness(); await h.elements.startGps.events.click();
    await h.elements.stopGps.events.click();
    h.gps[0].resolve({coords:{latitude:-23.66,longitude:-46.55,accuracy:10}}); await settle();
    assert.equal(h.calls.filter(c=>c.url.endsWith("/localizacao") && c.options.method === "POST").length,0);
});
test("permissão negada permite tentar novamente e link expirado não solicita GPS", async () => {
    const h = driverHarness(); await h.elements.startGps.events.click();
    h.gps[0].reject({code:1}); await settle();
    assert.equal(h.elements.startGps.disabled,false);
    assert.equal(h.elements.gpsStatus.hidden,false,"Erro de permissão permanece visível");
    assert.equal(h.intervals.size,0);
    const expired = driverHarness();
    expired.context.fetch = async () => ({ok:false,status:410,json:async()=>({message:"Link encerrado"})});
    await expired.elements.startGps.events.click();
    assert.equal(expired.gps.length,0); assert.equal(expired.elements.startGps.disabled,true);
});

test("GPS temporariamente indisponível mostra aviso e recupera sem sobrepor sucesso ao mapa", async () => {
    const h=driverHarness();await h.elements.startGps.events.click();
    h.gps[0].reject({code:2,message:"Sinal indisponível"});await settle();
    assert.equal(h.elements.gpsStatus.hidden,false);assert.match(h.elements.gpsStatus.textContent,/Sinal indisponível/);
    assert.equal(h.intervals.size,1,"Mantém tentativa de recuperação da viagem autorizada");
    h.fix();await settle();
    assert.equal(h.elements.gpsStatus.hidden,true);assert.match(h.elements.gpsStatus.textContent,/Viagem em andamento/);
});

test("falha de envio, de rota e de Maps permanece visível durante a navegação", async () => {
    const h=driverHarness(),originalFetch=h.context.fetch;
    h.context.fetch=async(url,options)=>url.endsWith("/localizacao") ? Promise.reject(new Error("Sem conexão com a loja")) : originalFetch(url,options);
    await h.elements.startGps.events.click();h.gps[0].resolve({coords:{latitude:-23.66,longitude:-46.55,accuracy:10}});await settle();
    assert.equal(h.elements.gpsStatus.hidden,false);assert.match(h.elements.gpsStatus.textContent,/Sem conexão com a loja/);
    h.context.fetch=async(url,options)=>url.endsWith("/rota") ? {ok:false,status:503,json:async()=>({message:"Rota indisponível"})} : originalFetch(url,options);
    await h.advance(2000);h.fix();await settle();
    assert.equal(h.elements.routeStatus.hidden,false);assert.match(h.elements.routeStatus.textContent,/Rota indisponível.*Atualizar rota/);
    assert.equal(h.elements.refreshRoute.disabled,false);
    h.mapNotice({state:"error",message:"O Google recusou o mapa"});
    assert.equal(h.elements.mapStatus.hidden,false);assert.equal(h.elements.mapStatus.classList.contains("is-error"),true);
    h.mapNotice({state:"loading",message:"Carregando mapa..."});assert.equal(h.elements.mapStatus.hidden,false);
    h.mapNotice({state:"ready",message:"Mapa pronto"});assert.equal(h.elements.mapStatus.hidden,true);
    h.context.fetch=originalFetch;await h.advance(16000);h.fix();await settle();
    await h.elements.refreshRoute.events.click();assert.equal(h.elements.routeStatus.hidden,true);
});

test("voltar pelo BFCache exige retomar e ignora GPS pendente da viagem pausada", async () => {
    const h=driverHarness();await h.elements.startGps.events.click();assert.equal(h.gps.length,1);
    h.events.pagehide({persisted:true});h.events.pageshow({persisted:true});
    assert.equal(h.intervals.size,0);assert.equal(h.elements.startGps.disabled,false);
    assert.equal(h.elements.startGps.textContent,"Retomar viagem");assert.equal(h.elements.gpsStatus.hidden,false);
    assert.match(h.elements.gpsStatus.textContent,/Viagem pausada/);
    h.documentEvents.visibilitychange();await settle();assert.equal(h.gps.length,1,"Voltar à tela não reinicia GPS automaticamente");
    await h.elements.startGps.events.click();assert.equal(h.gps.length,2,"Novo clique não fica preso no GPS anterior");
    h.gps[0].resolve({coords:{latitude:-23.5,longitude:-46.4,accuracy:10}});await settle();
    assert.equal(h.calls.filter(c=>c.url.endsWith("/localizacao")&&c.options.method==="POST").length,0);
    h.gps[1].resolve({coords:{latitude:-23.66,longitude:-46.55,accuracy:10}});await settle();
    assert.equal(h.calls.filter(c=>c.url.endsWith("/localizacao")&&c.options.method==="POST").length,1);
    assert.equal(h.intervals.size,1);
    await h.elements.stopGps.events.click();h.events.pagehide({persisted:true});h.events.pageshow({persisted:true});
    assert.equal(h.elements.startGps.disabled,true,"Uma viagem encerrada não oferece retomada");
});

test("resposta de preparação anterior ao BFCache não altera a viagem retomada", async () => {
    const h=driverHarness(),originalFetch=h.context.fetch;let finishPrevious;
    h.context.fetch=async()=>new Promise(resolve=>{finishPrevious=resolve;});
    const previousStart=h.elements.startGps.events.click();
    h.events.pagehide({persisted:true});h.events.pageshow({persisted:true});
    assert.equal(h.elements.stopGps.disabled,true,"Preparação pausada não oferece encerrar uma viagem ainda não carregada");
    assert.equal(h.gps.length,0);
    h.context.fetch=originalFetch;await h.elements.startGps.events.click();assert.equal(h.gps.length,1);
    finishPrevious({ok:true,json:async()=>({data:{id:"previous-trip"}})});await previousStart;
    h.gps[0].resolve({coords:{latitude:-23.66,longitude:-46.55,accuracy:10}});await settle();
    assert.equal(h.updates.at(-1).id,"order","Resposta antiga não substitui dados carregados pela retomada");
});

test("expiração durante rota encerra navegação sem ocultar explicação", async () => {
    const h=driverHarness(),originalFetch=h.context.fetch;
    h.context.fetch=async(url,options)=>url.endsWith("/rota") ? {ok:false,status:410,json:async()=>({message:"Link encerrado"})} : originalFetch(url,options);
    await h.elements.startGps.events.click();h.gps[0].resolve({coords:{latitude:-23.66,longitude:-46.55,accuracy:10}});await settle();
    assert.equal(h.intervals.size,0);assert.equal(h.elements.startGps.disabled,true);assert.equal(h.elements.stopGps.disabled,true);
    assert.equal(h.elements.gpsStatus.hidden,false);assert.equal(h.elements.gpsStatus.textContent,"Link encerrado");
});
test("cliente exibe última posição com alerta de atraso e remove mapa ao concluir", async () => {
    const elements = Object.fromEntries(["trackingStatus","trackingUpdated","trackingLogin","trackingStage","trackingLive","trackingHeadline","trackingDistance","trackingDuration","trackingArrival","expandTrackingMap","expandTrackingLabel"].map(id=>[id,element()]));
    const updates=[]; let hides=0, resizes=0, tick;
    let data={status:"SAIU_PARA_ENTREGA",latitude:-23.66,longitude:-46.55,precisao_m:12,atualizado_em:new Date(Date.now()-180000).toISOString(),rota:{polyline:"route",distanciaMetros:2400,duracao:"600s"}};
    const ctx={URLSearchParams,AbortSignal,Date,location:{search:"?pedido=example",pathname:"/acompanhar-entrega"},document:{hidden:false,body:element(),getElementById:id=>elements[id],addEventListener(){}},sessionStorage:{getItem:()=>"token"},setTimeout(fn){fn();},setInterval(fn){tick=fn;},PetFlowDeliveryMap:()=>({update(d){updates.push(d);},hide(){hides++;},resize(){resizes++;}}),fetch:async()=>({ok:true,json:async()=>({data})})};
    ctx.window=ctx;vm.runInNewContext(source("tracking"),ctx);await settle();
    assert.equal(updates.at(-1).rota.polyline,"route");assert.match(elements.trackingStatus.textContent,/Sem atualização recente/);
    assert.equal(elements.trackingDistance.textContent,"2,4 km");assert.equal(elements.trackingDuration.textContent,"10 min");
    elements.expandTrackingMap.events.click();assert.equal(elements.trackingStage.classList.contains("is-expanded"),true);assert.equal(resizes,1);
    data={status:"ENTREGUE"};await tick();assert.match(elements.trackingStatus.textContent,/Pedido entregue/);assert.equal(hides,1);
});
function adminTrackingHarness(token = "admin-session") {
    const elements = Object.fromEntries(["trackingStatus","trackingUpdated","trackingLogin","trackingBack","trackingTitle","trackingDescription","trackingStage","trackingLive","trackingHeadline","trackingDistance","trackingDuration","trackingArrival","expandTrackingMap","expandTrackingLabel"].map(id => [id,element()]));
    const calls = [], updates = []; let hides = 0, tick;
    let data = {status:"SAIU_PARA_ENTREGA",latitude:null,longitude:null,atualizado_em:null};
    const ctx = {URLSearchParams,AbortSignal,Date,
        location:{search:"?pedido=example",pathname:"/admin/acompanhar-entrega"},
        document:{hidden:false,body:element(),getElementById:id=>elements[id],addEventListener(){}},
        sessionStorage:{getItem:key=>key === "token" ? token : "customer-session"},
        navigator:{geolocation:{getCurrentPosition(){assert.fail("Administrador não deve solicitar GPS");},watchPosition(){assert.fail("Administrador não deve acompanhar seu próprio GPS");}}},
        setInterval(fn,delay){assert.equal(delay,2000);tick=fn;},
        PetFlowDeliveryMap:()=>({update(d){updates.push(d);},hide(){hides++;},resize(){}}),
        fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data})};}
    };
    ctx.window=ctx; vm.runInNewContext(source("tracking"),ctx);
    return {elements,calls,updates,ctx,setData(value){data=value;},tick:()=>tick(),hides:()=>hides};
}
test("administrador acompanha GPS do entregador sem publicar localização e encerra ao entregar", async () => {
    const h=adminTrackingHarness(); await settle();
    assert.match(h.elements.trackingStatus.textContent,/Aguardando o entregador/);
    assert.equal(h.updates.length,0);
    assert.equal(h.elements.trackingBack.href,"/admin/pages/vendas/vendas.html?pedido=example");
    h.setData({...routeData(),status:"SAIU_PARA_ENTREGA",atualizado_em:new Date().toISOString()});
    await h.tick(); assert.equal(h.updates.at(-1).latitude,-23.66);
    h.setData({...routeData(),latitude:-23.65,status:"SAIU_PARA_ENTREGA",atualizado_em:new Date().toISOString()});
    await h.tick(); assert.equal(h.updates.at(-1).latitude,-23.65);
    h.ctx.document.hidden=true; await h.tick(); assert.equal(h.calls.length,3,"Pausa atualizações enquanto a página está oculta");
    h.ctx.document.hidden=false;
    h.setData({status:"ENTREGUE"});await h.tick();
    assert.match(h.elements.trackingStatus.textContent,/Rastreamento encerrado/);
    assert.equal(h.hides(),2);
    await h.tick();assert.equal(h.calls.length,4,"Para consultas após concluir a entrega");
    for (const call of h.calls) {
        assert.equal(call.url,"/api/vendas/example/rastreamento");
        assert.equal(call.options.method || "GET","GET");
        assert.equal(call.options.headers.Authorization,"Bearer admin-session");
    }
});
test("sessão de cliente não permite abrir acompanhamento administrativo", async () => {
    const h=adminTrackingHarness(null);await settle();
    assert.equal(h.calls.length,0);
    assert.equal(h.elements.trackingLogin.hidden,false);
    assert.equal(h.elements.trackingLogin.href,"/admin/index.html");
    assert.match(h.elements.trackingStatus.textContent,/Entre no painel administrativo/);
});
function mapHarness(mode = "tracking", delayMarker = false, cameraRelative = false, delayPan = false) {
    const elements=Object.fromEntries(["deliveryMap","mapStatus","originAddress","destinationAddress","recenterMap","centerTrackingMap","showFullRoute"].map(id=>[id,element()]));
    const paths=[], centers=[], vehicles=[], circles=[], polylines=[], maps=[], pans=[], cameraCenters=[], fits=[], notices=[], viewChanges=[]; let ready;
    const domElement = () => ({ ...element(), style: {}, children: [], setAttribute() {}, appendChild(child) { this.children.push(child); }, remove() {} });
    const ctx={URLSearchParams,console,setTimeout,clearTimeout,document:{getElementById:id=>elements[id],createElement:domElement,head:{appendChild(){ready=()=>ctx.petflowMapsReady();}}},fetch:async()=>({ok:true,json:async()=>({data:{browserKey:"public-key"}})}),google:{maps:{
        Map:class{constructor(el,options){this.options=options;this.events={};this.zoom=options.zoom;this.center={...options.center};maps.push(this);}fitBounds(b){fits.push(b);}getBounds(){return{contains:()=>this.inside!==false};}panTo(p){pans.push(p);if(!delayPan)this.setCenter(p);}setCenter(p){cameraCenters.push({...p});this.center={...p};if(cameraRelative)vehicles.filter(marker=>marker.map===this).forEach(marker=>marker.draw());}getZoom(){return this.zoom;}setZoom(value){this.zoom=value;}addListener(name,fn){this.events[name]=fn;}},
        Circle:class{constructor(){circles.push(this);}setCenter(p){this.center=p;centers.push(p);}setRadius(){}setVisible(v){this.visible=v;}},
        OverlayView:class{setMap(map){this.map=map;vehicles.push(this);if(!delayMarker)this.onAdd();}getPanes(){return{overlayMouseTarget:{appendChild(){}}};}getProjection(){return{fromLatLngToDivPixel:p=>cameraRelative ? {x:160+(p.lng-this.map.center.lng)*100000,y:240-(p.lat-this.map.center.lat)*100000} : {x:p.lng*100,y:p.lat*100}};}},
        LatLng:class{constructor(p){Object.assign(this,p);}},
        Polyline:class{constructor(options){this.options=options;polylines.push(this);}setPath(p){this.path=p;paths.push(p);}getPath(){return this.path;}},LatLngBounds:class{constructor(){this.points=[];}extend(p){this.points.push(p);return this;}},geometry:{encoding:{decodePath:()=>[{lat:-23,lng:-46}]}}
    }}};
    ctx.window=ctx;vm.runInNewContext(source("map"),ctx);
    return { elements,paths,centers,vehicles,circles,polylines,maps,pans,cameraCenters,fits,notices,viewChanges,context:ctx,map:ctx.PetFlowDeliveryMap({mode,onStatus:notice=>notices.push(notice),onViewChange:view=>viewChanges.push(JSON.parse(JSON.stringify(view)))}),ready:()=>ready() };
}
const routeData = () => ({latitude:-23.66,longitude:-46.55,precisao_m:10,endereco_entrega:{endereco:"Rua",numero:"123"},rota:{tipoOrigem:"GPS_ENTREGADOR",polyline:"route",distanciaMetros:1500,duracao:"300s",origem:{latitude:-23.66,longitude:-46.55},destino:{latitude:-23.67,longitude:-46.56}}});
test("mapa informa carregamento, recusa do Google e sucesso pelo callback opcional", async () => {
    const failure=mapHarness("driver"),pending=failure.map.update(routeData());await settle();
    assert.equal(failure.notices.at(-1).state,"loading");failure.context.gm_authFailure();await pending;
    assert.equal(failure.notices.at(-1).state,"error");assert.match(failure.notices.at(-1).message,/Google recusou/);
    assert.equal(failure.elements.deliveryMap.hidden,true);
    const success=mapHarness("driver"),loaded=success.map.update(routeData());await settle();success.ready();await loaded;
    assert.equal(success.notices.at(-1).state,"ready");assert.equal(success.elements.deliveryMap.hidden,false);
    success.context.gm_authFailure();
    assert.equal(success.notices.at(-1).state,"error","Recusa tardia aparece mesmo após callback de carga bem-sucedido");
    assert.equal(success.elements.deliveryMap.hidden,true);
    await success.map.update(routeData());assert.equal(success.notices.at(-1).state,"error","Posição seguinte não mascara recusa de autenticação");
    success.map.hide();assert.equal(success.notices.at(-1).message,"");
    const missing=mapHarness("driver");missing.context.fetch=async()=>({ok:false,json:async()=>({})});
    await missing.map.update(routeData());assert.equal(missing.notices.at(-1).state,"error");assert.match(missing.notices.at(-1).message,/não foi configurado/);
});
test("cliente vê van, partida e destino com acompanhamento automático da linha azul", async () => {
    const h=mapHarness(),data=routeData();
    const pending=h.map.update(data);await settle();h.map.hide();h.ready();await pending;
    assert.equal(h.elements.deliveryMap.hidden,true);
    await h.map.update(data);assert.equal(h.elements.deliveryMap.hidden,false);assert.equal(h.paths.length,1);assert.equal(h.centers.at(-1).lat,-23.66);
    assert.equal(h.vehicles[0].element.children[0].src,"/images/icons/delivery-car.svg");
    assert.equal(h.vehicles[0].element.children[0].width,64);
    assert.equal(h.polylines[0].options.strokeColor,"#2464d9");
    assert.equal(h.vehicles[0].element.hidden,false);
    assert.equal(h.circles[2].visible,true);
    assert.equal(h.circles[2].center.lat,data.rota.origem.latitude,"A partida aparece no acompanhamento");
    assert.ok(h.fits[0].points.some(p=>p.lat===data.rota.destino.latitude && p.lng===data.rota.destino.longitude));
    const previous=h.vehicles[0].element.style.top;
    await h.map.update({...data,latitude:-23.65});assert.equal(h.paths.length,1,"Só redesenha quando a rota muda");
    assert.equal(h.fits.length,2,"Acompanha van e destino conforme o GPS avança");
    assert.notEqual(h.vehicles[0].element.style.top,previous,"A van segue o GPS recebido");
    assert.equal(h.circles[1].center.lat,-23.67,"O destino continua sendo o endereço do cliente");
    h.maps[0].events.dragstart();await h.map.update({...data,latitude:-23.64});assert.equal(h.fits.length,2,"Respeita o mapa movido pelo cliente");
    h.elements.centerTrackingMap.events.click();assert.equal(h.fits.length,3,"Centralizar volta a enquadrar van e destino");
});
test("entregador começa seguindo GPS e pode alternar para rota completa ou mapa livre", async () => {
    const h=mapHarness("driver"),data={...routeData(),heading:90};
    const pending=h.map.update(data);await settle();h.ready();await pending;
    const marker=h.vehicles[0];
    assert.equal(marker.icon.src,"/images/icons/delivery-arrow.svg");
    assert.equal(marker.icon.hidden,false);
    assert.equal(marker.icon.style.transform,"rotate(90deg)");
    assert.equal(h.polylines[0].options.strokeColor,"#00d7f2");
    assert.equal(h.paths.length,1);assert.equal(h.fits.length,0,"Primeiro GPS segue a posição sem exigir uma rota válida");
    assert.equal(h.cameraCenters.at(-1).lat,data.latitude);
    assert.equal(h.cameraCenters.at(-1).lng,data.longitude);
    assert.equal(h.circles[2].visible,true);
    assert.equal(h.circles[2].center.lat,data.rota.origem.latitude,"Partida tem seu próprio marcador");
    assert.equal(h.circles[1].center.lat,data.rota.destino.latitude);
    assert.equal(h.pans.length,0,"Acompanhamento direto não depende de pan animado");
    assert.equal(h.maps[0].options.zoom,17);
    h.maps[0].events.dragstart();
    await h.map.update({...data,latitude:-23.65});assert.equal(h.pans.length,0,"Respeita o mapa arrastado pelo entregador");
    assert.equal(h.cameraCenters.at(-1).lat,data.latitude);
    assert.equal(h.fits.length,0);
    assert.equal(h.map.follow(),false,"A navegação não desfaz a escolha manual de mapa livre");
    h.elements.recenterMap.events.click();assert.equal(h.cameraCenters.at(-1).lat,-23.65);
    await h.map.update({...data,latitude:-23.64,heading:0});assert.equal(h.cameraCenters.at(-1).lat,-23.64);
    assert.equal(marker.icon.style.transform,"rotate(0deg)","Direção norte é válida");
    assert.equal(h.paths.length,1,"Só redesenha a rota quando ela muda");
    h.elements.showFullRoute.events.click();assert.equal(h.fits.length,1);
    assert.ok(h.fits.at(-1).points.some(p=>p.lat===data.rota.origem.latitude && p.lng===data.rota.origem.longitude));
    assert.ok(h.fits.at(-1).points.some(p=>p.lat===data.rota.destino.latitude && p.lng===data.rota.destino.longitude));
    assert.ok(h.fits.at(-1).points.some(p=>p.lat===-23.64),"A visão completa inclui a posição mais recente");
    assert.equal(h.map.follow(),false,"Uma rota nova não força seguir após escolher visão completa");
    await h.map.update({...data,latitude:-23.63});assert.equal(h.fits.length,1,"Não redefine o zoom a cada GPS dentro do mapa");
    h.maps[0].inside=false;
    await h.map.update({...data,latitude:-23.62});assert.equal(h.fits.length,2,"Reenquadra se a seta sair da área visível");
    h.map.hide();assert.equal(h.elements.recenterMap.hidden,true);assert.equal(h.elements.showFullRoute.hidden,true);
});

test("controles anunciam seguir GPS, visão completa, mapa livre e ocultação", async () => {
    const h=mapHarness("driver");
    assert.deepEqual(h.viewChanges.at(-1),{following:true,overview:false});
    assert.equal(h.elements.recenterMap["aria-pressed"],"true");
    assert.equal(h.elements.showFullRoute["aria-pressed"],"false");
    assert.equal(h.elements.recenterMap.title,"Acompanhando minha localização");
    assert.equal(h.map.follow(),false,"Não anuncia acompanhamento antes de carregar o mapa");
    assert.equal(h.viewChanges.length,1);
    const pending=h.map.update(routeData());await settle();h.ready();await pending;
    h.elements.recenterMap.events.click();
    assert.deepEqual(h.viewChanges.at(-1),{following:true,overview:false});
    assert.equal(h.elements.recenterMap["aria-pressed"],"true");
    assert.equal(h.elements.recenterMap["aria-label"],"Acompanhando minha localização");
    assert.equal(h.elements.showFullRoute["aria-pressed"],"false");
    assert.equal(h.elements.showFullRoute.title,"Mostrar rota completa");
    h.maps[0].events.dragstart();
    assert.deepEqual(h.viewChanges.at(-1),{following:false,overview:false});
    assert.equal(h.elements.recenterMap["aria-pressed"],"false");
    assert.equal(h.elements.recenterMap.title,"Seguir minha localização");
    h.elements.showFullRoute.events.click();
    assert.deepEqual(h.viewChanges.at(-1),{following:false,overview:true});
    assert.equal(h.elements.showFullRoute["aria-label"],"Exibindo rota completa");
    assert.equal(h.elements.showFullRoute["aria-pressed"],"true");
    h.elements.recenterMap.events.click();h.map.hide();
    assert.deepEqual(h.viewChanges.at(-1),{following:true,overview:false});
    assert.equal(h.elements.recenterMap.hidden,true);assert.equal(h.elements.showFullRoute.hidden,true);
    assert.equal(h.elements.recenterMap["aria-pressed"],"true");
});

test("câmera acompanha GPS diretamente mesmo se panTo não aplicar a animação", async () => {
    const h=mapHarness("driver",false,true,true),data={...routeData(),heading:90};
    const pending=h.map.update(data);await settle();h.ready();await pending;
    h.map.follow();
    const marker=h.vehicles[0],camera=h.maps[0];
    const pixel=()=>({left:marker.element.style.left,top:marker.element.style.top});
    const centeredPixel=pixel(),firstCenter={...camera.center};
    const next={...data,latitude:data.latitude+.0001,longitude:data.longitude+.0002,heading:30};
    await h.map.update(next);
    assert.equal(marker.position.lat,next.latitude);assert.equal(marker.position.lng,next.longitude);
    assert.equal(camera.center.lat,next.latitude);assert.equal(camera.center.lng,next.longitude);
    assert.notEqual(camera.center.lat,firstCenter.lat,"A câmera avançou com a coordenada recebida");
    assert.deepEqual(pixel(),centeredPixel,"Seguir GPS mantém a seta centralizada enquanto o mapa se desloca");
    assert.equal(h.pans.length,0,"Não enfileira panTo enquanto o Android entrega novas coordenadas");
    assert.equal(marker.icon.style.transform,"rotate(30deg)");
    h.maps[0].events.dragstart();
    const heldCenter={...camera.center},panCount=h.pans.length;
    const afterDrag={...next,latitude:next.latitude+.0001,longitude:next.longitude+.0001};
    await h.map.update(afterDrag);
    assert.deepEqual(camera.center,heldCenter,"Arrastar desliga acompanhamento e conserva a câmera");
    assert.equal(h.pans.length,panCount);
    assert.equal(marker.position.lat,afterDrag.latitude);assert.equal(marker.position.lng,afterDrag.longitude);
    assert.notDeepEqual(pixel(),centeredPixel,"Com câmera livre, o novo GPS desloca a seta na tela");
    const fixedPixel=pixel(),fixedPosition={...marker.position};
    await h.map.update({...afterDrag,heading:180});
    assert.equal(marker.position.lat,fixedPosition.lat);assert.equal(marker.position.lng,fixedPosition.lng);
    assert.deepEqual(pixel(),fixedPixel,"Mudar só a direção não inventa deslocamento");
    assert.deepEqual(camera.center,heldCenter);assert.equal(h.pans.length,panCount);
    assert.equal(marker.icon.style.transform,"rotate(180deg)");
});
test("seguir GPS independe de rota e hide restaura acompanhamento para a próxima sessão", async () => {
    const h=mapHarness("driver",false,true,true),data={...routeData(),rota:null};
    const pending=h.map.update(data);await settle();h.ready();await pending;
    const marker=h.vehicles[0],camera=h.maps[0];
    await h.map.update({...data,latitude:data.latitude+.0001});
    assert.equal(camera.center.lat,data.latitude+.0001);
    assert.equal(marker.position.lat,data.latitude+.0001);
    assert.equal(h.elements.showFullRoute.hidden,true,"Sem rota, a câmera ainda acompanha o GPS");
    assert.equal(h.pans.length,0);
    camera.events.dragstart();
    assert.equal(h.map.follow(),false);
    h.map.hide();
    assert.deepEqual(h.viewChanges.at(-1),{following:true,overview:false});
    await h.map.update({...data,latitude:data.latitude+.0003});
    assert.equal(camera.center.lat,data.latitude+.0003,"Nova sessão segue a primeira coordenada disponível");
    assert.equal(marker.position.lat,data.latitude+.0003);
});

test("seta permanece sem direção inicial e conserva a última direção quando parado", async () => {
    const h=mapHarness("driver"),data=routeData();
    const pending=h.map.update(data);await settle();h.ready();await pending;
    const marker=h.vehicles[0];assert.equal(marker.icon.hidden,false);
    assert.equal(marker.icon.style.transform,"rotate(0deg)");
    assert.match(h.elements.mapStatus.textContent,/Aguardando a primeira direção/);
    await h.map.update({...data,longitude:data.longitude+.001,heading:null});
    assert.equal(marker.icon.hidden,false);
    assert.ok(Math.abs(Number(marker.icon.style.transform.match(/rotate\((.+)deg\)/)[1])-90)<1);
    const lastHeading=marker.icon.style.transform;
    await h.map.update({...data,longitude:data.longitude+.001,heading:null});
    assert.equal(marker.icon.hidden,false,"Seta continua aparecendo mesmo parado");
    assert.equal(marker.icon.style.transform,lastHeading,"Não perde a última direção conhecida");
});
test("seta mantém direção quando o Google adiciona o marcador após a primeira posição", async () => {
    const h=mapHarness("driver",true);
    const pending=h.map.update({...routeData(),heading:180});await settle();h.ready();await pending;
    const marker=h.vehicles[0];marker.onAdd();
    assert.equal(marker.icon.hidden,false);assert.equal(marker.icon.style.transform,"rotate(180deg)");
    assert.equal(marker.element.hidden,false);
});
test("passos curtos sem heading nativo acumulam direção observada, curva e retorno reais", async () => {
    const h=mapHarness("driver",false,true,true);
    const fix=(latitude,longitude)=>({latitude,longitude,heading:null,precisao_m:2,rota:null});
    const pending=h.map.update(fix(0,0));await settle();h.ready();await pending;
    const marker=h.vehicles[0],camera=h.maps[0];
    const angle=()=>Number(marker.icon.style.transform.match(/rotate\((.+)deg\)/)[1]);
    async function walk(points,expectedHeading) {
        for(const [latitude,longitude] of points) {
            await h.map.update(fix(latitude,longitude));
            assert.equal(marker.position.lat,latitude);assert.equal(marker.position.lng,longitude);
            assert.equal(camera.center.lat,latitude);assert.equal(camera.center.lng,longitude);
        }
        assert.ok(Math.abs((angle()-expectedHeading+540)%360-180)<1,`Direção ${angle()} deve acompanhar ${expectedHeading} graus`);
    }
    await walk([[0,.000018],[0,.000036],[0,.000054]],90);
    const stoppedPosition={...marker.position},stoppedCenter={...camera.center};
    for(let tick=0;tick<4;tick++) await h.map.update(fix(0,.000054));
    assert.equal(angle(),90,"Parado conserva a direção observada, sem avançar no trajeto");
    assert.equal(marker.position.lat,stoppedPosition.lat);assert.equal(marker.position.lng,stoppedPosition.lng);
    assert.deepEqual(camera.center,stoppedCenter);
    await walk([[.000018,.000054],[.000036,.000054],[.000054,.000054]],0);
    await walk([[.000036,.000054],[.000018,.000054],[0,.000054]],180);
    assert.equal(h.fits.length,0);assert.equal(h.pans.length,0,"Só usa as coordenadas recebidas para posicionar a câmera");
});

test("coordenadas inválidas não movem câmera ou seta e a próxima posição válida recupera o mapa", async () => {
    const h=mapHarness("driver",false,true,true),data={latitude:0,longitude:0,heading:90,precisao_m:2,rota:null};
    const pending=h.map.update(data);await settle();h.ready();await pending;
    const marker=h.vehicles[0],position={...marker.position},camera={...h.maps[0].center},centerCount=h.cameraCenters.length;
    for(const invalid of [{latitude:NaN},{latitude:Infinity},{latitude:91},{longitude:-181},{longitude:"inválida"},{latitude:""},{longitude:true}]) {
        await h.map.update({...data,...invalid,heading:180});
        assert.equal(marker.position.lat,position.lat);assert.equal(marker.position.lng,position.lng);
        assert.deepEqual(h.maps[0].center,camera);assert.equal(h.cameraCenters.length,centerCount);
        assert.equal(h.elements.deliveryMap.hidden,true);
        assert.match(h.notices.at(-1).message,/localização recebida não é válida/);
    }
    await h.map.update({...data,latitude:.000018,heading:null});
    assert.equal(h.elements.deliveryMap.hidden,false);
    assert.equal(marker.position.lat,.000018);assert.equal(h.maps[0].center.lat,.000018);
    assert.equal(marker.icon.style.transform,"rotate(90deg)","Dados recusados não contaminam a referência da direção");
});

test("direção inválida e posição imprecisa não inventam rumo; norte nativo continua válido", async () => {
    const h=mapHarness("driver"),data={latitude:0,longitude:0,heading:null,precisao_m:120,rota:null};
    const pending=h.map.update(data);await settle();h.ready();await pending;
    const marker=h.vehicles[0];
    await h.map.update({...data,longitude:.001,precisao_m:2});
    assert.equal(marker.icon.style.transform,"rotate(0deg)","Primeira referência precisa não usa o salto de uma leitura imprecisa para estimar direção");
    await h.map.update({...data,longitude:.00106,precisao_m:2});
    assert.ok(Math.abs(Number(marker.icon.style.transform.match(/rotate\((.+)deg\)/)[1])-90)<1);
    const lastHeading=marker.icon.style.transform;
    for(const heading of [-1,360,NaN,Infinity,"90"]) {
        await h.map.update({...data,longitude:.00106,precisao_m:2,heading});
        assert.equal(marker.icon.style.transform,lastHeading,"Rumo fora da faixa ou não numérico é descartado");
    }
    await h.map.update({...data,longitude:.00106,precisao_m:2,heading:0});
    assert.equal(marker.icon.style.transform,"rotate(0deg)","Zero graus não é confundido com rumo ausente");
});

test("destino ou origem fora dos limites não produz rota geográfica fictícia", async () => {
    const h=mapHarness("driver"),data=routeData();
    const pending=h.map.update({...data,rota:{...data.rota,destino:{latitude:100,longitude:0}}});
    await settle();h.ready();await pending;
    assert.equal(h.circles[1].visible,false);assert.equal(h.paths.at(-1).length,0);
    assert.equal(h.vehicles[0].position.lat,data.latitude,"Recusar destino não altera o GPS disponível");
    await h.map.update({...data,rota:{...data.rota,origem:{latitude:0,longitude:181}}});
    assert.equal(h.circles[1].visible,true);assert.equal(h.circles[2].visible,false);
    assert.equal(h.paths.at(-1).length,0);
    await h.map.update(data);
    assert.equal(h.paths.at(-1).length,1);assert.equal(h.circles[2].visible,true);
});

test("destino do cliente aparece sem depender de uma linha de rota", async () => {
    const h=mapHarness(),data=routeData();delete data.rota.polyline;
    const pending=h.map.update(data);await settle();h.ready();await pending;
    assert.equal(h.paths.at(-1).length,0);assert.equal(h.circles[1].visible,true);
    assert.equal(h.circles[1].center.lat,data.rota.destino.latitude);
});
test("sem GPS aguarda o entregador e não inventa posição do veículo na loja", async () => {
    const h=mapHarness(),data={...routeData(),latitude:null,longitude:null};
    await h.map.update(data);
    assert.equal(h.elements.deliveryMap.hidden,true);
    assert.equal(h.paths.length,0); assert.equal(h.vehicles.length,0);
    assert.match(h.elements.originAddress.textContent,/Aguardando/);
    const pending=h.map.update(routeData());await settle();h.ready();await pending;
    assert.equal(h.vehicles[0].element.hidden,false);
});
test("navegação descarta rota antiga que estava fixada na loja", async () => {
    const h=mapHarness("driver"),data=routeData();
    const pending=h.map.update({...data,rota:{...data.rota,tipoOrigem:"LOJA"}});await settle();h.ready();await pending;
    assert.equal(h.paths.at(-1).length,0,"Não desenha a rota de outra origem");
    assert.equal(h.circles[1].visible,false);
    assert.equal(h.vehicles[0].element.hidden,false,"GPS continua visível");
    await h.map.update(data);assert.equal(h.paths.at(-1).length,1);
});
