"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs");
const source = fs.readFileSync("public/js/pages/delivery/gps-test.js", "utf8");
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
function element() {
    return { hidden: false, disabled: false, textContent: "", events: {}, classList: { toggle() {} },
        addEventListener(name, fn) { this.events[name] = fn; } };
}
function harness({ token = "admin-session", role = "ADMIN", routeRequest, clipboard, routeOptions = false } = {}) {
    const elements = Object.fromEntries(["gpsStatus", "gpsMovementStatus", "startGps", "stopGps", "refreshRoute", "routeStatus", "mapStatus", "testLogin", "destinationAddress", "originAddress","gpsDiagnostics","gpsDiagnosticSummary","gpsDiagnosticReport","copyGpsDiagnostic","gpsDiagnosticStatus"].map(id => [id, element()]));
    const calls = [], watches = [], cleared = [], updates = [], navigation = [], documentEvents = {}, events = {}, timers = new Map(), optionCalls=[];
    const intervals = new Set();
    let mapOptions, nextTimer = 0, clock = Date.now(), navigationOptions, optionOptions;
    class FakeDate extends Date { static now() { return clock; } }
    const context = { Date: FakeDate, AbortController, AbortSignal,
        sessionStorage: { getItem(key) { assert.equal(key, "token"); return token; }, setItem() { assert.fail("Não deve gravar posição no navegador"); } },
        document: { hidden: false, getElementById(id) { assert.ok(elements[id], id); return elements[id]; }, addEventListener(name, fn) { documentEvents[name] = fn; } },
        navigator: { clipboard, geolocation: { watchPosition(success, error, options) { watches.push({ success, error, options }); return watches.length; }, clearWatch(id) { cleared.push(id); } } },
        isSecureContext: true,
        addEventListener(name, fn) { events[name] = fn; },
        setTimeout(fn,delay=0) { const id = ++nextTimer; timers.set(id, {fn,at:clock+delay}); return id; }, clearTimeout(id) { timers.delete(id); },
        setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); },
        PetFlowNavigationEngine: require("../public/js/pages/delivery/navigation-engine"),
        PetFlowGpsQuality: require("../public/js/pages/delivery/gps-quality"),
        PetFlowDeliveryMap(options) { mapOptions = options; return { update(data) { updates.push(JSON.parse(JSON.stringify(data))); }, hide() { navigation.push("hide"); } }; },
        PetFlowDeliveryNavigation(options) { navigationOptions=options;return { start() { navigation.push("start"); }, update(data) { navigation.push({ update: JSON.parse(JSON.stringify(data)) }); }, stop() { navigation.push("stop"); }, pause() { navigation.push("pause"); } }; },
        fetch: async (url, options) => {
            calls.push({ url, options, localUpdates: updates.length });
            if (url === "/api/auth/me") return { ok: true, json: async () => ({ data: { perfil: role } }) };
            assert.equal(url, "/api/gps-diagnostico/rota");
            return routeRequest ? routeRequest(url, options) : { ok: true, json: async () => ({ data: { tipoOrigem: "GPS_ENTREGADOR", polyline: "route", destino: { latitude: -23.6, longitude: -46.5 } } }) };
        }
    };
    if(routeOptions)context.PetFlowDeliveryRouteOptions=options=>{
        optionOptions=options;
        return {setBusy(value){optionCalls.push({busy:value});},render(route){optionCalls.push({render:JSON.parse(JSON.stringify(route))});},clear(){optionCalls.push({clear:true});}};
    };
    context.window = context; vm.runInNewContext(source, context);
    const fix = (index = watches.length - 1, extras = {}) => watches[index].success({ timestamp: ++clock, coords: { latitude: -23.66, longitude: -46.55, accuracy: 8, heading: 90, speed: 2, ...extras } });
    return { context, elements, calls, watches, cleared, updates, navigation, documentEvents, events, timers, intervals, fix,optionCalls,
        notice(notice) { mapOptions.onStatus(notice); }, view(view) { mapOptions.onViewChange(view); }, motion(notice) { mapOptions.onMotion(notice); },
        tick() { [...intervals].forEach(fn => fn()); }, advance(ms) { clock += ms; },
        async runTimers(){for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();await settle();}},
        recalculate(){navigationOptions.recalculate();},optionInput:()=>optionOptions,select(route){optionOptions.onSelect(route);},now:()=>clock};
}
test("teste físico exige sessão administrativa e clique antes do GPS", async () => {
    const h = harness(); await settle();
    assert.equal(h.watches.length, 0); assert.equal(h.calls.length, 1);
    assert.equal(h.elements.startGps.disabled, false);
    await h.elements.startGps.events.click(); assert.equal(h.watches.length, 1);
    assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 0);
    h.fix(); await settle();
    const route = h.calls.find(c => c.url.includes("diagnostico"));
    assert.ok(route.localUpdates > 0, "GPS renderizado antes da chamada de rede");
    assert.deepEqual(Object.keys(JSON.parse(route.options.body)).sort(), ["latitude", "longitude", "precisao", "timestamp"]);
    assert.equal(h.updates.at(-1).rota.polyline, "route");
    assert.match(h.elements.gpsStatus.textContent, /GPS obtido.*Precisão: 8 m.*Rota calculada/);
    assert.doesNotMatch(h.elements.gpsStatus.textContent, /-23|-46/);
});

