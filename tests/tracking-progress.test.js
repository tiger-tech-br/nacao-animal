"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const geometry=require("../public/js/pages/delivery/navigation-engine");
const base=Date.UTC(2026,9,24,12,0,0),point=(x,y=0)=>({latitude:y/111195,longitude:x/111195});
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function encode(points){let lat=0,lng=0,result="";const part=number=>{let value=number<0?~(number<<1):number<<1,out="";while(value>=32){out+=String.fromCharCode((32|(value&31))+63);value>>=5;}return out+String.fromCharCode(value+63);};for(const value of points){const nextLat=Math.round(value.latitude*1e5),nextLng=Math.round(value.longitude*1e5);result+=part(nextLat-lat)+part(nextLng-lng);lat=nextLat;lng=nextLng;}return result;}
function route(coordinates=[[0,0],[1000,0]],seconds=0){
    const points=coordinates.map(([x,y])=>point(x,y)),meters=points.slice(1).reduce((sum,value,index)=>sum+geometry.distance(points[index],value),0);
    return{tipoOrigem:"GPS_ENTREGADOR",origem:points[0],destino:points.at(-1),distanciaMetros:meters,duracao:`${meters/5}s`,polyline:encode(points),calculadaEm:new Date(base+seconds*1000).toISOString(),etapas:[{polyline:encode(points),distanciaMetros:meters,duracao:`${meters/5}s`,instrucao:"Siga em frente",manobra:"STRAIGHT"}]};
}
function element(){const classes=new Set();return{hidden:false,textContent:"",events:{},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,enabled){enabled?classes.add(value):classes.delete(value);}},setAttribute(name,value){this[name]=value;},addEventListener(name,callback){this.events[name]=callback;}};}
function harness({admin=false,legacy=false}={}){
    const ids=["trackingStatus","trackingUpdated","trackingLogin","trackingBack","trackingTitle","trackingDescription","trackingStage","trackingLive","trackingHeadline","trackingDistance","trackingDuration","trackingArrival","expandTrackingMap","expandTrackingLabel"];
    const elements=Object.fromEntries(ids.map(id=>[id,element()])),updates=[],calls=[];let now=base,token="session-one",tick,data;
    class ClockDate extends Date{constructor(value){super(arguments.length?value:now);}static now(){return now;}}
    let selectedRoute=route();
    const frame=(x,seconds,{y=0,precision=3,route:nextRoute=selectedRoute}={})=>{selectedRoute=nextRoute;now=base+seconds*1000;data={status:"SAIU_PARA_ENTREGA",...point(x,y),precisao_m:precision,atualizado_em:new Date(now).toISOString(),rota:nextRoute};};
    frame(0,0);
    const context={Date:ClockDate,URLSearchParams,AbortSignal,AbortController,location:{pathname:admin?"/admin/acompanhar-entrega":"/acompanhar-entrega",search:"?pedido=example"},
        document:{hidden:false,body:element(),getElementById:id=>elements[id],addEventListener(){}},addEventListener(){},sessionStorage:{getItem:()=>token},setInterval(callback){tick=callback;},setTimeout(callback){callback();},
        PetFlowDeliveryMap:()=>({update(value){updates.push(JSON.parse(JSON.stringify(value)));},hide(){},resize(){}}),
        fetch:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>({data})};}};
    context.window=context;if(!legacy)vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/navigation-engine.js","utf8"),context);
    vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/tracking.js","utf8"),context);
    return{elements,updates,calls,frame,tick:async()=>{await tick();await settle();},now(seconds){now=base+seconds*1000;},token(value){token=value;},data:()=>data};
}
const meters=text=>text.endsWith(" km")?Number(text.replace(" km","").replace(",","."))*1000:Number(text.replace(" m","").replace(",","."));

