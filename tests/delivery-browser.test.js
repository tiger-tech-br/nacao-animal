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
    const elements = Object.fromEntries(["startGps","stopGps","refreshRoute","gpsStatus","routeStatus"].map(id => [id,element()]));
    const calls = [], updates = [], gps = [], intervals = new Set();
    const route = { polyline: "route", destino: { latitude: -23.6, longitude: -46.5 } };
    const navigationCalls=[];
    const context = { URLSearchParams, AbortSignal, Date, console,
        location: { hash: "#"+"a".repeat(64), pathname: "/entregador" }, history: { replaceState() {} },
        document: { hidden: false, getElementById: id => elements[id], addEventListener() {} },
        navigator: { geolocation: { getCurrentPosition(resolve,reject) { gps.push({resolve,reject}); } } },
        isSecureContext: true, addEventListener() {},
        setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); },
        PetFlowDeliveryMap: options => { assert.equal(options.mode,"driver"); return { update(data) { updates.push(JSON.parse(JSON.stringify(data))); }, hide() {} }; },
        PetFlowDeliveryNavigation:()=>({start(){navigationCalls.push("start");},update(data){navigationCalls.push({update:JSON.parse(JSON.stringify(data))});},stop(){navigationCalls.push("stop");},pause(){navigationCalls.push("pause");},needsRoute(){return false;}}),
        fetch: async (url,options) => {
            calls.push({url,options});
            const data = url.endsWith("/viagem") ? { id: "order", endereco_entrega: { endereco: "Rua", numero: "123" } } : url.endsWith("/rota") ? route : {};
            return { ok: true, json: async () => ({data}) };
        }
    };
    context.window = context; vm.runInNewContext(source("driver"),context);
    return { context,elements,calls,updates,gps,intervals,navigationCalls };
}
test("iniciar viagem solicita permissão, publica GPS e usa direção local na navegação", async () => {
    const h = driverHarness();
    assert.equal(h.calls.length,0,"Não transmite GPS antes do clique");
    await h.elements.startGps.events.click();
    assert.equal(h.gps.length,1);
    h.gps[0].resolve({coords:{latitude:-23.66,longitude:-46.55,accuracy:10,heading:90,speed:5}}); await settle();
    assert.ok(h.calls.some(c=>c.url.endsWith("/localizacao") && c.options.method === "POST"));
    assert.equal(h.updates.at(-1).rota.polyline,"route");
    assert.equal(h.updates.at(-1).latitude,-23.66);
    assert.equal(h.updates.at(-1).heading,90);
    assert.equal(h.updates.at(-1).velocidade_mps,5);
    assert.ok(h.navigationCalls.some(call=>call.update?.latitude===-23.66));
    assert.equal(JSON.parse(h.calls.find(c=>c.url.endsWith("/localizacao") && c.options.method === "POST").options.body).heading,undefined,"A direção permanece no aparelho do entregador");
    assert.ok(h.elements.gpsStatus.textContent.includes("Viagem em andamento"));
    await h.elements.stopGps.events.click();
    assert.equal(h.intervals.size,0);
    assert.equal(h.calls.at(-1).options.method,"DELETE");
    assert.equal(h.elements.startGps.disabled,true);
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
    assert.equal(h.intervals.size,0);
    const expired = driverHarness();
    expired.context.fetch = async () => ({ok:false,status:410,json:async()=>({message:"Link encerrado"})});
    await expired.elements.startGps.events.click();
    assert.equal(expired.gps.length,0); assert.equal(expired.elements.startGps.disabled,true);
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
        setInterval(fn,delay){assert.equal(delay,5000);tick=fn;},
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
function mapHarness(mode = "tracking", delayMarker = false) {
    const elements=Object.fromEntries(["deliveryMap","mapStatus","originAddress","destinationAddress","recenterMap","centerTrackingMap","showFullRoute"].map(id=>[id,element()]));
    const paths=[], centers=[], vehicles=[], circles=[], polylines=[], maps=[], pans=[], fits=[]; let ready;
    const domElement = () => ({ ...element(), style: {}, children: [], setAttribute() {}, appendChild(child) { this.children.push(child); }, remove() {} });
    const ctx={URLSearchParams,console,setTimeout,clearTimeout,document:{getElementById:id=>elements[id],createElement:domElement,head:{appendChild(){ready=()=>ctx.petflowMapsReady();}}},fetch:async()=>({ok:true,json:async()=>({data:{browserKey:"public-key"}})}),google:{maps:{
        Map:class{constructor(el,options){this.options=options;this.events={};this.zoom=options.zoom;maps.push(this);}fitBounds(b){fits.push(b);}getBounds(){return{contains:()=>this.inside!==false};}panTo(p){pans.push(p);}getZoom(){return this.zoom;}setZoom(value){this.zoom=value;}addListener(name,fn){this.events[name]=fn;}},
        Circle:class{constructor(){circles.push(this);}setCenter(p){this.center=p;centers.push(p);}setRadius(){}setVisible(v){this.visible=v;}},
        OverlayView:class{setMap(){vehicles.push(this);if(!delayMarker)this.onAdd();}getPanes(){return{overlayMouseTarget:{appendChild(){}}};}getProjection(){return{fromLatLngToDivPixel:p=>({x:p.lng*100,y:p.lat*100})};}},
        LatLng:class{constructor(p){Object.assign(this,p);}},
        Polyline:class{constructor(options){this.options=options;polylines.push(this);}setPath(p){this.path=p;paths.push(p);}getPath(){return this.path;}},LatLngBounds:class{constructor(){this.points=[];}extend(p){this.points.push(p);return this;}},geometry:{encoding:{decodePath:()=>[{lat:-23,lng:-46}]}}
    }}};
    ctx.window=ctx;vm.runInNewContext(source("map"),ctx);
    return { elements,paths,centers,vehicles,circles,polylines,maps,pans,fits,map:ctx.PetFlowDeliveryMap({mode}),ready:()=>ready() };
}
const routeData = () => ({latitude:-23.66,longitude:-46.55,precisao_m:10,endereco_entrega:{endereco:"Rua",numero:"123"},rota:{tipoOrigem:"GPS_ENTREGADOR",polyline:"route",distanciaMetros:1500,duracao:"300s",origem:{latitude:-23.66,longitude:-46.55},destino:{latitude:-23.67,longitude:-46.56}}});
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
test("entregador vê partida, destino e rota completa e pode alternar para seguir GPS", async () => {
    const h=mapHarness("driver"),data={...routeData(),heading:90};
    const pending=h.map.update(data);await settle();h.ready();await pending;
    const marker=h.vehicles[0];
    assert.equal(marker.icon.src,"/images/icons/delivery-arrow.svg");
    assert.equal(marker.icon.hidden,false);
    assert.equal(marker.icon.style.transform,"rotate(90deg)");
    assert.equal(h.polylines[0].options.strokeColor,"#00d7f2");
    assert.equal(h.paths.length,1);assert.equal(h.fits.length,1,"Enquadra a rota completa ao carregar");
    assert.ok(h.fits[0].points.some(p=>p.lat===data.rota.origem.latitude && p.lng===data.rota.origem.longitude));
    assert.ok(h.fits[0].points.some(p=>p.lat===data.rota.destino.latitude && p.lng===data.rota.destino.longitude));
    assert.equal(h.circles[2].visible,true);
    assert.equal(h.circles[2].center.lat,data.rota.origem.latitude,"Partida tem seu próprio marcador");
    assert.equal(h.circles[1].center.lat,data.rota.destino.latitude);
    assert.equal(h.pans.length,0,"Não centraliza só no entregador na visão completa");
    assert.equal(h.maps[0].options.zoom,17);
    h.maps[0].events.dragstart();
    await h.map.update({...data,latitude:-23.65});assert.equal(h.pans.length,0,"Respeita o mapa arrastado pelo entregador");
    assert.equal(h.fits.length,1);
    h.elements.recenterMap.events.click();assert.equal(h.pans.at(-1).lat,-23.65);
    await h.map.update({...data,latitude:-23.64,heading:0});assert.equal(h.pans.at(-1).lat,-23.64);
    assert.equal(marker.icon.style.transform,"rotate(0deg)","Direção norte é válida");
    assert.equal(h.paths.length,1,"Só redesenha a rota quando ela muda");
    h.elements.showFullRoute.events.click();assert.equal(h.fits.length,2);
    assert.ok(h.fits.at(-1).points.some(p=>p.lat===-23.64),"A visão completa inclui a posição mais recente");
    await h.map.update({...data,latitude:-23.63});assert.equal(h.fits.length,2,"Não redefine o zoom a cada GPS dentro do mapa");
    h.maps[0].inside=false;
    await h.map.update({...data,latitude:-23.62});assert.equal(h.fits.length,3,"Reenquadra se a seta sair da área visível");
    h.map.hide();assert.equal(h.elements.recenterMap.hidden,true);assert.equal(h.elements.showFullRoute.hidden,true);
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