test("diagnóstico do sensor mede leituras espaçadas e exporta somente métricas após parar",async()=>{
    const copied=[],h=harness({clipboard:{writeText:async text=>copied.push(text)}});
    await settle();await h.elements.startGps.events.click();h.fix(0,{speed:0});await settle();
    h.advance(2999);h.fix(0,{latitude:-23.65997,accuracy:20,speed:null});await settle();
    h.motion({phase:"sample",active:true,reason:"animated",durationMs:320,renderDelayMs:0});
    for(let n=0;n<20;n++)h.motion({phase:"frame",active:true,reason:"animated",durationMs:320,renderDelayMs:n*16});
    h.motion({phase:"frame",active:false,reason:"animated",durationMs:320,renderDelayMs:336});
    assert.equal(h.elements.gpsDiagnostics.hidden,true,"O relatório não cobre o mapa durante o teste");
    assert.match(h.elements.gpsMovementStatus.textContent,/Intervalo: 3 s/);
    h.elements.stopGps.events.click();
    assert.equal(h.elements.gpsDiagnostics.hidden,false);assert.equal(h.elements.copyGpsDiagnostic.disabled,false);
    assert.match(h.elements.gpsDiagnosticSummary.textContent,/2 leituras/);
    await h.elements.copyGpsDiagnostic.events.click();
    assert.equal(copied.length,1);const report=JSON.parse(copied[0]);
    assert.equal(report.reads,2);assert.equal(report.latest.receiptIntervalMs,3000);
    assert.equal(report.speed.zero,1);assert.equal(report.speed.missing,1);
    assert.equal(report.motion.samples,1);assert.equal(report.motion.completed,1);
    assert.equal(report.motion.maxRenderDelayMs,336);
    assert.doesNotMatch(copied[0],/latitude|longitude|-23\.66|-46\.55|admin-session|polyline|endereco|timestamp/i);
    assert.equal(h.elements.gpsDiagnosticReport.value,copied[0]);
    assert.ok(h.calls.every(call=>["/api/auth/me","/api/gps-diagnostico/rota"].includes(call.url)),"Métricas não são publicadas em uma API");
    await h.elements.startGps.events.click();
    assert.equal(h.elements.gpsDiagnostics.hidden,true);assert.equal(h.elements.gpsDiagnosticReport.value,"");
});

test("sem acesso à área de transferência, relatório continua copiável sem coordenadas e ocultação o limpa",async()=>{
    const h=harness();await settle();await h.elements.startGps.events.click();h.fix();await settle();
    h.elements.stopGps.events.click();await h.elements.copyGpsDiagnostic.events.click();
    assert.equal(h.elements.gpsDiagnosticReport.hidden,false);
    assert.match(h.elements.gpsDiagnosticStatus.textContent,/Selecione e copie/);
    assert.equal(JSON.parse(h.elements.gpsDiagnosticReport.value).reads,1);
    await h.elements.startGps.events.click();h.fix(1);await settle();
    h.context.document.hidden=true;h.documentEvents.visibilitychange();
    assert.equal(h.elements.gpsDiagnostics.hidden,true);assert.equal(h.elements.gpsDiagnosticReport.value,"");
    assert.equal(h.elements.copyGpsDiagnostic.disabled,true);
});