for(const admin of [false,true])test(`distância e minutos diminuem pelo GPS no acompanhamento ${admin?"administrativo":"do cliente"}`,async()=>{
    const h=harness({admin});await settle();const initial=meters(h.elements.trackingDistance.textContent);
    assert.ok(initial>990);assert.equal(h.elements.trackingDuration.textContent,"4 min");const arrival=h.elements.trackingArrival.textContent;
    h.frame(300,60);await h.tick();const middle=meters(h.elements.trackingDistance.textContent);assert.ok(middle>690&&middle<710);assert.equal(h.elements.trackingDuration.textContent,"3 min");
    assert.equal(h.elements.trackingArrival.textContent,arrival,"Movimento no ritmo estimado preserva ETA em vez de reiniciar tempo total");
    h.frame(700,140);await h.tick();assert.ok(meters(h.elements.trackingDistance.textContent)<310);assert.equal(h.elements.trackingDuration.textContent,"1 min");
    assert.match(h.calls[0].url,admin?/\/api\/vendas\//:/\/api\/public\/pedidos\//);
});

test("consultas repetidas ou leituras antigas não inventam progresso nem alteram ETA",async()=>{
    const h=harness();await settle();h.frame(300,60);await h.tick();
    const distance=h.elements.trackingDistance.textContent,arrival=h.elements.trackingArrival.textContent;
    h.now(61);await h.tick();assert.equal(h.elements.trackingDistance.textContent,distance);assert.equal(h.elements.trackingArrival.textContent,arrival);
    h.frame(900,30);h.now(62);await h.tick();assert.equal(h.elements.trackingDistance.textContent,distance);assert.equal(h.elements.trackingArrival.textContent,arrival);
});

test("trocar rota reinicia o motor e aplica o trajeto novo à posição atual",async()=>{
    const h=harness();await settle();h.frame(300,60);await h.tick();assert.ok(meters(h.elements.trackingDistance.textContent)<710);
    h.frame(300,60,{route:route([[300,0],[300,100],[1000,100],[1000,0]],60)});await h.tick();
    assert.ok(meters(h.elements.trackingDistance.textContent)>890,"Recalcular pode aumentar restante conforme o desvio real");
    assert.notEqual(h.elements.trackingArrival.textContent,"—");
});

test("sair e entrar limpa progresso da sessão anterior",async()=>{
    const h=harness();await settle();h.frame(700,140);await h.tick();assert.ok(meters(h.elements.trackingDistance.textContent)<310);
    h.token(null);await h.tick();assert.equal(h.elements.trackingStage.hidden,true);
    h.token("session-two");h.frame(100,150);await h.tick();assert.ok(meters(h.elements.trackingDistance.textContent)>890,"Sessão nova não herda o avanço anterior nem é rejeitada como movimento para trás");
    assert.notEqual(h.elements.trackingArrival.textContent,"—");
});

test("desvio, GPS impreciso ou antigo retiram ETA até haver novo sinal confiável",async()=>{
    const h=harness();await settle();h.frame(300,60);await h.tick();
    h.frame(350,70,{y:100});await h.tick();assert.equal(h.elements.trackingArrival.textContent,"—");assert.equal(h.elements.trackingDuration.textContent,"—");assert.match(h.elements.trackingHeadline.textContent,/Atualizando/);
    h.frame(360,72,{precision:80});await h.tick();assert.equal(h.elements.trackingArrival.textContent,"—");assert.match(h.elements.trackingHeadline.textContent,/precisão/);
    h.frame(370,74);await h.tick();assert.notEqual(h.elements.trackingArrival.textContent,"—");
    h.now(90);await h.tick();assert.equal(h.elements.trackingArrival.textContent,"—");assert.equal(h.elements.trackingDuration.textContent,"—");assert.equal(h.elements.trackingLive.hidden,true);
    h.frame(450,91);await h.tick();assert.notEqual(h.elements.trackingArrival.textContent,"—");
});

test("fallback sem etapas conserva estimativa original e não deduz progresso fictício",async()=>{
    const h=harness();await settle();const legacyRoute=route();delete legacyRoute.etapas;
    h.frame(0,1,{route:legacyRoute});await h.tick();const distance=h.elements.trackingDistance.textContent;
    h.frame(300,60,{route:legacyRoute});await h.tick();assert.equal(h.elements.trackingDistance.textContent,distance);assert.ok(meters(distance)>990);
    const invalid=route();invalid.etapas[0].polyline="abc";h.frame(310,62,{route:invalid});await h.tick();assert.equal(h.elements.trackingArrival.textContent,"—");assert.equal(h.elements.trackingDistance.textContent,"—","Geometria malformada não vira estimativa original aparentemente válida");
});
