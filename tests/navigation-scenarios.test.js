"use strict";

const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const navigation=require("../public/js/pages/delivery/navigation-engine");
const startTime=Date.UTC(2026,9,24,12,0,0);
// Coordenadas artificiais em metros, sem consultas a mapas nem dados de pessoas.
const point=(x,y)=>({latitude:y/111195,longitude:x/111195});
function encode(points){
    let previousLat=0,previousLng=0,encoded="";
    const value=number=>{let remaining=number<0?~(number<<1):number<<1,result="";while(remaining>=32){result+=String.fromCharCode((32|(remaining&31))+63);remaining>>=5;}return result+String.fromCharCode(remaining+63);};
    for(const coordinate of points){const lat=Math.round(coordinate.latitude*1e5),lng=Math.round(coordinate.longitude*1e5);encoded+=value(lat-previousLat)+value(lng-previousLng);previousLat=lat;previousLng=lng;}
    return encoded;
}
function route(paths){
    const steps=paths.map((coordinates,index)=>{const points=coordinates.map(([x,y])=>point(x,y));const meters=points.slice(1).reduce((sum,current,i)=>sum+navigation.distance(points[i],current),0);return{instrucao:index===0?"Siga em frente":index===1?"Vire à esquerda":"Vire à direita",manobra:index===0?"STRAIGHT":index===1?"TURN_LEFT":"TURN_RIGHT",distanciaMetros:meters,duracao:`${meters/10}s`,polyline:encode(points)};});
    return{tipoOrigem:"GPS_ENTREGADOR",origem:point(...paths[0][0]),destino:point(...paths.at(-1).at(-1)),calculadaEm:new Date(startTime).toISOString(),duracao:`${steps.reduce((sum,step)=>sum+step.distanciaMetros,0)/10}s`,etapas:steps};
}
const fix=(x,y,seconds,extra={})=>({...point(x,y),precisao_m:3,velocidade_mps:10,atualizado_em:new Date(startTime+seconds*1000).toISOString(),...extra});
function run(engine,x,y,seconds,extra){return engine.update(fix(x,y,seconds,extra),startTime+seconds*1000);}

test("trajeto curvo completo avança pelas manobras na ordem e chega apenas ao final",()=>{
    const engine=navigation.create(route([[[0,0],[80,0],[100,20],[100,120]],[[100,120],[0,120]],[[0,120],[0,220]]]));
    const readings=[[0,0,0,0],[40,0,4,0],[90,10,10,0],[100,80,17,0],[100,120,21,1],[50,120,26,1],[0,120,31,2],[0,170,36,2],[0,220,41,2]];
    let remaining=Infinity;
    for(const [x,y,seconds,index] of readings){const result=run(engine,x,y,seconds);assert.ok(["navigating","arrived"].includes(result.state),`${x},${y}: ${result.state}`);assert.equal(result.index,index);assert.ok(result.remainingMeters<=remaining+.01);remaining=result.remainingMeters;if(seconds<41)assert.equal(result.state,"navigating");else assert.equal(result.state,"arrived");}
});

test("retorno planejado pelo mesmo trecho acompanha a volta desde a primeira posição após o retorno",()=>{
    const engine=navigation.create(route([[[0,0],[180,0]],[[180,0],[0,0]]]));
    run(engine,0,0,0,{heading:90});run(engine,150,0,15,{heading:90});run(engine,180,0,18,{heading:90});
    const turning=run(engine,170,0,19,{heading:270});
    assert.equal(turning.index,1);assert.ok(turning.remainingMeters<175,"O progresso da volta não deve ficar preso nos 25 m anteriores à curva");
    assert.equal(run(engine,80,0,28,{heading:270}).state,"navigating");assert.equal(run(engine,0,0,36,{heading:270}).state,"arrived");
});

test("seguir no sentido contrário sobre a própria linha interrompe manobras e solicita nova rota",()=>{
    const engine=navigation.create(route([[[0,0],[300,0]],[[300,0],[300,100]]]));
    run(engine,120,0,12,{heading:90});const opposite=run(engine,100,0,14,{heading:270});
    assert.equal(opposite.state,"off-route");assert.equal(opposite.recalculate,false);
    assert.equal(run(engine,80,0,16,{heading:270}).recalculate,true);
});

test("destino próximo da origem em rua paralela não provoca chegada ao iniciar rota longa",()=>{
    const engine=navigation.create(route([[[0,0],[300,0]],[[300,0],[300,30]],[[300,30],[0,30]]]));
    const result=run(engine,0,20,1,{heading:90});
    assert.notEqual(result.state,"arrived");assert.ok(result.remainingMeters>450,"Não pula para o trecho terminal apenas porque é geograficamente próximo");
});