test("ocultar depois de parar remove o relatório e ignora conclusão atrasada da cópia",async()=>{
    let copied;
    const h=harness({clipboard:{writeText:()=>new Promise(resolve=>{copied=resolve;})}});
    await settle();await h.elements.startGps.events.click();h.fix();await settle();h.elements.stopGps.events.click();
    const copying=h.elements.copyGpsDiagnostic.events.click();await settle();
    assert.equal(h.elements.gpsDiagnosticReport.hidden,false);
    h.context.document.hidden=true;h.documentEvents.visibilitychange();
    assert.equal(h.elements.gpsDiagnostics.hidden,true);assert.equal(h.elements.gpsDiagnosticReport.value,"");
    copied();await copying;
    assert.equal(h.elements.gpsDiagnosticStatus.hidden,true,"Uma cópia antiga não repõe mensagem após limpar o teste");
    assert.equal(h.elements.copyGpsDiagnostic.disabled,true);
});
test("sem administrador ou perfil sem permissão não solicita GPS", async () => {
    const missing = harness({ token: "" }); await settle(); await missing.elements.startGps.events.click();
    assert.equal(missing.watches.length, 0); assert.equal(missing.calls.length, 0); assert.equal(missing.elements.testLogin.hidden, false);
    const denied = harness({ role: "VENDEDOR" }); await settle(); await denied.elements.startGps.events.click();
    assert.equal(denied.watches.length, 0); assert.equal(denied.elements.testLogin.hidden, false);
});
test("permissão negada encerra watch e permite tentar novamente", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click();
    h.watches[0].error({ code: 1 });
    assert.deepEqual(h.cleared, [1]); assert.equal(h.elements.startGps.disabled, false);
    assert.match(h.elements.gpsStatus.textContent, /Localização negada/);
    assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 0);
});
test("GPS continua local enquanto rede está lenta e rota inicial só é solicitada uma vez", async () => {
    let finish;
    const h = harness({ routeRequest: () => new Promise(resolve => { finish = resolve; }) });
    await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    h.fix(0, { latitude: -23.661 }); h.fix(0, { latitude: -23.662 }); await settle();
    assert.equal(h.updates.at(-1).latitude, -23.662); assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 1);
    finish({ ok: true, json: async () => ({ data: { polyline: "slow-route" } }) }); await settle();
    assert.equal(h.updates.at(-1).latitude, -23.662); assert.equal(h.updates.at(-1).rota.polyline, "slow-route");
});
test("parar cancela rede e watch, limpa mapa e ignora respostas ou posições tardias", async () => {
    let finish;
    const h = harness({ routeRequest: () => new Promise(resolve => { finish = resolve; }) });
    await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    const request = h.calls.find(c => c.url.includes("diagnostico"));
    h.elements.stopGps.events.click(); const length = h.updates.length;
    assert.equal(request.options.signal.aborted, true); assert.deepEqual(h.cleared, [1]);
    finish({ ok: true, json: async () => ({ data: { polyline: "late" } }) }); h.fix(); await settle();
    assert.equal(h.updates.length, length); assert.equal(h.elements.routeStatus.hidden, true);
    assert.match(h.elements.gpsStatus.textContent, /Teste encerrado/);
});
test("mapa recusado informa erro sem parar GPS e falha da rota permite nova consulta manual após limite", async () => {
    const h = harness({ routeRequest: async () => ({ ok: false, status: 503, json: async () => ({ message: "Rota indisponível" }) }) });
    await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    h.notice({ state: "error", message: "Google recusou o mapa" });
    assert.equal(h.elements.mapStatus.hidden, false); assert.match(h.elements.mapStatus.textContent, /recusou/);
    assert.match(h.elements.routeStatus.textContent, /Rota indisponível/);
    h.fix(0, { latitude: -23.67 }); await settle(); assert.equal(h.updates.at(-1).latitude, -23.67);
    await h.elements.refreshRoute.events.click(); assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 1);
    assert.match(h.elements.routeStatus.textContent, /Aguarde/);
    h.advance(60001); h.fix(); await h.elements.refreshRoute.events.click();
    assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 2);
});
test("ocultar ou voltar do BFCache exige retomada explícita", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click();
    h.context.document.hidden = true; h.documentEvents.visibilitychange();
    assert.deepEqual(h.cleared, [1]); assert.equal(h.elements.startGps.textContent, "Retomar teste");
    h.context.document.hidden = false; h.events.pageshow({ persisted: true }); h.documentEvents.visibilitychange(); await settle();
    assert.equal(h.watches.length, 1); h.fix(0); assert.equal(h.updates.length, 0);
    await h.elements.startGps.events.click(); assert.equal(h.watches.length, 2);
    h.events.pagehide(); assert.deepEqual(h.cleared, [1, 2]);
});
test("posição antiga ou imprecisa não provoca chamadas pagas de rota", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click();
    h.watches[0].success({ timestamp: Date.now() - 40000, coords: { latitude: -23, longitude: -46, accuracy: 10 } });
    assert.equal(h.updates.length, 0);
    h.fix(0, { accuracy: 180 }); await settle();
    assert.equal(h.updates.length, 1); assert.equal(h.calls.filter(c => c.url.includes("diagnostico")).length, 0);
    await h.elements.refreshRoute.events.click(); assert.match(h.elements.routeStatus.textContent, /precisão de até 50 m/);
});

