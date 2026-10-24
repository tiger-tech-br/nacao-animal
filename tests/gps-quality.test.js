"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const quality=require("../public/js/pages/delivery/gps-quality");
const stamp=1761320000000;
const fix=(offset=0,extra={})=>({timestamp:stamp+offset,accuracy:8,speed:null,heading:null,...extra});

test("qualidade mede intervalos irregulares, idade e precisão sem confundir recepção com sensor",()=>{
    const q=quality.create();
    assert.equal(q.recordFix(fix(),stamp+100),true);
    q.recordFix(fix(3000,{accuracy:20,speed:0,heading:0}),stamp+5000);
    q.recordFix(fix(8000,{accuracy:40,speed:1.2,heading:90}),stamp+8500);
    q.recordFix(fix(9000,{accuracy:80,speed:-1,heading:360}),stamp+9000);
    const report=q.snapshot();
    assert.equal(report.reads,4);
    assert.deepEqual(report.latest,{sensorIntervalMs:1000,receiptIntervalMs:500,sampleAgeMs:0,accuracyM:80});
    assert.equal(report.intervals.sensorMeanMs,3000);assert.equal(report.intervals.sensorMaxMs,5000);
    assert.ok(Math.abs(report.intervals.receiptMeanMs-(4900+3500+500)/3)<1e-6);assert.equal(report.intervals.receiptMaxMs,4900);
    assert.deepEqual(report.age,{meanMs:650,maxMs:2000});
    assert.deepEqual(report.accuracy,{upTo10:1,upTo25:1,upTo50:1,over50:1});
    assert.deepEqual(report.speed,{missing:2,zero:1,moving:1});assert.deepEqual(report.heading,{available:2,missing:2});
});

test("amostras repetidas, fora de ordem ou inválidas não inventam leituras ou estatísticas",()=>{
    const q=quality.create();q.recordFix(fix(),stamp+20);
    const original=q.snapshot();
    for(const value of [fix(),fix(-100),fix(200,{timestamp:Infinity}),fix(300,{accuracy:-1}),fix(400,{accuracy:NaN}),fix(500,{accuracy:10001})])assert.equal(q.recordFix(value,stamp+1000),false);
    assert.deepEqual(q.snapshot(),original);
    assert.equal(q.recordFix(fix(3000),NaN),false);assert.equal(q.snapshot().reads,1);
    q.recordMotion({phase:"paused",reason:"paused"});q.recordMotion({phase:"paused",reason:"paused"});
    assert.equal(q.snapshot().reads,1);assert.equal(q.snapshot().motion.paused,1);
});

test("quadros de animação não inflam amostras, motivos ou contagem de pausas",()=>{
    const q=quality.create();
    q.recordMotion({phase:"sample",active:true,reason:"animated",durationMs:320,renderDelayMs:0});
    for(let index=1;index<=20;index++)q.recordMotion({phase:"frame",active:index<20,reason:"animated",durationMs:320,renderDelayMs:index*17});
    q.recordMotion({phase:"frame",active:false,durationMs:320,renderDelayMs:340});
    q.recordMotion({phase:"sample",active:false,reason:"sample-gap",durationMs:0,renderDelayMs:0});
    q.recordMotion({phase:"paused"});q.recordMotion({phase:"paused"});
    const report=q.snapshot().motion;
    assert.deepEqual(report,{samples:2,animated:1,immediate:1,paused:1,completed:1,maxDurationMs:320,maxRenderDelayMs:340,reasons:{animated:1,"sample-gap":1},lastReason:"sample-gap"});
    q.recordMotion({active:true,reason:"animated",durationMs:200});
    assert.equal(q.snapshot().motion.samples,2,"Callbacks legados sem phase só contribuem para máximos, sem adivinhar que são novas leituras");
});

test("relatório usa allowlist e nunca conserva coordenadas, horários absolutos, rota ou identificadores",()=>{
    const q=quality.create();
    const privateFields={latitude:-23.663742,longitude:-46.547181,token:"secret-token",route:"private-route",userId:"private-user",email:"private@example.invalid"};
    q.recordFix({...fix(),...privateFields},stamp+60);
    q.recordMotion({phase:"sample",active:false,reason:"secret-token",...privateFields,durationMs:0,renderDelayMs:0});
    const serialized=JSON.stringify(q.snapshot());
    for(const value of [...Object.values(privateFields),stamp])assert.ok(!serialized.includes(String(value)),`O relatório não inclui ${typeof value}`);
    assert.ok(!/latitude|longitude|timestamp|userId|token|route|email/.test(serialized));
    assert.equal(q.snapshot().motion.reasons.unknown,1);
    const snapshot=q.snapshot();snapshot.latest.accuracyM=999;snapshot.motion.reasons.unknown=999;snapshot.speed.moving=999;
    assert.equal(q.snapshot().latest.accuracyM,8);assert.equal(q.snapshot().motion.reasons.unknown,1);assert.equal(q.snapshot().speed.moving,0);
});

test("relógio que recua e entradas defeituosas não produzem métricas negativas, infinitas ou NaN",()=>{
    const q=quality.create();q.recordFix(fix(),stamp+1000);
    q.recordFix(fix(1000),stamp+900);
    q.recordMotion({phase:"sample",active:true,reason:"animated",durationMs:Infinity,renderDelayMs:NaN});
    q.recordMotion({phase:"frame",active:false,durationMs:-1,renderDelayMs:-50});
    function check(value){if(typeof value==="number")assert.ok(Number.isFinite(value)&&value>=0);else if(value&&typeof value==="object")Object.values(value).forEach(check);}
    check(q.snapshot());assert.equal(q.snapshot().latest.receiptIntervalMs,0);assert.equal(q.snapshot().latest.sampleAgeMs,0);
    assert.equal(q.snapshot().motion.maxDurationMs,0);assert.equal(q.snapshot().motion.maxRenderDelayMs,0);
});

test("reset apaga estatísticas e referência de leitura; módulo web não acessa GPS, rede ou armazenamento",()=>{
    const context={window:{}};
    Object.defineProperties(context,{fetch:{get(){assert.fail("Não consulta rede");}},navigator:{get(){assert.fail("Não captura GPS");}},sessionStorage:{get(){assert.fail("Não grava telemetria");}},localStorage:{get(){assert.fail("Não grava telemetria");}}});
    vm.runInNewContext(fs.readFileSync("public/js/pages/delivery/gps-quality.js","utf8"),context);
    const q=context.window.PetFlowGpsQuality.create();q.recordFix(fix(),stamp+20);q.recordMotion({phase:"sample",active:true,reason:"animated",durationMs:320});q.reset();
    assert.equal(q.snapshot().reads,0);assert.equal(q.snapshot().latest.sampleAgeMs,null);assert.equal(q.snapshot().motion.samples,0);
    assert.equal(q.recordFix(fix(-5000),stamp-4900),true,"A nova sessão não guarda horário absoluto da anterior");
});

test("encerrar conserva somente o relatório e recusa eventos tardios até reiniciar",()=>{
    const q=quality.create();q.recordFix(fix(),stamp+20);
    q.recordMotion({phase:"sample",active:true,reason:"animated",durationMs:320});
    const report=q.snapshot();q.finish();
    assert.equal(q.recordFix(fix(3000),stamp+3020),false);
    q.recordMotion({phase:"frame",active:false,renderDelayMs:9000});
    assert.deepEqual(q.snapshot(),report,"Nada altera o resumo do teste encerrado");
    q.reset();assert.equal(q.recordFix(fix(-5000),stamp-4900),true);
    assert.equal(q.snapshot().latest.sensorIntervalMs,null);
});