test("perda de precisão, desvio real e recuperação preservam a sequência sem avanço por relógio",()=>{
    const engine=navigation.create(route([[[0,0],[300,0]],[[300,0],[300,100]]]));
    const first=run(engine,50,0,5,{heading:90});
    assert.equal(run(engine,50,0,6,{precisao_m:80}).state,"imprecise");
    assert.equal(run(engine,60,70,7).recalculate,false);assert.equal(run(engine,70,90,8).recalculate,true);
    const recovered=run(engine,80,0,9,{heading:90});assert.equal(recovered.state,"navigating");assert.ok(recovered.remainingMeters<first.remainingMeters);
    assert.equal(engine.update(fix(80,0,9,{heading:90}),startTime+23000).remainingMeters,recovered.remainingMeters);
    assert.equal(engine.update(fix(80,0,9,{heading:90}),startTime+25000).state,"stale");
});

test("etapa terminal de chegada sem deslocamento não invalida as etapas navegáveis",()=>{
    const data=route([[[0,0],[100,0]]]);data.etapas.push({instrucao:"",manobra:"MANEUVER_UNSPECIFIED",distanciaMetros:0,duracao:"0s",polyline:encode([data.destino])});
    const engine=navigation.create(data);assert.ok(engine);assert.equal(run(engine,0,0,0,{heading:90}).state,"navigating");assert.equal(run(engine,100,0,10,{heading:90}).state,"arrived");
});

function element(){const classes=new Set(),children={};return{hidden:true,disabled:false,textContent:"",events:{},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)},addEventListener(name,callback){this.events[name]=callback;},setAttribute(name,value){this[name]=value;},querySelector(selector){return children[selector]||(children[selector]=element());}};}
function navigationHarness(data){
    const ids=["navigationPanel","navigationInstruction","navigationDistance","navigationManeuver","navigationNext","navigationSummary","navigationTime","navigationRemaining","navigationArrival","navigationSpeed","toggleVoice"];
    const elements=Object.fromEntries(ids.map(id=>[id,element()])),spoken=[];let now=startTime,tick,recalculations=0;
    class ClockDate extends Date{constructor(value){super(arguments.length?value:now);}static now(){return now;}}
    const context={Date:ClockDate,document:{hidden:false,body:element(),getElementById:id=>elements[id],addEventListener(){}},setInterval(callback){tick=callback;},
        SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{cancel(){},speak(value){spoken.push(value.text);}}};
    context.window=context;vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/navigation-engine.js","utf8"),context);
    vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/navigation.js","utf8"),context);
    const controller=context.PetFlowDeliveryNavigation({map:{follow:()=>true},recalculate(){recalculations++;}});
    elements.toggleVoice.events.click();controller.start();
    return{elements,spoken,controller,context,recalculations:()=>recalculations,
        update(x,y,seconds,extra){now=startTime+seconds*1000;controller.update({...fix(x,y,seconds,extra),rota:data});},
        tick(seconds){now=startTime+seconds*1000;tick();}};
}

test("interface e voz percorrem duas curvas até chegada sem repetir manobra já executada",()=>{
    const data=route([[[0,0],[200,0]],[[200,0],[200,150]],[[200,150],[300,150]]]),h=navigationHarness(data);
    h.update(0,0,0,{heading:90});assert.equal(h.elements.navigationInstruction.textContent,"Vire à esquerda");assert.equal(h.elements.navigationDistance.textContent,"Em 200 m");assert.equal(h.spoken[0],"Siga em frente");
    h.update(120,0,12,{heading:90});assert.equal(h.elements.navigationInstruction.textContent,"Vire à esquerda");assert.equal(h.elements.navigationManeuver.textContent,"↰");
    h.tick(13);assert.equal(h.spoken.filter(text=>text.includes("esquerda")).length,1,"Reavaliar o mesmo fix não repete áudio");
    h.update(185,0,18.5,{heading:90});h.update(200,0,20,{heading:0});
    assert.equal(h.spoken.filter(text=>text.includes("esquerda")).length,2,"Após cruzar a manobra, não manda virar outra vez");
    h.update(200,80,28,{heading:0});assert.equal(h.elements.navigationInstruction.textContent,"Vire à direita");assert.equal(h.elements.navigationManeuver.textContent,"↱");
    h.update(200,145,34.5,{heading:0});assert.equal(h.elements.navigationDistance.textContent,"Agora");
    h.update(300,150,45,{heading:90});assert.match(h.elements.navigationInstruction.textContent,/perto do endereço/);assert.match(h.spoken.at(-1),/Confira o número/);
    const count=h.spoken.length;h.tick(46);assert.equal(h.spoken.length,count,"Chegada é anunciada uma única vez");
});

test("retornos à direita e esquerda mantêm ícones coerentes com a manobra do trajeto",()=>{
    const data=route([[[0,0],[200,0]],[[200,0],[0,0]]]);data.etapas[1].manobra="U_TURN_RIGHT";data.etapas[1].instrucao="Faça o retorno à direita";
    const right=navigationHarness(data);right.update(120,0,12,{heading:90});assert.equal(right.elements.navigationManeuver.textContent,"↷");
    data.etapas[1].manobra="U_TURN_LEFT";data.etapas[1].instrucao="Faça o retorno à esquerda";
    const left=navigationHarness(data);left.update(120,0,12,{heading:90});assert.equal(left.elements.navigationManeuver.textContent,"↶");
});