test("movimento medido usa coordenadas reais; girar a seta ou mudar a câmera não inventa deslocamento", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click();
    h.fix(); await settle();
    assert.match(h.elements.gpsMovementStatus.textContent, /~0 m desde o início/);
    h.view({ following: true, overview: false });
    assert.match(h.elements.gpsMovementStatus.textContent, /mapa anda por baixo da seta centralizada/);
    h.advance(5000); h.fix(0, { latitude: -23.6597 }); await settle();
    assert.equal(h.updates.at(-1).latitude, -23.6597);
    assert.match(h.elements.gpsMovementStatus.textContent, /~33 m desde o início/);
    h.advance(1000); h.fix(0, { latitude: -23.6597, heading: 180 }); await settle();
    assert.match(h.elements.gpsMovementStatus.textContent, /~33 m desde o início/);
    h.view({ following: false, overview: true });
    assert.match(h.elements.gpsMovementStatus.textContent, /Rota completa/);
    h.view({ following: false, overview: false });
    assert.match(h.elements.gpsMovementStatus.textContent, /Mapa livre/);
    assert.equal(h.calls.filter(call => call.url.includes("diagnostico")).length, 1, "Indicadores locais não consultam outra rota");
    assert.doesNotMatch(h.elements.gpsMovementStatus.textContent, /-23|-46/);
    h.elements.stopGps.events.click();
    assert.equal(h.elements.gpsMovementStatus.hidden, true);
    assert.equal(h.intervals.size, 0);
    await h.elements.startGps.events.click(); h.fix(1, { latitude: -23.65 }); await settle();
    assert.match(h.elements.gpsMovementStatus.textContent, /~0 m desde o início/, "Retomada não preserva a origem pessoal da sessão anterior");
});

test("GPS sem novas leituras mostra idade e espera sinal sem movimentar a posição", async () => {
    const h = harness(); await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    h.notice({ state: "ready", message: "Mapa pronto" });
    assert.equal(h.elements.gpsStatus.hidden, true);
    const count = h.updates.length;
    h.advance(16000); h.tick();
    assert.equal(h.elements.gpsStatus.hidden, false);
    assert.match(h.elements.gpsStatus.textContent, /GPS sem atualização há 16 segundos/);
    assert.match(h.elements.gpsMovementStatus.textContent, /Leitura há 16 s/);
    assert.equal(h.updates.length, count, "O relógio não cria posições GPS");
    assert.equal(h.navigation.at(-1), "pause");
    h.advance(1); h.fix(0, { latitude: -23.6597 }); await settle();
    assert.equal(h.elements.gpsStatus.hidden, true);
    assert.match(h.elements.gpsMovementStatus.textContent, /Leitura agora/);
    assert.match(h.elements.gpsMovementStatus.textContent, /~33 m/);
    h.context.document.hidden = true; h.documentEvents.visibilitychange();
    assert.equal(h.intervals.size, 0);
    assert.equal(h.elements.gpsMovementStatus.hidden, true);
});

test("diagnóstico ignora GPS fora de ordem e rota atrasada não retoma manobras após perda de sinal", async () => {
    let finish;
    const h = harness({ routeRequest: () => new Promise(resolve => { finish = resolve; }) });
    await settle(); await h.elements.startGps.events.click(); h.fix(); await settle();
    h.advance(1000); h.fix(0, { latitude: -23.6597 });
    const last = h.updates.at(-1), before = h.updates.length;
    h.watches[0].success({ timestamp: last.timestamp - 500, coords: { latitude: -23.6605, longitude: -46.55, accuracy: 4 } });
    assert.equal(h.updates.length, before, "GPS antigo não substitui o deslocamento mais recente");
    h.watches[0].error({ code: 2 });
    finish({ ok: true, json: async () => ({ data: { polyline: "late-route" } }) }); await settle();
    assert.equal(h.navigation.at(-1), "pause", "Rota pendente não encerra a pausa de sinal");
    assert.match(h.elements.gpsStatus.textContent, /GPS temporariamente indisponível/);
    h.advance(1000); h.fix(0, { latitude: -23.6595 }); await settle();
    assert.equal(h.navigation.at(-1).update.latitude, -23.6595, "A nova leitura real retoma orientação");
    assert.equal(h.updates.at(-1).rota, undefined,"Uma rota cancelada pelo erro GPS não é reaproveitada como resposta atual");
    assert.equal(h.calls.find(c=>c.url.includes("diagnostico")).options.signal.aborted,true);
});

