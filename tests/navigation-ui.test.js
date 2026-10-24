"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const source=fs.readFileSync("public/js/pages/delivery/navigation.js","utf8");
function element(){const classes=new Set(),children={};return{hidden:true,disabled:false,textContent:"",events:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){this[name]=value;},querySelector(selector){return children[selector]||(children[selector]=element());}};}
test("interface do entregador mostra manobra, próxima instrução e resumo da viagem",()=>{
    const ids=["navigationPanel","navigationInstruction","navigationDistance","navigationManeuver","navigationNext","navigationSummary","navigationTime","navigationRemaining","navigationArrival","navigationSpeed","toggleVoice"];
    const elements=Object.fromEntries(ids.map(id=>[id,element()]));let interval,followed=0,recalculations=0,now=Date.UTC(2026,9,24,12,0,58);
    class ClockDate extends Date{constructor(value){super(arguments.length?value:now);}static now(){return now;}}
    const result={state:"navigating",index:0,current:{instrucao:"Siga em frente",manobra:"STRAIGHT"},next:{instrucao:"Vire à direita",manobra:"TURN_RIGHT"},afterNext:{instrucao:"Siga em frente",manobra:"STRAIGHT"},toNextMeters:80,remainingMeters:900,remainingSeconds:180,speedKmh:32};
    const ctx={Date:ClockDate,document:{hidden:false,body:element(),getElementById:id=>elements[id],addEventListener(){}},setInterval(fn,delay){assert.equal(delay,1000);interval=fn;},PetFlowNavigationEngine:{create:()=>({update:()=>result})},SpeechSynthesisUtterance:class{},speechSynthesis:{cancel(){},speak(){}},console};ctx.window=ctx;
    vm.runInNewContext(source,ctx);const navigation=ctx.PetFlowDeliveryNavigation({map:{follow(){followed++;return true;}},recalculate(){recalculations++;}});
    navigation.start();navigation.update({latitude:-23.66,longitude:-46.55,precisao_m:5,velocidade_mps:10,atualizado_em:new Date(now).toISOString(),rota:{tipoOrigem:"GPS_ENTREGADOR",polyline:"route",calculadaEm:"now",etapas:[{}]}});
    assert.equal(elements.navigationPanel.hidden,false);assert.equal(elements.navigationSummary.hidden,false);assert.equal(elements.navigationInstruction.textContent,"Vire à direita");assert.equal(elements.navigationDistance.textContent,"Em 80 m");assert.equal(elements.navigationNext.textContent,"Depois: Siga em frente");assert.equal(elements.navigationManeuver.textContent,"↱");assert.equal(elements.navigationTime.textContent,"3 min");assert.equal(elements.navigationRemaining.textContent,"900 m");assert.equal(elements.navigationSpeed.textContent,"32");assert.equal(followed,1);assert.equal(recalculations,0);
    const arrival=elements.navigationArrival.textContent;now+=5000;interval();
    assert.equal(elements.navigationArrival.textContent,arrival,"Relógio da interface não adia a previsão sem um novo fix GPS");
    assert.equal(followed,1,"Não recentraliza à força a cada atualização da tela");navigation.stop();assert.equal(elements.navigationPanel.hidden,true);
});

