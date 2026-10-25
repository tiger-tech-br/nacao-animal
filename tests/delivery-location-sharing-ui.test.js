"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {harness, response, address, settle} = require("./helpers/delivery-status-harness");
const share = (extra = {}) => ({url:"https://maps.app.goo.gl/TestShare42", atualizado_em:new Date(Date.now()-1000).toISOString(), expira_em:new Date(Date.now()+60000).toISOString(), ...extra});
const trip = compartilhamento => ({status:"SAIU_PARA_ENTREGA",endereco_entrega:address,compartilhamento});
const submit = async h => { h.elements.shareLocationForm.events.submit({preventDefault(){}}); await settle(); };

test("entregador compartilha link por ação explícita sem enviar a credencial privada a outro domínio", async () => {
    const value = share();
    const h = harness("driver",{responder:(url,options)=>response(url.endsWith("/viagem") ? trip(null) : {compartilhamento:value,changed:true,emailStatus:"sent"})});
    await settle(); assert.equal(h.elements.shareLocationSection.hidden,false);
    h.elements.sharedLocationUrl.value = "  "+value.url+"  "; await submit(h);
    assert.equal(h.calls.length,2);
    const request = h.calls[1];
    assert.equal(request.url,"/api/public/entregas/compartilhamento");
    assert.equal(request.options.method,"POST");
    assert.deepEqual(JSON.parse(request.options.body),{url:value.url});
    assert.equal(request.options.headers.Authorization,"Bearer "+"a".repeat(64));
    assert.equal(h.elements.driverSharedLocationOpen.href,value.url);
    assert.equal(h.elements.driverSharedLocation.hidden,false);
    assert.equal(h.elements.sharedLocationUrl.value,"");
    assert.match(h.elements.shareLocationStatus.textContent,/enviado por e-mail/);
});

for (const emailStatus of ["failed","pending","unchanged"]) test(`resultado ${emailStatus} não promete envio de e-mail`,async()=>{
    const h = harness("driver",{responder:url=>response(url.endsWith("/viagem")?trip(null):{compartilhamento:share(),emailStatus})});
    await settle();h.elements.sharedLocationUrl.value=share().url;await submit(h);
    assert.equal(h.elements.driverSharedLocation.hidden,false);
    assert.doesNotMatch(h.elements.shareLocationStatus.textContent,/enviado por e-mail/);
    assert.match(h.elements.shareLocationStatus.textContent,emailStatus==="failed"?/Não foi possível enviar/:emailStatus==="pending"?/processamento/:/já foi compartilhado/);
});

test("link externo ou esquema perigoso é rejeitado sem gravação",async()=>{
    const h=harness("driver");await settle();
    for(const input of ["javascript:alert(1)","https://maps.app.goo.gl.evil.invalid/abcde","https://example.invalid/location"]){
        h.elements.sharedLocationUrl.value=input;await submit(h);
        assert.equal(h.calls.length,1);assert.equal(h.elements.driverSharedLocationOpen.href,undefined);
        assert.match(h.elements.shareLocationStatus.textContent,/Cole somente/);
    }
});

test("envios concorrentes são deduplicados e ocultar a página descarta resposta tardia",async()=>{
    let finish;
    const h=harness("driver",{responder:url=>url.endsWith("/viagem")?response(trip(null)):new Promise(resolve=>finish=resolve)});
    await settle();h.elements.sharedLocationUrl.value=share().url;
    await submit(h);await submit(h);
    assert.equal(h.calls.length,2);assert.equal(h.elements.shareLocationSubmit.disabled,true);
    const signal=h.calls[1].options.signal;
    h.context.document.hidden=true;h.documentEvents.visibilitychange();
    assert.equal(signal.aborted,true);assert.equal(h.elements.sharedLocationUrl.value,"");
    finish(response({compartilhamento:share(),emailStatus:"sent"}));await settle();
    assert.equal(h.elements.driverSharedLocationOpen.href,undefined);
    assert.equal(h.elements.shareLocationSection.hidden,true);
    assert.equal(h.elements.shareLocationStatus.textContent,"");
});

