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
function mapHarness(mode = "tracking", delayMarker = false, cameraRelative = false, delayPan = false, { animate = false, reducedMotion = false, decodedPaths={} } = {}) {
    const elements=Object.fromEntries(["deliveryMap","mapStatus","originAddress","destinationAddress","recenterMap","centerTrackingMap","showFullRoute"].map(id=>[id,element()]));
    const paths=[], centers=[], vehicles=[], circles=[], polylines=[], maps=[], pans=[], cameraCenters=[], fits=[], notices=[], viewChanges=[], motions=[], documentEvents={}; let ready;
    let now=Date.UTC(2026,9,24,12),elapsed=0,nextFrame=0;const frames=new Map();
    class MotionDate extends Date { constructor(value){super(arguments.length?value:now);}static now(){return now;} }
    const clock={now:()=>now,elapse(ms){now+=ms;elapsed+=ms;},frame(ms=16){this.elapse(ms);const queued=[...frames];frames.clear();for(const [,callback] of queued)callback(elapsed);},pendingFrames:()=>frames.size};
    const domElement = () => ({ ...element(), style: {}, children: [], setAttribute() {}, appendChild(child) { this.children.push(child); }, remove() {} });
    const ctx={URLSearchParams,console,setTimeout,clearTimeout,document:{hidden:false,getElementById:id=>elements[id],createElement:domElement,addEventListener(name,callback){documentEvents[name]=callback;},head:{appendChild(){ready=()=>ctx.petflowMapsReady();}}},fetch:async()=>({ok:true,json:async()=>({data:{browserKey:"public-key"}})}),google:{maps:{
        Map:class{constructor(el,options){this.options=options;this.events={};this.zoom=options.zoom;this.center={...options.center};maps.push(this);}fitBounds(b){fits.push(b);}getBounds(){return{contains:()=>this.inside!==false};}panTo(p){pans.push(p);if(!delayPan)this.setCenter(p);}setCenter(p){cameraCenters.push({...p});this.center={...p};if(cameraRelative)vehicles.filter(marker=>marker.map===this).forEach(marker=>marker.draw());}getZoom(){return this.zoom;}setZoom(value){this.zoom=value;}addListener(name,fn){this.events[name]=fn;}},
        Circle:class{constructor(){circles.push(this);}setCenter(p){this.center=p;centers.push(p);}setRadius(){}setVisible(v){this.visible=v;}},
        OverlayView:class{setMap(map){this.map=map;vehicles.push(this);if(!delayMarker)this.onAdd();}getPanes(){return{overlayMouseTarget:{appendChild(){}}};}getProjection(){return{fromLatLngToDivPixel:p=>cameraRelative ? {x:160+(p.lng-this.map.center.lng)*100000,y:240-(p.lat-this.map.center.lat)*100000} : {x:p.lng*100,y:p.lat*100}};}},
        LatLng:class{constructor(p){Object.assign(this,p);}},
        Polyline:class{constructor(options){this.options=options;this.map=options.map;this.path=options.path||[];polylines.push(this);if(options.path)paths.push(options.path);}setPath(p){this.path=p;paths.push(p);}getPath(){return this.path;}setMap(map){this.map=map;}},LatLngBounds:class{constructor(){this.points=[];}extend(p){this.points.push(p);return this;}union(other){this.points.push(...other.points);return this;}},geometry:{encoding:{decodePath:encoded=>decodedPaths[encoded]||[{lat:-23,lng:-46}]}}
    }}};
    if(animate)Object.assign(ctx,{Date:MotionDate,performance:{now:()=>elapsed},matchMedia:()=>({matches:reducedMotion}),requestAnimationFrame(callback){const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame(id){frames.delete(id);}});
    ctx.window=ctx;vm.runInNewContext(source("map"),ctx);
    return { elements,paths,centers,vehicles,circles,polylines,maps,pans,cameraCenters,fits,notices,viewChanges,motions,documentEvents,clock,context:ctx,map:ctx.PetFlowDeliveryMap({mode,onStatus:notice=>notices.push(notice),onViewChange:view=>viewChanges.push(JSON.parse(JSON.stringify(view))),onMotion:motion=>motions.push(JSON.parse(JSON.stringify(motion)))}),ready:()=>ready() };
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

const motionFix = (h, overrides={}) => ({...routeData(),precisao_m:2,heading:90,velocidade_mps:5,
    atualizado_em:new Date(h.clock.now()).toISOString(),...overrides});
async function animatedDriverMap(options={}) {
    const h=mapHarness("driver",false,true,true,{animate:true,...options}),first=motionFix(h);
    const pending=h.map.update(first);await settle();h.ready();await pending;
    assert.equal(h.vehicles[0].position.lat,first.latitude,"A primeira posição aparece sem animação de uma origem fictícia");
    assert.equal(h.clock.pendingFrames(),0);
    return h;
}
const motionAngle = marker => Number(marker.icon.style.transform.match(/rotate\((.+)deg\)/)[1]);
const normalizedAngle = value => (value%360+360)%360;

test("animação visual mantém seta e câmera juntas, termina em até 160 ms e não extrapola GPS",async()=>{
    const h=await animatedDriverMap(),marker=h.vehicles[0],camera=h.maps[0];
    const first={...marker.position},pixel={left:marker.element.style.left,top:marker.element.style.top};
    h.clock.elapse(1000);
    const next=motionFix(h,{latitude:first.lat+.0001,longitude:first.lng+.0001});
    const original=JSON.stringify(next);Object.freeze(next);
    await h.map.update(next);
    assert.equal(marker.position.lat,first.lat,"Uma nova leitura inicia no ponto já exibido");
    assert.equal(h.clock.pendingFrames(),1);
    const motion=h.motions.findLast(item=>item.active);
    assert.ok(motion.durationMs>0&&motion.durationMs<=160);
    h.clock.frame(motion.durationMs/2);
    assert.ok(marker.position.lat>first.lat&&marker.position.lat<next.latitude,"O quadro intermediário está entre as leituras reais");
    assert.equal(camera.center.lat,marker.position.lat);assert.equal(camera.center.lng,marker.position.lng);
    assert.deepEqual({left:marker.element.style.left,top:marker.element.style.top},pixel,"A seta permanece centralizada em cada quadro");
    h.clock.frame(320);
    assert.equal(marker.position.lat,next.latitude);assert.equal(marker.position.lng,next.longitude);
    assert.deepEqual(camera.center,{...marker.position});assert.equal(h.clock.pendingFrames(),0);
    const final={...marker.position},centers=h.cameraCenters.length;
    h.clock.frame(10000);
    assert.deepEqual({...marker.position},final);assert.equal(h.cameraCenters.length,centers,"Relógio não projeta novas coordenadas sem fix");
    assert.equal(JSON.stringify(next),original,"Interpolação não altera o fix bruto utilizado pela navegação e publicação");
    assert.equal(h.motions.at(-1).active,false);
    for(const item of h.motions){
        assert.equal(typeof item.active,"boolean");
        for(const key of ["sampleAgeMs","durationMs","remainingMeters","renderDelayMs"])assert.ok(Number.isFinite(item[key])&&item[key]>=0,`${key} é uma métrica numérica válida`);
        assert.ok(!Object.keys(item).some(key=>/latitude|longitude|^lat$|^lng$|position|coordinates/i.test(key)),"Métricas não expõem coordenadas");
    }
});

test("alta velocidade reduz a duração da animação para limitar atraso visual",async()=>{
    async function durationAt(speed){
        const h=await animatedDriverMap();h.clock.elapse(1000);
        await h.map.update(motionFix(h,{latitude:-23.6599,velocidade_mps:speed}));
        const duration=h.motions.findLast(item=>item.active).durationMs;
        h.clock.frame(320);assert.equal(h.clock.pendingFrames(),0);return duration;
    }
    const slow=await durationAt(2),fast=await durationAt(35);
    assert.ok(fast>0&&fast<slow&&slow<=160,`Velocidade maior deve reduzir o atraso (${fast} ms versus ${slow} ms)`);
});

test("novo fix substitui animação em andamento a partir do quadro exibido sem formar fila",async()=>{
    const h=await animatedDriverMap(),marker=h.vehicles[0];h.clock.elapse(1000);
    const second=motionFix(h,{latitude:-23.6599,longitude:-46.5499});await h.map.update(second);
    h.clock.frame(h.motions.findLast(item=>item.active).durationMs/2);
    const displayed={...marker.position};h.clock.elapse(1);
    // A nova leitura se desloca menos de um metro em ~80ms. Um salto de
    // dezenas de metros nesse intervalo exigiria recuperação direta, não tween.
    const latest=motionFix(h,{latitude:-23.659895,longitude:-46.549895});await h.map.update(latest);
    assert.deepEqual({...marker.position},displayed,"Trocar o alvo não salta para o início ou fim da animação anterior");
    assert.equal(h.clock.pendingFrames(),1,"Só o alvo mais recente mantém um quadro agendado");
    h.clock.frame(320);
    assert.equal(marker.position.lat,latest.latitude);assert.equal(marker.position.lng,latest.longitude);
    assert.deepEqual(h.maps[0].center,{...marker.position});assert.equal(h.clock.pendingFrames(),0);
});

test("direção 359→1 e 1→359 cruza norte pelo menor arco sem inventar deslocamento",async()=>{
    const h=await animatedDriverMap(),marker=h.vehicles[0];h.clock.elapse(1000);
    await h.map.update(motionFix(h,{heading:359}));h.clock.frame(320);
    const position={...marker.position},center={...h.maps[0].center};h.clock.elapse(1000);
    await h.map.update(motionFix(h,{heading:1}));
    h.clock.frame(h.motions.findLast(item=>item.active).durationMs/2);
    const middle=normalizedAngle(motionAngle(marker));
    assert.ok(middle<2||middle>358,`A direção intermediária deve passar pelo norte, recebeu ${middle}°`);
    assert.deepEqual({...marker.position},position);assert.deepEqual(h.maps[0].center,center);
    h.clock.frame(320);assert.ok(Math.abs(normalizedAngle(motionAngle(marker))-1)<1e-6);
    h.clock.elapse(1000);await h.map.update(motionFix(h,{heading:359}));
    h.clock.frame(h.motions.findLast(item=>item.active).durationMs/2);
    const reverseMiddle=normalizedAngle(motionAngle(marker));
    assert.ok(reverseMiddle<2||reverseMiddle>358,`O arco inverso também passa pelo norte, recebeu ${reverseMiddle}°`);
    h.clock.frame(320);assert.ok(Math.abs(normalizedAngle(motionAngle(marker))-359)<1e-6);
    assert.deepEqual({...marker.position},position);assert.deepEqual(h.maps[0].center,center);
});

test("rota nova com a mesma amostra não reinicia nem prolonga a animação",async()=>{
    const h=await animatedDriverMap(),marker=h.vehicles[0];h.clock.elapse(1000);
    const next=motionFix(h,{latitude:-23.6599});await h.map.update(next);
    const duration=h.motions.findLast(item=>item.active).durationMs;
    h.clock.frame(duration/2);const displayed={...marker.position};
    await h.map.update({...next,rota:{...next.rota,polyline:"updated-route"}});
    assert.deepEqual({...marker.position},displayed);assert.equal(h.clock.pendingFrames(),1);
    h.clock.frame(duration/2+1);
    assert.equal(marker.position.lat,next.latitude);assert.equal(h.clock.pendingFrames(),0,"A rota recebida não reinicia o prazo da leitura GPS");
});

test("pausar movimento conserva o quadro e aguarda amostra nova para retomar diretamente",async()=>{
    const h=await animatedDriverMap(),marker=h.vehicles[0];h.clock.elapse(1000);
    const next=motionFix(h,{latitude:-23.6599});await h.map.update(next);
    h.clock.frame(h.motions.findLast(item=>item.active).durationMs/2);
    const displayed={...marker.position},center={...h.maps[0].center};h.map.pauseMotion();
    assert.equal(h.clock.pendingFrames(),0);h.clock.frame(1000);
    assert.deepEqual({...marker.position},displayed);assert.deepEqual(h.maps[0].center,center);
    await h.map.update({...next,rota:{...next.rota,polyline:"late-route"}});
    assert.deepEqual({...marker.position},displayed);assert.equal(h.clock.pendingFrames(),0,"Uma rota tardia não equivale a uma amostra nova");
    h.clock.elapse(1);const resumed=motionFix(h,{latitude:-23.6598});await h.map.update(resumed);
    assert.equal(marker.position.lat,resumed.latitude);assert.equal(h.maps[0].center.lat,resumed.latitude);
    assert.equal(h.clock.pendingFrames(),0,"A primeira leitura após a pausa não interpola sobre a interrupção do sinal");
});

test("hide, página oculta, GPS inválido e erro de autenticação cancelam quadros pendentes",async()=>{
    for(const reason of ["hide","hidden","invalid","authentication"]){
        const h=await animatedDriverMap(),marker=h.vehicles[0];h.clock.elapse(1000);
        const next=motionFix(h,{latitude:-23.6599});await h.map.update(next);
        h.clock.frame(h.motions.findLast(item=>item.active).durationMs/2);
        const displayed={...marker.position},center={...h.maps[0].center};
        if(reason==="hide")h.map.hide();
        else if(reason==="hidden"){
            h.context.document.hidden=true;
            h.documentEvents.visibilitychange?.();
        }else if(reason==="invalid")await h.map.update({...next,latitude:NaN});
        else h.context.gm_authFailure();
        h.clock.frame(1000);
        assert.deepEqual({...marker.position},displayed,`${reason} impede movimento residual da seta`);
        assert.deepEqual(h.maps[0].center,center,`${reason} impede movimento residual da câmera`);
        assert.equal(h.clock.pendingFrames(),0,`${reason} não mantém animação agendada`);
    }
});

test("mapa manual conserva câmera durante animação e follow usa o ponto visual atual",async()=>{
    const h=await animatedDriverMap(),marker=h.vehicles[0],camera=h.maps[0];h.clock.elapse(1000);
    await h.map.update(motionFix(h,{latitude:-23.6599}));
    const duration=h.motions.findLast(item=>item.active).durationMs;h.clock.frame(duration/3);
    camera.events.dragstart();const held={...camera.center};h.clock.frame(duration/3);
    assert.deepEqual(camera.center,held,"Arrastar interrompe somente o acompanhamento da câmera");
    assert.notEqual(marker.position.lat,held.lat);assert.equal(h.map.follow(),false,"Navegação não desfaz escolha manual");
    const visual={...marker.position};h.elements.recenterMap.events.click();
    assert.deepEqual(camera.center,visual,"Recentralizar acompanha o ponto desenhado, sem saltar ao alvo futuro");
    h.clock.frame(320);assert.deepEqual(camera.center,{...marker.position});
    h.elements.showFullRoute.events.click();const fits=h.fits.length,overviewCenter={...camera.center};
    h.clock.elapse(1000);await h.map.update(motionFix(h,{latitude:-23.6598}));h.clock.frame(320);
    assert.deepEqual(camera.center,overviewCenter);assert.equal(h.fits.length,fits);
    assert.equal(h.map.follow(),false,"Novas leituras preservam a visão completa escolhida");
});

test("GPS impreciso ou antigo aparece diretamente sem interpolação e sem direção estimada ruim",async()=>{
    for(const kind of ["imprecise","stale"]){
        const h=await animatedDriverMap(),marker=h.vehicles[0];h.clock.elapse(20000);
        const next=motionFix(h,{latitude:-23.6599,heading:null,...(kind==="imprecise"?{precisao_m:80}:{atualizado_em:new Date(h.clock.now()-16000).toISOString()})});
        await h.map.update(next);
        assert.equal(marker.position.lat,next.latitude);assert.equal(h.maps[0].center.lat,next.latitude);
        assert.equal(h.clock.pendingFrames(),0,`${kind} não anima uma posição sem confiança temporal ou espacial`);
        assert.equal(normalizedAngle(motionAngle(marker)),90,"A leitura recusada para animação não inventa direção a partir do salto");
    }
});

test("preferência por movimento reduzido mostra cada posição diretamente sem agendar animação",async()=>{
    const h=await animatedDriverMap({reducedMotion:true});h.clock.elapse(1000);
    const next=motionFix(h,{latitude:-23.6599,heading:180});await h.map.update(next);
    assert.equal(h.vehicles[0].position.lat,next.latitude);assert.equal(h.maps[0].center.lat,next.latitude);
    assert.equal(motionAngle(h.vehicles[0]),180);assert.equal(h.clock.pendingFrames(),0);
    assert.ok(h.motions.every(item=>!item.active),"Movimento reduzido não emite uma animação visual ativa");
});

test("caminhada com precisão variável e velocidade ausente ou zero suaviza leituras de três e cinco segundos",async()=>{
    for(const precision of [8,20])for(const speed of [null,0])for(const interval of [3000,5000]){
        const h=mapHarness("driver",false,true,true,{animate:true});
        const first=motionFix(h,{heading:null,velocidade_mps:speed,precisao_m:precision});
        const pending=h.map.update(first);await settle();h.ready();await pending;
        const marker=h.vehicles[0],camera=h.maps[0],started=h.clock.now();
        const pixels={left:marker.element.style.left,top:marker.element.style.top};
        for(let step=1;step<=3;step++){
            h.clock.elapse(started+step*interval-h.clock.now());
            const next=motionFix(h,{latitude:first.latitude+step*interval/1000/111320,
                heading:null,velocidade_mps:speed,precisao_m:precision});
            const before={...marker.position},original=JSON.stringify(next);Object.freeze(next);
            await h.map.update(next);
            const motion=h.motions.at(-1);
            assert.equal(motion.active,true,`accuracy=${precision}, speed=${speed}, interval=${interval}, ponto=${step}`);
            assert.ok(motion.durationMs>0&&motion.durationMs<=160,"Suavização de um fix esparso continua curta");
            assert.equal(motion.sensorIntervalMs,interval);assert.equal(motion.receiptIntervalMs,interval);
            assert.equal(h.clock.pendingFrames(),1);
            assert.deepEqual({...marker.position},before,"Receber a leitura não salta diretamente ao ponto novo");
            h.clock.frame(motion.durationMs/2);
            assert.ok(marker.position.lat>before.lat&&marker.position.lat<next.latitude);
            assert.deepEqual(camera.center,{...marker.position});
            assert.deepEqual({left:marker.element.style.left,top:marker.element.style.top},pixels);
            h.clock.frame(320);
            assert.equal(marker.position.lat,next.latitude);assert.equal(marker.position.lng,next.longitude);
            assert.deepEqual(camera.center,{...marker.position});assert.equal(h.clock.pendingFrames(),0);
            assert.equal(JSON.stringify(next),original,"Leituras artificiais do replay permanecem intactas");
        }
        const end={...marker.position},centers=h.cameraCenters.length;
        h.clock.frame(5000);
        assert.deepEqual({...marker.position},end);assert.equal(h.cameraCenters.length,centers,"Nenhuma previsão de posição entre leituras");
    }
});

test("passos de caminhada sem velocidade nativa começam a acompanhar prontamente e alcançam o último GPS sem inventar avanço",async()=>{
    for(const interval of [3000,5000])for(const speed of [null,0]){
        const h=mapHarness("driver",false,true,true,{animate:true});
        const first=motionFix(h,{heading:null,velocidade_mps:speed,precisao_m:8});
        const pending=h.map.update(first);await settle();h.ready();await pending;
        h.clock.elapse(interval);
        const next=motionFix(h,{latitude:first.latitude+interval/1000/111320,heading:null,velocidade_mps:speed,precisao_m:8});
        await h.map.update(next);const motion=h.motions.at(-1);
        assert.equal(motion.active,true);assert.ok(motion.durationMs<=160,"A caminhada não ganha uma animação longa por falta de velocidade do sensor");
        h.clock.frame(16);
        assert.ok(h.vehicles[0].position.lat>first.latitude,"O primeiro quadro já move a posição recebida");
        assert.deepEqual(h.maps[0].center,{...h.vehicles[0].position});
        h.clock.frame(64);
        const observedFraction=(h.vehicles[0].position.lat-first.latitude)/(next.latitude-first.latitude);
        assert.ok(observedFraction>=.5-1e-6,"Após 80ms, ao menos metade do passo recebido já aparece");
        assert.deepEqual(h.maps[0].center,{...h.vehicles[0].position});
        h.clock.frame(80);
        assert.equal(h.vehicles[0].position.lat,next.latitude);assert.equal(h.clock.pendingFrames(),0);
        const displayed={...h.vehicles[0].position},centers=h.cameraCenters.length;
        h.clock.frame(interval);
        assert.deepEqual({...h.vehicles[0].position},displayed);assert.equal(h.cameraCenters.length,centers,
            "A seta aguarda a próxima posição real em vez de multiplicar a velocidade para parecer mais rápida");
    }
});

test("leitura realista de dois segundos ainda suaviza, sem estender animação pela idade da amostra",async()=>{
    const h=mapHarness("driver",false,true,true,{animate:true});
    const first=motionFix(h,{atualizado_em:new Date(h.clock.now()-2000).toISOString(),heading:null,velocidade_mps:null,precisao_m:12});
    const pending=h.map.update(first);await settle();h.ready();await pending;
    h.clock.elapse(1000);
    const next=motionFix(h,{latitude:first.latitude+.00003,atualizado_em:new Date(h.clock.now()-2000).toISOString(),
        heading:null,velocidade_mps:null,precisao_m:12});
    await h.map.update(next);
    const motion=h.motions.at(-1);
    assert.equal(motion.active,true);assert.equal(motion.receivedAgeMs,2000);
    assert.equal(motion.sensorIntervalMs,1000);assert.equal(motion.receiptIntervalMs,1000);
    assert.ok(motion.durationMs>0&&motion.durationMs<=160);
    h.clock.frame(320);
    assert.equal(h.vehicles[0].position.lat,next.latitude);assert.equal(h.clock.pendingFrames(),0);
});

test("limites de cinco segundos entre leituras e três segundos de idade separam suavização de atualização direta",async()=>{
    for(const item of [
        {label:"intervalo de cinco segundos",interval:5000,age:0,animated:true},
        {label:"intervalo acima de cinco segundos",interval:5001,age:0,animated:false},
        {label:"idade de três segundos",interval:5000,age:3000,animated:true},
        {label:"idade acima de três segundos",interval:5000,age:3001,animated:false}
    ]){
        const h=await animatedDriverMap();h.clock.elapse(item.interval);
        const next=motionFix(h,{latitude:-23.6599,atualizado_em:new Date(h.clock.now()-item.age).toISOString()});
        await h.map.update(next);
        assert.equal(h.motions.at(-1).active,item.animated,item.label);
        assert.equal(h.clock.pendingFrames(),item.animated?1:0,item.label);
        if(item.animated)h.clock.frame(320);
        assert.equal(h.vehicles[0].position.lat,next.latitude,item.label);
        assert.equal(h.maps[0].center.lat,next.latitude,item.label);
        const position={...h.vehicles[0].position},centers=h.cameraCenters.length;
        h.clock.frame(2000);
        assert.deepEqual({...h.vehicles[0].position},position);assert.equal(h.cameraCenters.length,centers,item.label);
    }
});

test("novo horário sem mudança de posição ou direção não agenda animação inútil",async()=>{
    for(const speed of [null,0,5]){
        const h=await animatedDriverMap(),position={...h.vehicles[0].position},heading=motionAngle(h.vehicles[0]);
        h.clock.elapse(1000);
        await h.map.update(motionFix(h,{velocidade_mps:speed}));
        assert.equal(h.clock.pendingFrames(),0,`speed=${speed} não anima coordenadas idênticas`);
        assert.equal(h.motions.at(-1).active,false);
        assert.deepEqual({...h.vehicles[0].position},position);assert.equal(motionAngle(h.vehicles[0]),heading);
    }
});

test("métricas de apresentação identificam decisão e intervalos sem revelar coordenadas nem inventar novas amostras",async()=>{
    const h=await animatedDriverMap();h.clock.elapse(3000);
    const next=motionFix(h,{latitude:-23.6599,heading:null,velocidade_mps:0,precisao_m:8});
    await h.map.update(next);
    const motion=h.motions.at(-1);
    assert.equal(motion.active,true);assert.equal(typeof motion.reason,"string");assert.ok(motion.reason.length>0);
    assert.equal(motion.sensorIntervalMs,3000);assert.equal(motion.receiptIntervalMs,3000);
    h.clock.frame(motion.durationMs/2);h.clock.frame(320);
    for(const sample of h.motions){
        assert.equal(typeof sample.reason,"string");
        for(const key of ["sensorIntervalMs","receiptIntervalMs"])assert.ok(Number.isFinite(sample[key])&&sample[key]>=0,key);
        assert.ok(!Object.keys(sample).some(key=>/latitude|longitude|^lat$|^lng$|position|coordinates/i.test(key)));
    }
    const last=h.motions.at(-1);
    assert.equal(last.sensorIntervalMs,motion.sensorIntervalMs,"Quadros de animação não viram leituras de sensor");
    assert.equal(last.receiptIntervalMs,motion.receiptIntervalMs);
});

const routeResponse=(data,status=200)=>({ok:status<400,status,json:async()=>status<400?{data}:{message:data}});
test("mapa desenha alternativas em cinza, conserva a escolhida em ciano e enquadra todas sem refazer a cada GPS",async()=>{
    const paths={chosen:[{lat:-23.66,lng:-46.55},{lat:-23.67,lng:-46.56}],
        alternate:[{lat:-23.61,lng:-46.50},{lat:-23.67,lng:-46.56}],
        other:[{lat:-23.70,lng:-46.59},{lat:-23.67,lng:-46.56}]};
    const h=mapHarness("driver",false,false,false,{decodedPaths:paths}),data=routeData();
    const options=[{id:"rota-0",modo:"DRIVE",polyline:"chosen"},{id:"rota-1",modo:"DRIVE",polyline:"alternate"},{id:"rota-2",modo:"DRIVE",polyline:"other"}];
    data.rota={...data.rota,...options[0],calculadaEm:"2026-10-24T12:00:00.000Z",alternativas:options};
    const pending=h.map.update(data);await settle();h.ready();await pending;
    assert.equal(h.polylines.length,3);
    assert.equal(h.polylines[0].options.strokeColor,"#00d7f2");assert.deepEqual(h.polylines[0].path,paths.chosen);
    const firstAlternates=h.polylines.slice(1);
    for(const line of firstAlternates){assert.equal(line.options.strokeColor,"#8fa5b1");assert.equal(line.options.clickable,false);assert.equal(line.map,h.maps[0]);}
    h.elements.showFullRoute.events.click();
    assert.ok(h.fits.at(-1).points.some(point=>point.lat===-23.61&&point.lng===-46.50));
    assert.ok(h.fits.at(-1).points.some(point=>point.lat===-23.70&&point.lng===-46.59));
    const pathCount=h.paths.length,lineCount=h.polylines.length;
    await h.map.update({...data,latitude:-23.6599});await h.map.update({...data,latitude:-23.6598});
    assert.equal(h.polylines.length,lineCount);assert.equal(h.paths.length,pathCount,"Novos fixes não refazem caminhos do mesmo lote");
    await h.map.update({...data,rota:{...data.rota,...options[1]}});
    assert.ok(firstAlternates.every(line=>line.map===null),"Trocar a escolhida remove as alternativas antigas");
    assert.deepEqual(h.polylines[0].path,paths.alternate,"A geometria escolhida ocupa o traço ciano");
    const currentAlternates=h.polylines.filter(line=>line!==h.polylines[0]&&line.map!==null);
    assert.equal(currentAlternates.length,2);h.map.hide();
    assert.ok(currentAlternates.every(line=>line.map===null),"Encerrar remove os outros caminhos da sessão");
    await h.map.update(data);const revived=h.polylines.filter(line=>line!==h.polylines[0]&&line.map!==null);
    await h.map.update({...data,rota:null});
    assert.ok(revived.every(line=>line.map===null),"Limpar a rota não conserva alternativas antigas");
    assert.equal(h.polylines[0].path.length,0);
});

test("visão completa reenquadra alternativas novas mesmo quando a rota escolhida conserva a geometria",async()=>{
    const geometry={same:[{lat:-23.66,lng:-46.55},{lat:-23.67,lng:-46.56}],
        near:[{lat:-23.665,lng:-46.555}],far:[{lat:-23.50,lng:-46.40}]};
    const h=mapHarness("driver",false,false,false,{decodedPaths:geometry}),data=routeData();
    const options=[{id:"rota-0",modo:"DRIVE",polyline:"same"},{id:"rota-1",modo:"DRIVE",polyline:"near"}];
    data.rota={...data.rota,...options[0],calculadaEm:"2026-10-24T12:00:00.000Z",alternativas:options};
    const pending=h.map.update(data);await settle();h.ready();await pending;h.elements.showFullRoute.events.click();
    const fits=h.fits.length;
    await h.map.update({...data,rota:{...data.rota,calculadaEm:"2026-10-24T12:00:20.000Z",
        alternativas:[options[0],{...options[1],polyline:"far"}]}});
    assert.equal(h.fits.length,fits+1,"Novo conjunto não deixa a alternativa fora do enquadramento escolhido");
    assert.ok(h.fits.at(-1).points.some(point=>point.lat===-23.50&&point.lng===-46.40));
    assert.equal(h.map.follow(),false,"Reenquadrar as opções mantém a visão completa em vez de seguir a seta");
});