test("GPS parado ignora direção sem velocidade e cruzamento repetido não salta trechos futuros",()=>{
    const data=route([[[0,0],[100,0]],[[100,0],[100,100]],[[100,100],[0,100]],[[0,100],[0,0]],[[0,0],[0,-100]]]);
    const engine=navigation.create(data);
    const start=run(engine,0,0,0,{heading:270,velocidade_mps:0});assert.equal(start.state,"navigating");assert.equal(start.index,0);
    for(const [x,y,seconds,index,heading] of [[100,0,10,1,90],[100,100,20,2,0],[0,100,30,3,270],[0,0,40,4,180]]){const state=run(engine,x,y,seconds,{heading});assert.equal(state.index,index);assert.equal(state.state,"navigating");}
    assert.equal(run(engine,0,-100,50,{heading:180}).state,"arrived");
});

test("passos curtos sem heading atravessam ida e volta sobre a mesma geometria",()=>{
    const data=route([[[0,0],[12,0]],[[12,0],[12,12]],[[12,12],[12,0]],[[12,0],[62,0]]]),engine=navigation.create(data);
    let second=0;const readings=[[0,0],[3,0],[6,0],[9,0],[12,0],[12,3],[12,6],[12,9],[12,12],[12,9],[12,6],[12,3],[12,0],[20,0],[40,0],[62,0]];
    let returning;
    for(const [index,[x,y]] of readings.entries()){const result=run(engine,x,y,second++,{heading:null,velocidade_mps:null});assert.ok(["navigating","arrived"].includes(result.state),`${index}: ${result.state}`);if(index===9)returning=result;}
    assert.equal(returning.index,2);assert.ok(returning.remainingMeters<60,"O retorno não espera deslocamentos maiores que o próprio trecho");
});

test("andar contra o percurso com passos curtos e sem heading também recalcula",()=>{
    const engine=navigation.create(route([[[0,0],[300,0]],[[300,0],[300,100]]]));
    run(engine,50,0,5,{heading:null,velocidade_mps:null});run(engine,60,0,6,{heading:null,velocidade_mps:null});
    const states=[57.5,55,52.5,50,47.5].map((x,index)=>run(engine,x,0,7+index,{heading:null,velocidade_mps:null}));
    assert.ok(states.some(result=>result.recalculate),"O sentido contrário não deve alternar silenciosamente para orientação válida entre leituras pequenas");
});

test("voz, ETA e manobras aguardam GPS real após perda de sinal e retomam com novo fix",()=>{
    const data=route([[[0,0],[200,0]],[[200,0],[200,150]]]),h=navigationHarness(data);
    h.update(120,0,12,{heading:90});const remaining=h.elements.navigationRemaining.textContent,arrival=h.elements.navigationArrival.textContent,count=h.spoken.length;
    h.tick(13);assert.equal(h.elements.navigationRemaining.textContent,remaining);assert.equal(h.elements.navigationArrival.textContent,arrival);assert.equal(h.spoken.length,count);
    h.tick(28);assert.match(h.elements.navigationInstruction.textContent,/GPS sem atualização/);assert.equal(h.elements.navigationSpeed.textContent,"—");assert.equal(h.spoken.length,count);
    h.update(200,60,30,{heading:0});assert.doesNotMatch(h.elements.navigationInstruction.textContent,/GPS/);assert.notEqual(h.elements.navigationRemaining.textContent,remaining);
});

test("rota total zero permite chegada somente com GPS próximo e confiável",()=>{
    const data={tipoOrigem:"GPS_ENTREGADOR",origem:point(0,0),destino:point(0,0),distanciaMetros:0,duracao:"0s",calculadaEm:new Date(startTime).toISOString(),etapas:[]};
    const engine=navigation.create(data);assert.ok(engine);assert.equal(run(engine,0,0,0).state,"arrived");
    assert.equal(run(engine,0,0,1,{precisao_m:80}).state,"imprecise");
    assert.equal(run(engine,100,0,2).state,"off-route");assert.equal(run(engine,110,0,3).recalculate,true);
    const h=navigationHarness(data);h.update(0,0,0);assert.match(h.elements.navigationInstruction.textContent,/perto do endereço/);assert.equal(h.elements.navigationTime.textContent,"Chegando");
    assert.equal(navigation.create({...data,distanciaMetros:100}),null,"Sem geometria não inventa um trajeto declarado como não zero");
});

test("etapa intermediária ou terminal positiva sem geometria continua inválida",()=>{
    const data=route([[[0,0],[100,0]]]);
    const zero={instrucao:"",distanciaMetros:0,duracao:"0s",polyline:encode([data.destino])};
    assert.equal(navigation.create({...data,etapas:[zero,...data.etapas]}),null);
    assert.equal(navigation.create({...data,etapas:[...data.etapas,{...zero,distanciaMetros:30}]}),null);
});