const routesFor = (name="route") => {
    const alternatives=[0,1].map(index=>({id:`rota-${index}`,polyline:`${name}-${index}`,tipoOrigem:"GPS_ENTREGADOR",origem:{latitude:-23.66,longitude:-46.55},destino:{latitude:-23.6,longitude:-46.5},distanciaMetros:1000+index*100,duracao:"600s",etapas:[]}));
    return {...alternatives[0],alternativas:alternatives,enderecoDestino:{endereco:"Loja de teste"}};
};
const routeCalls = h => h.calls.filter(call=>call.url.includes("diagnostico"));
async function startWithGps(h){await settle();await h.elements.startGps.events.click();h.fix();await settle();}

test("diagnóstico oferece somente alternativas e mantém o contrato original da posição GPS",async()=>{
    const h=harness({routeOptions:true,routeRequest:()=>({ok:true,json:async()=>({data:routesFor()})})});
    await startWithGps(h);
    const body=JSON.parse(routeCalls(h)[0].options.body);
    assert.equal(body.modo,undefined);assert.deepEqual(Object.keys(body).sort(),["latitude","longitude","precisao","timestamp"]);
    assert.deepEqual(Object.keys(h.optionInput()),["onSelect"]);
    assert.equal(h.optionCalls.find(call=>call.render)?.render.alternativas.length,2);
    assert.equal(h.watches.length,1);
});

test("desvio agenda um único recálculo automático e usa a posição mais recente ao vencer a reserva",async()=>{
    let count=0;
    const h=harness({routeOptions:true,routeRequest:()=>({ok:true,json:async()=>({data:routesFor(`route-${++count}`)})})});
    await startWithGps(h);h.advance(1000);h.recalculate();h.recalculate();h.recalculate();
    assert.equal(h.timers.size,1);assert.equal(routeCalls(h).length,1);
    h.advance(14999);h.fix(0,{latitude:-23.6597});await h.runTimers();
    assert.equal(routeCalls(h).length,2);assert.equal(h.watches.length,1);
    assert.equal(JSON.parse(routeCalls(h)[1].options.body).latitude,-23.6597);
    assert.equal(h.updates.at(-1).rota.polyline,"route-2-0");assert.equal(h.timers.size,0);
});

test("erro GPS aborta a consulta anterior e sua resposta tardia não altera a nova rota ou controles",async()=>{
    const pending=[];
    const h=harness({routeOptions:true,routeRequest:()=>new Promise(resolve=>pending.push(resolve))});
    await startWithGps(h);h.watches[0].error({code:2});
    assert.equal(routeCalls(h)[0].options.signal.aborted,true);
    h.advance(16000);h.fix();await h.runTimers();
    assert.equal(routeCalls(h).length,2);
    pending[0]({ok:true,json:async()=>({data:routesFor("old")})});await settle();
    assert.equal(h.optionCalls.at(-1).busy,true,"finally da consulta cancelada não libera os controles da nova consulta");
    assert.equal(h.optionCalls.filter(call=>call.render).length,0);
    pending[1]({ok:true,json:async()=>({data:routesFor("new")})});await settle();
    assert.equal(h.updates.at(-1).rota.polyline,"new-0");assert.equal(h.optionCalls.at(-1).busy,false);
    assert.equal(h.watches.length,1);
});

