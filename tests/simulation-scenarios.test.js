"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const scenarios=require("../public/js/pages/delivery/simulation-scenarios");
const navigation=require("../public/js/pages/delivery/navigation-engine");

function replay(id,{reroute=true}={}) {
    const scenario=scenarios.create(id),records=[],reroutes=[];
    let engine=navigation.create(scenario.route),latest=null,now=Date.parse(scenario.route.calculadaEm);
    assert.ok(engine,"O motor de produção aceita o trajeto");
    for(const [index,frame] of scenario.frames.entries()) {
        now+=1000;
        if(frame.type==="position") latest={...frame,atualizado_em:new Date(now).toISOString()};
        const result=latest ? engine.update(latest,now) : {state:"missing"};
        records.push({index,frame,result,latest:latest&&{...latest},now});
        if(reroute&&result.recalculate) {
            const route=scenario.reroute(latest);
            assert.deepEqual(route.destino,scenario.route.destino,"O recálculo conserva o mesmo destino");
            assert.deepEqual(route.origem,{latitude:latest.latitude,longitude:latest.longitude},"A nova origem é a posição do cenário");
            engine=navigation.create(route);assert.ok(engine);
            reroutes.push({index,route});
        }
    }
    return {scenario,records,reroutes};
}

test("quatro percursos artificiais têm tamanho útil, dados isolados e formato aceito pela navegação",()=>{
    const catalog=scenarios.list();
    assert.deepEqual(catalog.map(item=>item.id),["curvas-chegada","desvio-recalculo","sinal-parada-retomada","passos-curtos-retorno"]);
    for(const meta of catalog) {
        assert.deepEqual(Object.keys(meta).sort(),["description","id","title"]);
        const scenario=scenarios.create(meta.id);
        assert.ok(scenario.frames.length>=20&&scenario.frames.length<=40);
        assert.ok(navigation.create(scenario.route));
        assert.equal(scenario.route.tipoOrigem,"GPS_ENTREGADOR");
        assert.ok(Number.isFinite(Date.parse(scenario.route.calculadaEm)));
        assert.equal(scenario.route.distanciaMetros,scenario.route.etapas.reduce((sum,item)=>sum+item.distanciaMetros,0));
        for(const frame of scenario.frames) {
            if(frame.type!=="position") {
                assert.ok(["hold","signal-loss"].includes(frame.type));
                assert.deepEqual(Object.keys(frame).sort(),["label","type"],"Ausência de sinal não fornece coordenadas inventadas");
                continue;
            }
            assert.deepEqual(Object.keys(frame).sort(),["heading","label","latitude","longitude","precisao_m","type","velocidade_mps"]);
            assert.ok(frame.latitude>=40.78&&frame.latitude<40.784);
            assert.ok(frame.longitude>=-73.97&&frame.longitude< -73.965);
            assert.ok(frame.precisao_m>0&&frame.velocidade_mps>=0);
        }
        const copy=scenarios.create(meta.id);
        scenario.frames[0].latitude=0;scenario.route.destino.latitude=0;
        assert.notEqual(copy.frames[0].latitude,0);assert.notEqual(copy.route.destino.latitude,0);
    }
    catalog[0].title="alterado";
    assert.notEqual(scenarios.list()[0].title,"alterado");
    assert.throws(()=>scenarios.create("inexistente"),RangeError);
});

test("velocidade corresponde ao deslocamento por frame de um segundo, sem previsão de GPS",()=>{
    for(const {id} of scenarios.list()) {
        let previous;
        for(const frame of scenarios.create(id).frames) {
            if(frame.type!=="position") continue;
            const moved=previous?navigation.distance(previous,frame):0;
            assert.ok(Math.abs(frame.velocidade_mps-moved)<.000001,"Velocidade usa somente duas posições artificiais consecutivas");
            if(moved>.05) assert.ok(id==="passos-curtos-retorno"?moved<5:moved>=8&&moved<=15);
            previous=frame;
        }
    }
});

test("curvas e chegada percorrem as três etapas e terminam parados no destino",()=>{
    const {scenario,records,reroutes}=replay("curvas-chegada");
    assert.deepEqual([...new Set(records.map(item=>item.result.index))],[0,1,2]);
    assert.ok(records.some(item=>item.result.current?.manobra==="TURN_LEFT"));
    assert.equal(reroutes.length,0);
    assert.equal(records.at(-1).result.state,"arrived");
    assert.ok(records.at(-1).result.remainingMeters<2);
    assert.equal(records.at(-1).result.speedKmh,0);
    assert.deepEqual({latitude:records.at(-1).latest.latitude,longitude:records.at(-1).latest.longitude},scenario.route.destino);
    const progress=records.filter(item=>Number.isFinite(item.result.remainingMeters)).map(item=>item.result.remainingMeters);
    assert.ok(progress.at(-1)<progress[0]-200,"Há progresso geográfico ao longo do percurso");
});

