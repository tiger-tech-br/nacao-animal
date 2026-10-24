"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("public/js/pages/delivery/simulation.js","utf8");
const scenarios=require("../public/js/pages/delivery/simulation-scenarios");
const engine=require("../public/js/pages/delivery/navigation-engine");
const settle=async()=>{for(let n=0;n<10;n++)await new Promise(resolve=>setImmediate(resolve));};
function element(){const classes=new Set();return {disabled:false,hidden:false,value:"",textContent:"",events:{},children:[],classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}},setAttribute(name,value){this[name]=value;},querySelector(){return element();},addEventListener(name,fn){this.events[name]=fn;},appendChild(child){this.children.push(child);if(!this.value)this.value=child.value;}};}
function harness({token="admin",role="ADMIN",authResponse,realNavigation=false}={}){
 const ids=["simulationScenario","simulationDescription","simulationStart","simulationPause","simulationStep","simulationReset","simulationAccess","simulationLogin","simulationStatus","simulationProgress","simulationFrame","simulationRemaining","simulationRecalculations","simulationView"];
 ids.push("navigationPanel","navigationInstruction","navigationDistance","navigationManeuver","navigationNext","navigationSummary","navigationTime","navigationRemaining","navigationArrival","navigationSpeed","toggleVoice");
 const elements=Object.fromEntries(ids.map(id=>[id,element()])),intervals=new Set(),timeouts=new Map(),updates=[],navigation=[],calls=[],events={},documentEvents={};
 let clock=Date.now(),options;
 class ClockDate extends Date{constructor(value){super(arguments.length?value:clock);}static now(){return clock;}}
 const context={Date:ClockDate,AbortSignal,
  document:{hidden:false,body:element(),getElementById:id=>elements[id],createElement:()=>element(),addEventListener(name,fn){documentEvents[name]=fn;}},
  navigator:{geolocation:{watchPosition(){assert.fail("Simulador não usa GPS real");},getCurrentPosition(){assert.fail("Simulador não pede localização");}}},
  sessionStorage:{getItem:()=>token,setItem(){assert.fail("Não persiste dados artificiais");}},
  PetFlowDeliveryScenarios:scenarios,PetFlowNavigationEngine:{create(route){const instance=engine.create(route);return instance&&{update(position){return instance.update(position,clock);}};}},
  PetFlowDeliveryMap(input){input.onViewChange({following:true,overview:false});return {update(data){updates.push(JSON.parse(JSON.stringify(data)));},hide(){navigation.push("hide");},follow(){return true;}};},
  PetFlowDeliveryNavigation(input){options=input;return {start(){navigation.push("start");},stop(){navigation.push("stop");},pause(){navigation.push("pause");},update(data){navigation.push({update:JSON.parse(JSON.stringify(data))});}};},
  setInterval(fn){intervals.add(fn);return fn;},clearInterval(fn){intervals.delete(fn);},setTimeout(fn){timeouts.set(fn,fn);return fn;},clearTimeout(fn){timeouts.delete(fn);},
  addEventListener(name,fn){events[name]=fn;},
  fetch:async(url,request)=>{assert.equal(url,"/api/auth/me","Simulação não chama APIs de entrega, compra ou rotas");calls.push({url,request});return authResponse?authResponse():{ok:true,json:async()=>({data:{perfil:role}})};}
 };
 context.window=context;
 if(realNavigation){vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/navigation.js","utf8"),context);const factory=context.PetFlowDeliveryNavigation;context.PetFlowDeliveryNavigation=input=>{options=input;return factory(input);};}
 vm.runInNewContext(source,context);
 return {context,elements,intervals,timeouts,updates,navigation,calls,events,documentEvents,
  async tick(){clock+=1000;[...intervals].forEach(fn=>fn());await settle();},
  advance(ms){clock+=ms;},recalculate(){options.recalculate();},flush(){[...timeouts].forEach(([key,fn])=>{timeouts.delete(key);fn();});}};
}
test("simulador exige administração antes de iniciar e nunca usa GPS físico ou publica posição",async()=>{
 const missing=harness({token:""});await settle();assert.equal(missing.updates.length,0);assert.equal(missing.elements.simulationStart.disabled,true);assert.equal(missing.elements.simulationLogin.hidden,false);
 const denied=harness({role:"CLIENTE"});await settle();assert.equal(denied.updates.length,0);assert.equal(denied.elements.simulationStart.disabled,true);
 const h=harness();await settle();assert.equal(h.updates.length,0);await h.elements.simulationStart.events.click();
 assert.equal(h.updates.length,1);assert.equal(h.intervals.size,1);assert.ok(h.updates[0].latitude>40);assert.equal(h.calls.length,2);
 h.elements.simulationPause.events.click();assert.equal(h.intervals.size,0);assert.equal(h.navigation.at(-1),"stop");
});
test("percurso completo avança com dados artificiais e termina com chegada reconhecida",async()=>{
 const h=harness();await settle();await h.elements.simulationStart.events.click();
 const start=h.updates[0];for(let n=0;n<50&&h.intervals.size;n++)await h.tick();
 assert.equal(h.intervals.size,0);assert.notEqual(h.updates.at(-1).longitude,start.longitude);
 assert.match(h.elements.simulationStatus.textContent,/Percurso concluído: chegada reconhecida/);
 assert.equal(h.elements.simulationProgress.value,100);
 assert.ok(h.calls.every(call=>call.url==="/api/auth/me"));
});
test("pausa e ocultação interrompem reprodução; reiniciar descarta resposta de recálculo anterior",async()=>{
 const h=harness();await settle();await h.elements.simulationStart.events.click();await h.tick();
 h.recalculate();assert.equal(h.timeouts.size,1);
 h.elements.simulationReset.events.click();h.flush();assert.equal(h.timeouts.size,0);assert.equal(h.elements.simulationRecalculations.textContent,"Recálculos: 0");
 assert.equal(h.elements.simulationProgress.value,0);
 h.elements.simulationStep.events.click();const count=h.updates.length;
 h.context.document.hidden=true;h.documentEvents.visibilitychange();
 assert.equal(h.navigation.at(-1),"stop");assert.equal(h.intervals.size,0);
 await h.tick();assert.equal(h.updates.length,count);
});
test("frames sem sinal conservam posição e horário em vez de fabricar GPS",async()=>{
 const h=harness();await settle();h.elements.simulationScenario.value="sinal-parada-retomada";h.elements.simulationScenario.events.change();
 await h.elements.simulationStart.events.click();
 for(let n=0;n<5;n++)await h.tick();
 const last=h.updates.at(-1),count=h.updates.length;
 for(let n=0;n<18;n++)await h.tick();
 assert.equal(h.updates.length,count);assert.equal(h.navigation.at(-1).update.atualizado_em,last.atualizado_em);
 assert.match(h.elements.simulationStatus.textContent,/Sinal interrompido/);
 for(let n=0;n<30&&h.intervals.size;n++)await h.tick();
 assert.match(h.elements.simulationStatus.textContent,/chegada reconhecida/);
});
test("ocultar enquanto autoriza não inicia reprodução ao receber resposta atrasada",async()=>{
 let finish,calls=0;
 const h=harness({authResponse:()=>{calls++;return calls===1?{ok:true,json:async()=>({data:{perfil:"ADMIN"}})}:new Promise(resolve=>{finish=resolve;});}});
 await settle();const start=h.elements.simulationStart.events.click();await settle();
 h.context.document.hidden=true;h.documentEvents.visibilitychange();h.context.document.hidden=false;
 finish({ok:true,json:async()=>({data:{perfil:"ADMIN"}})});await start;
 assert.equal(h.updates.length,0);assert.equal(h.intervals.size,0);assert.equal(h.elements.simulationStart.disabled,false);
});

test("controlador do simulador e navegação reais percorrem os quatro cenários até chegada",async()=>{
 for(const item of scenarios.list()){
  const h=harness({realNavigation:true});await settle();h.elements.simulationScenario.value=item.id;h.elements.simulationScenario.events.change();
  await h.elements.simulationStart.events.click();
  for(let index=0;index<50&&!h.elements.simulationStatus.textContent.startsWith("Percurso concluído");index++){
   await h.tick();h.flush();await settle();
  }
  assert.match(h.elements.simulationStatus.textContent,/Percurso concluído: chegada reconhecida/,item.id);
  assert.equal(h.elements.simulationProgress.value,100,item.id);
  assert.equal(h.elements.simulationRecalculations.textContent,item.id==="desvio-recalculo"?"Recálculos: 1":"Recálculos: 0",item.id);
  assert.equal(h.elements.simulationPause.disabled,true);
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
 assert.equal(h.updates.length,1);assert.equal(h.intervals.size,1);assert.equal(h.elements.simulationPause.disabled,false);
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