test("selecionar alternativa é local, conserva GPS e cancela recálculo ainda enfileirado",async()=>{
    const route=routesFor();
    const h=harness({routeOptions:true,routeRequest:()=>({ok:true,json:async()=>({data:route})})});
    await startWithGps(h);const before=h.updates.at(-1);
    h.view({following:false,overview:false});h.recalculate();assert.equal(h.timers.size,1);
    h.select(route.alternativas[1]);
    const selected=h.updates.at(-1);
    assert.equal(routeCalls(h).length,1);assert.equal(h.timers.size,0);
    assert.equal(selected.rota.id,"rota-1");assert.equal(selected.rota.alternativas.length,2);
    assert.deepEqual(selected.rota.enderecoDestino,route.enderecoDestino);
    assert.equal(selected.latitude,before.latitude);assert.equal(selected.longitude,before.longitude);assert.equal(selected.atualizado_em,before.atualizado_em);
    assert.match(h.elements.gpsMovementStatus.textContent,/Mapa livre/);
    assert.equal(h.optionCalls.findLast(call=>call.render).render.id,"rota-1");
});

test("falha da rota interrompe tentativas automáticas até ação explícita do usuário",async()=>{
    let count=0;
    const h=harness({routeOptions:true,routeRequest:()=>++count===1?{ok:true,json:async()=>({data:routesFor()})}:{ok:false,status:503,json:async()=>({message:"Sem rota disponível"})}});
    await startWithGps(h);h.advance(16000);h.fix();h.recalculate();await settle();
    assert.equal(routeCalls(h).length,2);
    for(let index=0;index<4;index++){h.advance(16000);h.fix();h.recalculate();await h.runTimers();}
    assert.equal(routeCalls(h).length,2,"Falha não cria consultas pagas repetidas por relógio ou GPS");
    assert.match(h.elements.routeStatus.textContent,/Atualizar rota/);
    await h.elements.refreshRoute.events.click();await settle();assert.equal(routeCalls(h).length,3);
});

test("erro GPS, ocultação e parar cancelam fila automática sem movimentar ou consultar depois",async()=>{
    for(const action of ["error","hide","stop"]){
        const h=harness({routeOptions:true,routeRequest:()=>({ok:true,json:async()=>({data:routesFor()})})});
        await startWithGps(h);h.recalculate();assert.equal(h.timers.size,1);
        if(action==="error")h.watches[0].error({code:2});
        else if(action==="hide"){h.context.document.hidden=true;h.documentEvents.visibilitychange();}
        else h.elements.stopGps.events.click();
        assert.equal(h.timers.size,0,action);h.advance(20000);await h.runTimers();h.recalculate();await settle();
        assert.equal(routeCalls(h).length,1,action);
        if(action!=="error")assert.ok(h.optionCalls.some(call=>call.clear),action);
    }
});

test("pedido de recálculo com GPS antigo espera outra leitura sem reiniciar o sensor",async()=>{
    const h=harness({routeOptions:true,routeRequest:()=>({ok:true,json:async()=>({data:routesFor()})})});
    await startWithGps(h);h.advance(20000);h.tick();h.recalculate();await settle();
    assert.equal(routeCalls(h).length,1);
    h.fix();h.recalculate();await settle();assert.equal(routeCalls(h).length,2);
    assert.equal(h.watches.length,1);
});

test("rota que chega com GPS vencido é descartada e outra leitura permite consultar novamente",async()=>{
    const pending=[];
    const h=harness({routeOptions:true,routeRequest:()=>new Promise(resolve=>pending.push(resolve))});
    await startWithGps(h);h.advance(20000);
    pending[0]({ok:true,json:async()=>({data:routesFor()})});await settle();
    assert.equal(h.optionCalls.filter(call=>call.render).length,0);
    h.fix();await settle();assert.equal(routeCalls(h).length,2);
    pending[1]({ok:true,json:async()=>({data:routesFor("fresh")})});await settle();
    assert.equal(h.updates.at(-1).rota.polyline,"fresh-0");
});

test("falha inicial ou resposta inválida não cria repetição automática nem sucesso de rota fictício",async()=>{
    for(const response of [{ok:false,status:503,json:async()=>({message:"Rota indisponível"})},{ok:true,json:async()=>({data:null})}]){
        const h=harness({routeOptions:true,routeRequest:()=>response});await startWithGps(h);
        assert.equal(routeCalls(h).length,1);assert.equal(h.optionCalls.filter(call=>call.render).length,0);
        h.watches[0].error({code:2});h.advance(16000);h.fix();h.recalculate();await h.runTimers();await settle();
        assert.equal(routeCalls(h).length,1,"Nem erro GPS seguido de leitura nova reativa uma consulta que falhou");
        await h.elements.refreshRoute.events.click();await settle();assert.equal(routeCalls(h).length,2,"Ação explícita permite nova tentativa");
    }
});