function noticeHarness({withNotice=true}={}){
    const ids=["navigationPanel","navigationInstruction","navigationDistance","navigationManeuver","navigationNext","navigationSummary","navigationTime","navigationRemaining","navigationArrival","navigationSpeed","toggleVoice"];
    const elements=Object.fromEntries(ids.map(id=>[id,element()])),base="Tempo estimado, sem trânsito em tempo real";
    let content=base,writes=0,tick,engineCreates=0,result={state:"navigating",index:0,current:{instrucao:"Siga em frente",manobra:"STRAIGHT"},
        toNextMeters:200,remainingMeters:200,remainingSeconds:200,speedKmh:4};
    if(withNotice){
        const notice=element();notice.hidden=false;
        Object.defineProperty(notice,"textContent",{get(){return content;},set(value){content=value;writes++;}});
        Object.defineProperty(notice,"innerHTML",{set(){assert.fail("Aviso do provedor deve ser texto, nunca HTML");}});
        elements.navigationRouteNotice=notice;
    }
    const ctx={document:{hidden:false,body:element(),getElementById:id=>elements[id],addEventListener(){}},
        setInterval(fn){tick=fn;},PetFlowNavigationEngine:{create(){engineCreates++;return{update:()=>result};}}};
    ctx.window=ctx;vm.runInNewContext(source,ctx);
    const navigation=ctx.PetFlowDeliveryNavigation({map:{follow:()=>true},recalculate(){}});
    const data=route=>({latitude:0,longitude:0,precisao_m:3,velocidade_mps:1,atualizado_em:new Date().toISOString(),
        rota:{tipoOrigem:"GPS_ENTREGADOR",polyline:"route",calculadaEm:"test",etapas:[{}],modo:"WALK",...route}});
    return{navigation,elements,base,data,tick(){tick();},writes:()=>writes,engineCreates:()=>engineCreates,
        state(value){result=value;}};
}

test("avisos da rota continuam visíveis fora do trajeto, sem duplicar texto ou interpretar HTML",()=>{
    const h=noticeHarness(),warning="Rotas a pé podem não incluir todas as calçadas e passagens.",literal="<img src=x onerror=alert('x')>";
    const trip=h.data({avisos:[` ${warning} `,warning,null,42,"",literal]});
    h.navigation.start();h.navigation.update(trip);
    const expected=`${h.base} · ${warning} · ${literal}`;
    assert.equal(h.elements.navigationRouteNotice.textContent,expected);
    assert.equal(h.writes(),1);
    h.state({state:"off-route",recalculate:false});h.navigation.update(trip);h.tick();
    assert.match(h.elements.navigationInstruction.textContent,/Atualizando o trajeto/);
    assert.equal(h.elements.navigationRouteNotice.textContent,expected,
        "Desvio não substitui nem esconde a advertência do trajeto");
    assert.equal(h.elements.navigationSummary.hidden,false);
    assert.equal(h.writes(),1,"Relógio e GPS idênticos não reescrevem um aviso já apresentado");
    h.navigation.stop();assert.equal(h.elements.navigationRouteNotice.textContent,h.base);
    assert.equal(h.writes(),2);assert.equal(h.elements.navigationSummary.hidden,true);
    h.navigation.stop();assert.equal(h.writes(),2,"Limpar novamente não recria conteúdo");
});

test("troca ou remoção de avisos atualiza somente a mensagem e não reinicia o motor da rota",()=>{
    const h=noticeHarness();h.navigation.start();
    h.navigation.update(h.data({avisos:["Aviso inicial"]}));
    assert.equal(h.engineCreates(),1);assert.equal(h.writes(),1);
    h.navigation.update(h.data({avisos:["Aviso atualizado"]}));
    assert.equal(h.elements.navigationRouteNotice.textContent,`${h.base} · Aviso atualizado`);
    assert.equal(h.engineCreates(),1);assert.equal(h.writes(),2);
    h.navigation.update(h.data({avisos:[]}));assert.equal(h.elements.navigationRouteNotice.textContent,h.base);
    assert.equal(h.writes(),3);assert.equal(h.engineCreates(),1);
    h.navigation.update(h.data({modo:"DRIVE"}));
    assert.equal(h.engineCreates(),2,"Mudança de perfil reavalia a tolerância do trajeto mesmo com geometria igual");
});

test("páginas legadas e simulador sem campo de aviso continuam navegando sem criar conteúdo extra",()=>{
    const h=noticeHarness({withNotice:false});
    h.navigation.start();h.navigation.update(h.data({avisos:["Aviso a pé"]}));h.tick();
    assert.equal(h.elements.navigationInstruction.textContent,"Siga em frente");
    assert.equal(h.elements.navigationRouteNotice,undefined);assert.equal(h.writes(),0);
    h.navigation.stop();assert.equal(h.elements.navigationSummary.hidden,true);
});