test("retornar do Maps recarrega o compartilhamento que ficou salvo",async()=>{
    const value=share();const h=harness("driver",{data:trip(value)});await settle();
    assert.equal(h.elements.driverSharedLocationOpen.href,value.url);
    h.context.document.hidden=true;h.documentEvents.visibilitychange();
    assert.equal(h.elements.driverSharedLocationOpen.href,undefined);
    h.context.document.hidden=false;h.documentEvents.visibilitychange();await settle();
    assert.equal(h.calls.length,2);assert.equal(h.elements.driverSharedLocationOpen.href,value.url);
});

test("remover link chama apenas a API da loja e explica encerramento separado no Maps",async()=>{
    const h=harness("driver",{responder:url=>response(url.endsWith("/viagem")?trip(share()):{changed:true})});await settle();
    h.elements.removeLocationShare.events.click();await settle();
    assert.equal(h.calls[1].options.method,"DELETE");assert.equal(h.calls[1].options.body,undefined);
    assert.equal(h.elements.driverSharedLocationOpen.href,undefined);assert.equal(h.elements.driverSharedLocation.hidden,true);
    assert.match(h.elements.shareLocationStatus.textContent,/pare o compartilhamento também no Google Maps/);
});

test("erro 410 ao salvar limpa rota, link e formulário",async()=>{
    const h=harness("driver",{responder:url=>url.endsWith("/viagem")?response(trip(share())):response(null,410,"Entrega encerrada")});await settle();
    h.elements.sharedLocationUrl.value=share().url;await submit(h);
    assert.equal(h.elements.navigateGoogleMaps.href,undefined);assert.equal(h.elements.driverSharedLocationOpen.href,undefined);
    assert.equal(h.elements.shareLocationSection.hidden,true);assert.equal(h.elements.reloadDelivery.disabled,true);
    assert.match(h.elements.driverStatus.textContent,/Entrega encerrada/);
});

for(const admin of [false,true]) test(`acompanhamento ${admin?"administrativo":"público"} mostra link válido somente durante entrega`,async()=>{
    const value=share(),h=harness("tracking",{admin,data:trip(value)});await settle();
    assert.equal(h.elements.trackingLocationShare.hidden,false);assert.equal(h.elements.trackingLocationLink.href,value.url);
    assert.match(h.elements.trackingLocationUpdated.textContent,/Link fornecido pelo entregador em/);
    h.data({...trip(value),status:"ENTREGUE"});await h.tick();
    assert.equal(h.elements.trackingLocationShare.hidden,true);assert.equal(h.elements.trackingLocationLink.href,undefined);
});

for(const value of [null,share({url:"https://example.invalid/track"}),share({expira_em:new Date(Date.now()-1000).toISOString()}),share({expira_em:"invalid"})]) test("link ausente, externo ou expirado não aparece para o cliente",async()=>{
    const h=harness("tracking",{data:trip(value)});await settle();
    assert.equal(h.elements.trackingLocationShare.hidden,true);assert.equal(h.elements.trackingLocationLink.href,undefined);
    assert.equal(h.elements.trackingDetails.hidden,false);
});

test("logout limpa o link e impede abertura de dados da sessão anterior",async()=>{
    const h=harness("tracking",{data:trip(share())});await settle();
    h.token(null);h.documentEvents["petflow:customer-logout"]();
    assert.equal(h.elements.trackingLocationLink.href,undefined);assert.equal(h.elements.trackingLocationShare.hidden,true);
    let prevented=false;h.elements.trackingLocationLink.events.click({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
});

test("expiração entre consultas bloqueia clique sem aguardar outra resposta de rede",async()=>{
    const end=Date.now()+60000,value=share({expira_em:new Date(end).toISOString()}),h=harness("tracking",{data:trip(value)});await settle();
    class FutureDate extends Date {static now(){return end+1;}}
    h.context.Date=FutureDate;let prevented=false;
    h.elements.trackingLocationLink.events.click({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(h.elements.trackingLocationLink.href,undefined);
});
