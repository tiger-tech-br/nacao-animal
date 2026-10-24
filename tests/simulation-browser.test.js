"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("public/js/pages/delivery/simulation.js","utf8");
const scenarios=require("../public/js/pages/delivery/simulation-scenarios");
const engine=require("../public/js/pages/delivery/navigation-engine");
const settle=async()=>{for(let n=0;n<10;n++)await new Promise(resolve=>setImmediate(resolve));};
function element(){const classes=new Set();return {disabled:false,hidden:false,value:"",textContent:"",events:{},children:[],classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}},setAttribute(name,value){this[name]=value;},querySelector(){return element();},addEventListener(name,fn){this.events[name]=fn;},appendChild(child){this.children.push(child);if(!this.value)this.value=child.value;}};}
function harness({token="admin",role="ADMIN",authResponse,realNavigation=false,catalog=scenarios}={}){
 const ids=["simulationScenario","simulationDescription","simulationStart","simulationPause","simulationStep","simulationReset","simulationAccess","simulationLogin","simulationStatus","simulationProgress","simulationFrame","simulationRemaining","simulationRecalculations","simulationView","simulationMotion","simulationLatency","simulationGap"];
 ids.push("navigationPanel","navigationInstruction","navigationDistance","navigationManeuver","navigationNext","navigationSummary","navigationTime","navigationRemaining","navigationArrival","navigationSpeed","toggleVoice");
 const elements=Object.fromEntries(ids.map(id=>[id,element()])),intervals=new Map(),timeouts=new Map(),updates=[],navigation=[],calls=[],events={},documentEvents={};
 let clock=Date.now(),options,mapOptions,timerId=0;
 class ClockDate extends Date{constructor(value){super(arguments.length?value:clock);}static now(){return clock;}}
 const context={Date:ClockDate,AbortSignal,
  document:{hidden:false,body:element(),getElementById:id=>elements[id],createElement:()=>element(),addEventListener(name,fn){documentEvents[name]=fn;}},
  navigator:{geolocation:{watchPosition(){assert.fail("Simulador não usa GPS real");},getCurrentPosition(){assert.fail("Simulador não pede localização");}}},
  sessionStorage:{getItem:()=>token,setItem(){assert.fail("Não persiste dados artificiais");}},
  PetFlowDeliveryScenarios:catalog,PetFlowNavigationEngine:{create(route){const instance=engine.create(route);return instance&&{update(position){return instance.update(position,clock);}};}},
  PetFlowDeliveryMap(input){mapOptions=input;input.onViewChange({following:true,overview:false});return {update(data){updates.push(JSON.parse(JSON.stringify(data)));},hide(){navigation.push("hide");},follow(){return true;},pauseMotion(){navigation.push("pauseMotion");}};},
  PetFlowDeliveryNavigation(input){options=input;return {start(){navigation.push("start");},stop(){navigation.push("stop");},pause(){navigation.push("pause");},update(data){navigation.push({update:JSON.parse(JSON.stringify(data))});}};},
  setInterval(fn,delay){const id=++timerId;intervals.set(id,{fn,delay,at:clock+delay});return id;},clearInterval(id){intervals.delete(id);},
  setTimeout(fn,delay){const id=++timerId;timeouts.set(id,{fn,delay,at:clock+delay});return id;},clearTimeout(id){timeouts.delete(id);},
  addEventListener(name,fn){events[name]=fn;},
  fetch:async(url,request)=>{assert.equal(url,"/api/auth/me","Simulação não chama APIs de entrega, compra ou rotas");calls.push({url,request});return authResponse?authResponse():{ok:true,json:async()=>({data:{perfil:role}})};}
 };
 context.window=context;
 if(realNavigation){vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/navigation.js","utf8"),context);const factory=context.PetFlowDeliveryNavigation;context.PetFlowDeliveryNavigation=input=>{options=input;return factory(input);};}
 vm.runInNewContext(source,context);
 return {context,elements,intervals,timeouts,updates,navigation,calls,events,documentEvents,get mapOptions(){return mapOptions;},
  async tick(ms=1000){
   const target=clock+ms;let executions=0;
   while(true){
    let due;
    for(const collection of [timeouts,intervals]) for(const [id,task] of collection) if(task.at<=target&&(!due||task.at<due.task.at)) due={collection,id,task};
    if(!due)break;
    assert.ok(++executions<10000,"Relógio não deve criar uma fila infinita de reprodução");
    clock=due.task.at;
    if(due.collection===timeouts)timeouts.delete(due.id);else due.task.at+=due.task.delay;
    due.task.fn();await settle();
   }
   clock=target;await settle();
  },
  advance(ms){clock+=ms;},recalculate(){options.recalculate();}};
}
test("simulador exige administração antes de iniciar e nunca usa GPS físico ou publica posição",async()=>{
 const missing=harness({token:""});await settle();assert.equal(missing.updates.length,0);assert.equal(missing.elements.simulationStart.disabled,true);assert.equal(missing.elements.simulationLogin.hidden,false);
 const denied=harness({role:"CLIENTE"});await settle();assert.equal(denied.updates.length,0);assert.equal(denied.elements.simulationStart.disabled,true);
 const h=harness();await settle();assert.equal(h.updates.length,0);await h.elements.simulationStart.events.click();
 assert.equal(h.updates.length,1);assert.equal(h.timeouts.size,1);assert.equal([...h.timeouts.values()][0].delay,1000);assert.ok(h.updates[0].latitude>40);assert.equal(h.calls.length,2);
 h.elements.simulationPause.events.click();assert.equal(h.timeouts.size,0);assert.equal(h.navigation.at(-1),"stop");
});
test("percurso completo avança com dados artificiais e termina com chegada reconhecida",async()=>{
 const h=harness();await settle();await h.elements.simulationStart.events.click();
 const start=h.updates[0];for(let n=0;n<50&&h.timeouts.size;n++)await h.tick();
 assert.equal(h.timeouts.size,0);assert.notEqual(h.updates.at(-1).longitude,start.longitude);
 assert.match(h.elements.simulationStatus.textContent,/Percurso concluído: chegada reconhecida/);
 assert.equal(h.elements.simulationProgress.value,100);
 assert.ok(h.calls.every(call=>call.url==="/api/auth/me"));
});
test("pausa e ocultação interrompem reprodução; reiniciar descarta resposta de recálculo anterior",async()=>{
 const h=harness();await settle();await h.elements.simulationStart.events.click();await h.tick();
 h.recalculate();assert.equal(h.timeouts.size,2);
 const previousCallbacks=[...h.timeouts.values()].map(task=>task.fn);
 assert.deepEqual([...h.timeouts.values()].map(task=>task.delay).sort((a,b)=>a-b),[600,1000]);
 const before=h.updates.length;
 h.elements.simulationReset.events.click();previousCallbacks.forEach(fn=>fn());assert.equal(h.timeouts.size,0);assert.equal(h.elements.simulationRecalculations.textContent,"Recálculos: 0");
 assert.equal(h.updates.length,before,"Mesmo callbacks já despachados não restauram o percurso reiniciado");
 assert.equal(h.elements.simulationProgress.value,0);
 h.elements.simulationStep.events.click();const count=h.updates.length;
 h.context.document.hidden=true;h.documentEvents.visibilitychange();
 assert.equal(h.navigation.at(-1),"stop");assert.equal(h.timeouts.size,0);
 await h.tick();assert.equal(h.updates.length,count);
});
test("frames sem sinal conservam posição e horário em vez de fabricar GPS",async()=>{
 const h=harness();await settle();h.elements.simulationScenario.value="sinal-parada-retomada";h.elements.simulationScenario.events.change();
 await h.elements.simulationStart.events.click();
 for(let n=0;n<5;n++)await h.tick();
 const last=h.updates.at(-1),count=h.updates.length;
 for(let n=0;n<18;n++)await h.tick();
 assert.equal(h.updates.length,count);assert.equal(h.navigation.at(-1).update.atualizado_em,last.atualizado_em);
 assert.equal(h.navigation.filter(item=>item==="pauseMotion").length,16,"Cada ausência de sinal interrompe a animação sem inventar uma posição");
 assert.match(h.elements.simulationStatus.textContent,/Sinal interrompido/);
 for(let n=0;n<30&&h.timeouts.size;n++)await h.tick();
 assert.match(h.elements.simulationStatus.textContent,/chegada reconhecida/);
});
test("ocultar enquanto autoriza não inicia reprodução ao receber resposta atrasada",async()=>{
 let finish,calls=0;
 const h=harness({authResponse:()=>{calls++;return calls===1?{ok:true,json:async()=>({data:{perfil:"ADMIN"}})}:new Promise(resolve=>{finish=resolve;});}});
 await settle();const start=h.elements.simulationStart.events.click();await settle();
 h.context.document.hidden=true;h.documentEvents.visibilitychange();h.context.document.hidden=false;
 finish({ok:true,json:async()=>({data:{perfil:"ADMIN"}})});await start;
 assert.equal(h.updates.length,0);assert.equal(h.timeouts.size,0);assert.equal(h.elements.simulationStart.disabled,false);
});

test("controlador do simulador e navegação reais percorrem os oito cenários até chegada",async()=>{
 for(const item of scenarios.list()){
  const h=harness({realNavigation:true});await settle();h.elements.simulationScenario.value=item.id;h.elements.simulationScenario.events.change();
  await h.elements.simulationStart.events.click();
  for(let index=0;index<150&&!h.elements.simulationStatus.textContent.startsWith("Percurso concluído");index++){
   await h.tick();
  }
  assert.match(h.elements.simulationStatus.textContent,/Percurso concluído: chegada reconhecida/,item.id);
  assert.equal(h.elements.simulationProgress.value,100,item.id);
  assert.equal(h.elements.simulationRecalculations.textContent,item.id==="desvio-recalculo"?"Recálculos: 1":"Recálculos: 0",item.id);
  assert.equal(h.elements.simulationPause.disabled,true);
  assert.equal(h.timeouts.size,0,"Chegada não deixa outro ponto ou recálculo na fila");
  assert.ok(h.calls.every(call=>call.url==="/api/auth/me"));
 }
});

test("falha atrasada de uma autorização anterior não interrompe a nova execução",async()=>{
 let calls=0,rejectPrevious,finishCurrent;
 const h=harness({authResponse:()=>{
  calls++;if(calls===1)return {ok:true,json:async()=>({data:{perfil:"ADMIN"}})};
  return calls===2?new Promise((_resolve,reject)=>{rejectPrevious=reject;}):new Promise(resolve=>{finishCurrent=resolve;});
 }});
 await settle();const first=h.elements.simulationStart.events.click();await settle();
 h.context.document.hidden=true;h.documentEvents.visibilitychange();h.context.document.hidden=false;h.documentEvents.visibilitychange();
 const second=h.elements.simulationStart.events.click();await settle();
 rejectPrevious(new Error("Falha anterior"));await first;
 assert.equal(h.elements.simulationReset.disabled,true,"finally antigo não libera os controles da autorização atual");
 finishCurrent({ok:true,json:async()=>({data:{perfil:"ADMIN"}})});await second;
 assert.equal(h.updates.length,1);assert.equal(h.timeouts.size,1);assert.equal(h.elements.simulationPause.disabled,false);
});

test("voltar durante a primeira autorização revalida sem ficar travado ou aceitar callback antigo",async()=>{
 let calls=0,finishPrevious;
 const h=harness({authResponse:()=>{
  calls++;
  return calls===1?new Promise(resolve=>{finishPrevious=resolve;}):{ok:true,json:async()=>({data:{perfil:"ADMIN"}})};
 }});
 await settle();h.context.document.hidden=true;h.documentEvents.visibilitychange();h.context.document.hidden=false;h.documentEvents.visibilitychange();await settle();
 assert.equal(h.elements.simulationStart.disabled,false);
 finishPrevious({ok:false,json:async()=>({})});await settle();
 assert.equal(h.elements.simulationStart.disabled,false);assert.equal(h.elements.simulationLogin.hidden,true);
 await h.elements.simulationStart.events.click();assert.equal(h.updates.length,1);
});

test("ocultar enquanto autoriza executar novamente não reinicia o percurso sozinho",async()=>{
 let calls=0,finishReplay;
 const h=harness({authResponse:()=>{
  calls++;return calls<=2?{ok:true,json:async()=>({data:{perfil:"ADMIN"}})}:new Promise(resolve=>{finishReplay=resolve;});
 }});
 await settle();await h.elements.simulationStart.events.click();
 for(let n=0;n<50&&h.timeouts.size;n++)await h.tick();
 const count=h.updates.length,replay=h.elements.simulationStart.events.click();await settle();
 h.context.document.hidden=true;h.documentEvents.visibilitychange();h.context.document.hidden=false;h.documentEvents.visibilitychange();
 finishReplay({ok:true,json:async()=>({data:{perfil:"ADMIN"}})});await replay;
 assert.equal(h.updates.length,count);assert.equal(h.timeouts.size,0);
 assert.equal(h.elements.simulationStart.disabled,false);assert.equal(h.elements.simulationStart.textContent,"Executar novamente");
});

test("leituras irregulares respeitam o intervalo do próximo ponto e pausa cancela a sequência",async()=>{
 const h=harness();await settle();h.elements.simulationScenario.value="conducao-50";h.elements.simulationScenario.events.change();
 const frames=scenarios.create("conducao-50").frames;
 await h.elements.simulationStart.events.click();
 for(let index=1;index<=12;index++){
  assert.equal(h.timeouts.size,1,"Há um único próximo ponto agendado, sem intervalo fixo concorrente");
  const task=[...h.timeouts.values()][0],count=h.updates.length,last=h.updates.at(-1);
  assert.equal(task.delay,frames[index].intervalMs);
  await h.tick(task.delay-1);assert.equal(h.updates.length,count,"Não apresenta leitura antes do seu intervalo artificial");
  await h.tick(1);assert.equal(h.updates.length,count+1);
  assert.equal(Date.parse(h.updates.at(-1).atualizado_em)-Date.parse(last.atualizado_em),frames[index].intervalMs);
 }
 const pending=[...h.timeouts.values()][0].fn,count=h.updates.length;
 h.elements.simulationPause.events.click();assert.equal(h.timeouts.size,0);
 pending();await h.tick(10000);
 assert.equal(h.updates.length,count,"Pausa impede também um callback antigo de rearmar a reprodução");
 assert.equal(h.intervals.size,0,"A reprodução não cria intervalo de cadência fixa");
});

test("agendamento limita intervalos inválidos e mantém os recálculos em seu prazo separado",async()=>{
 for(const [intervalMs,expected] of [[0,100],[9000,5000],[NaN,1000]]){
  const catalog={list:scenarios.list,create(id){const scenario=scenarios.create(id);scenario.frames[1].intervalMs=intervalMs;return scenario;}};
  const h=harness({catalog});await settle();await h.elements.simulationStart.events.click();
  assert.equal([...h.timeouts.values()][0].delay,expected);
  h.recalculate();assert.deepEqual([...h.timeouts.values()].map(task=>task.delay).sort((a,b)=>a-b),[expected,600].sort((a,b)=>a-b));
  h.elements.simulationPause.events.click();assert.equal(h.timeouts.size,0);
 }
});

test("métricas do movimento exibem idade, duração e diferença sem revelar coordenadas ou usar GPS",async()=>{
 const h=harness();await settle();
 h.mapOptions.onMotion({active:true,durationMs:123.4,renderDelayMs:50.2,receivedAgeMs:37.2,remainingMeters:2.25,latitude:40.78,longitude:-73.97});
 assert.equal(h.elements.simulationMotion.textContent,"Animação: 50 de 123 ms");
 assert.equal(h.elements.simulationLatency.textContent,"Idade da leitura ao receber: 37 ms");
 assert.equal(h.elements.simulationGap.textContent,"Diferença até a leitura recebida: 2.3 m");
 const labels=[h.elements.simulationMotion,h.elements.simulationLatency,h.elements.simulationGap].map(item=>item.textContent).join(" ");
 assert.doesNotMatch(labels,/40\.78|-73\.97/);
 h.mapOptions.onMotion({active:false,durationMs:0,renderDelayMs:139.6,receivedAgeMs:0,remainingMeters:0});
 assert.equal(h.elements.simulationMotion.textContent,"Posição atualizada · desenho em 140 ms");
 h.elements.simulationReset.events.click();
 assert.equal(h.elements.simulationMotion.textContent,"Movimento aguardando");
 assert.equal(h.elements.simulationLatency.textContent,"Recepção —");assert.equal(h.elements.simulationGap.textContent,"Diferença visual —");
 assert.equal(h.updates.length,0);assert.ok(h.calls.every(call=>call.url==="/api/auth/me"));
});