test("desvio exige duas leituras distintas fora da rota e o novo trajeto coincide com os próximos frames",()=>{
    const {scenario,records,reroutes}=replay("desvio-recalculo");
    const off=records.filter(item=>item.result.state==="off-route");
    assert.equal(off.length,2);assert.equal(off[0].result.recalculate,false);assert.equal(off[1].result.recalculate,true);
    assert.ok(off[1].now>off[0].now);
    assert.equal(reroutes.length,1);assert.equal(reroutes[0].index,off[1].index);
    assert.ok(records.slice(off[1].index+1).every(item=>["navigating","arrived"].includes(item.result.state)),"O recálculo usa a geometria que a sequência realmente percorre");
    assert.equal(records.at(-1).result.state,"arrived");
    assert.deepEqual(reroutes[0].route.destino,scenario.route.destino);
    const without=replay("desvio-recalculo",{reroute:false});
    assert.ok(without.records.slice(off[1].index+1).some(item=>item.result.state==="off-route"),"O desvio não é um recálculo cenográfico: sem trocar rota, a falha permanece");
});

test("perda de sinal conserva o último fix, expira a orientação e só retoma com outro frame de posição",()=>{
    const {records,reroutes}=replay("sinal-parada-retomada");
    const loss=records.filter(item=>item.frame.type==="signal-loss"),holds=records.filter(item=>item.frame.type==="hold");
    assert.equal(loss.length,16);assert.equal(holds.length,2);
    const lastFix=records[loss[0].index-1].latest;
    for(const item of [...holds,...loss]) {
        assert.equal(item.latest.atualizado_em,lastFix.atualizado_em);
        assert.equal(item.latest.latitude,lastFix.latitude);assert.equal(item.latest.longitude,lastFix.longitude);
    }
    assert.equal(records[holds[0].index-1].result.speedKmh,0,"A parada tem uma leitura própria de velocidade zero");
    assert.equal(loss.at(-1).result.state,"stale");
    const resumed=records[loss.at(-1).index+1];
    assert.equal(resumed.frame.type,"position");assert.equal(resumed.result.state,"navigating");
    assert.ok(Date.parse(resumed.latest.atualizado_em)>Date.parse(lastFix.atualizado_em));
    assert.equal(reroutes.length,0);assert.equal(records.at(-1).result.state,"arrived");
});

test("passos pequenos sem rumo nativo exercitam curva e retorno planejado até a chegada",()=>{
    const {scenario,records,reroutes}=replay("passos-curtos-retorno");
    assert.ok(scenario.frames.every(frame=>frame.heading===null));
    assert.deepEqual([...new Set(records.map(item=>item.result.index))],[0,1,2,3]);
    assert.ok(records.some(item=>item.result.current?.manobra==="U_TURN_LEFT"));
    const returning=records.slice(11,15);
    assert.ok(returning.every(item=>item.result.index===2),"Enquanto as posições voltam pelo trecho, as instruções já devem ser as do retorno");
    assert.ok(returning.at(-1).result.remainingMeters<returning[0].result.remainingMeters-5,"O progresso não fica parado até o veículo sair do trecho de volta");
    assert.equal(reroutes.length,0,"Retorno incluído no trajeto não é um desvio");
    assert.equal(records.at(-1).result.state,"arrived");
    assert.equal(records.at(-1).result.speedKmh,0);
});

test("módulo também funciona no navegador sem acessar sensor, rede ou armazenamento",()=>{
    const context={window:{}};
    for(const name of ["navigator","fetch","localStorage","sessionStorage"]) for(const target of [context,context.window]) Object.defineProperty(target,name,{get(){assert.fail(`Simulação não deve acessar ${name}`);}});
    vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/simulation-scenarios.js","utf8"),context);
    const api=context.window.PetFlowDeliveryScenarios;
    assert.equal(api.list().length,4);
    const scenario=api.create("desvio-recalculo");
    const off=scenario.frames.find(frame=>frame.label.startsWith("Segunda posição"));
    const route=scenario.reroute(off);
    assert.equal(route.destino.latitude,scenario.route.destino.latitude);
    assert.equal(route.destino.longitude,scenario.route.destino.longitude);
    assert.throws(()=>scenarios.create("curvas-chegada").reroute({latitude:NaN,longitude:0}),TypeError);
});
