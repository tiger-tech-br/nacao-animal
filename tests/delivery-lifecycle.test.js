"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {harness, response, address, settle} = require("./helpers/delivery-status-harness");

test("entregador recebe endereço congelado no pedido e link externo sem GPS, APIs de mapa ou token", async () => {
    const h = harness("driver"); await settle();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, "/api/public/entregas/viagem");
    assert.equal(h.calls[0].options.headers.Authorization, "Bearer " + "a".repeat(64));
    assert.equal(h.calls[0].options.cache, "no-store");
    assert.equal(h.elements.driverDetails.hidden, false);
    assert.match(h.elements.destinationAddress.textContent, /Casa 2/);
    const url = new URL(h.elements.navigateGoogleMaps.href);
    assert.equal(url.origin, "https://www.google.com");
    assert.equal(url.pathname, "/maps/dir/");
    assert.equal(url.searchParams.get("api"), "1");
    assert.equal(url.searchParams.get("travelmode"), "driving");
    assert.equal(url.searchParams.get("dir_action"), "navigate");
    assert.equal(url.searchParams.get("destination"), "Rua de teste & referência, 123, Bairro de teste, Santo André, SP, 09000000, Brasil");
    assert.equal(url.searchParams.has("origin"), false, "Maps usa a localização atual do aparelho");
    assert.doesNotMatch(url.href, /aaaaaaaa|pedido-teste|Bearer|key=/);
    assert.equal(url.hash, "");
    assert.equal(h.elements.navigateGoogleMaps.hidden, false);
});

test("link malformado não consulta o servidor nem oferece navegação", async () => {
    const h = harness("driver", {hash:"#invalido"}); await settle();
    assert.equal(h.calls.length, 0);
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.equal(h.elements.reloadDelivery.disabled, true);
    assert.match(h.elements.driverStatus.textContent, /Link inválido/);
});

for (const code of [401, 403, 410]) test(`link de entrega recusado com ${code} não expõe endereço nem navegação`, async () => {
    const h = harness("driver", {responder:()=>response(null,code,"Link encerrado")}); await settle();
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.equal(h.elements.driverDetails.hidden, true);
    assert.equal(h.elements.reloadDelivery.disabled, true);
    assert.match(h.elements.driverStatus.textContent,/Link encerrado/);
});

test("entrega fora de andamento não oferece rota", async () => {
    const h = harness("driver", {data:{status:"ENTREGUE",endereco_entrega:address}}); await settle();
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.match(h.elements.driverStatus.textContent,/não está em andamento/);
});

for (const bad of [null,{}, {endereco:"Rua",numero:"1",cidade:"",estado:"SP"}]) test("endereço incompleto bloqueia rota em vez de enviar destino parcial", async () => {
    const h = harness("driver", {data:{status:"SAIU_PARA_ENTREGA",endereco_entrega:bad}}); await settle();
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.match(h.elements.driverStatus.textContent,/endereço.*incompleto/);
    assert.equal(h.elements.reloadDelivery.disabled, false);
});

test("texto especial não interpreta HTML nem modifica o domínio do Maps", async () => {
    const hostile = {...address,endereco:'<img src=x onerror=alert(1)> & # ? https://example.test'};
    const h = harness("driver", {data:{status:"SAIU_PARA_ENTREGA",endereco_entrega:hostile}}); await settle();
    assert.match(h.elements.destinationAddress.textContent, /<img/);
    const url = new URL(h.elements.navigateGoogleMaps.href);
    assert.equal(url.origin,"https://www.google.com");
    assert.ok(url.searchParams.get("destination").startsWith(hostile.endereco));
    assert.equal(url.hash,"");
});

test("falha de rede permite tentar novamente e não mantém rota antiga", async () => {
    let fail = false;
    const h = harness("driver", {responder:()=>fail ? Promise.reject(Error("Sem conexão")) : response({status:"SAIU_PARA_ENTREGA",endereco_entrega:address})});
    await settle(); assert.ok(h.elements.navigateGoogleMaps.href);
    fail = true; await h.elements.reloadDelivery.events.click();
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.equal(h.elements.reloadDelivery.disabled,false);
    fail = false; await h.elements.reloadDelivery.events.click();
    assert.ok(h.elements.navigateGoogleMaps.href);
});

test("sair para Maps limpa o link e voltar revalida entrega antes de oferecer nova rota", async () => {
    const h = harness("driver"); await settle();
    h.context.document.hidden = true; h.documentEvents.visibilitychange();
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    h.data({status:"ENTREGUE"});
    h.context.document.hidden = false; await h.documentEvents.visibilitychange(); await settle();
    assert.equal(h.elements.navigateGoogleMaps.href, undefined);
    assert.match(h.elements.driverStatus.textContent,/não está em andamento/);
});

test("resposta antiga após BFCache não recria destino nem sobrescreve a consulta atual", async () => {
    const pending = [];
    const h = harness("driver", {responder:()=>new Promise(resolve=>pending.push(resolve))});
    h.events.pagehide();
    assert.equal(h.calls[0].options.signal.aborted,true);
    h.events.pageshow();
    pending[1](response({status:"SAIU_PARA_ENTREGA",endereco_entrega:{...address,numero:"456"}})); await settle();
    const current = h.elements.navigateGoogleMaps.href;
    pending[0](response({status:"SAIU_PARA_ENTREGA",endereco_entrega:address})); await settle();
    assert.equal(h.elements.navigateGoogleMaps.href,current);
    assert.match(h.elements.destinationAddress.textContent,/456/);
});

test("cliente consulta somente o próprio pedido e oculta dados após logout", async () => {
    const h = harness("tracking"); await settle();
    assert.equal(h.calls[0].url,"/api/public/pedidos/pedido-teste/rastreamento");
    assert.equal(h.calls[0].options.headers.Authorization,"Bearer session");
    assert.equal(h.elements.trackingDetails.hidden,false);
    h.token(null); h.documentEvents["petflow:customer-logout"]();
    assert.equal(h.elements.trackingDetails.hidden,true);
    assert.equal(h.elements.destinationAddress.textContent,"");
    assert.equal(h.elements.trackingLogin.hidden,false);
});

test("resposta pendente depois do logout não mostra dados da conta anterior", async () => {
    let finish;
    const h = harness("tracking", {responder:()=>new Promise(resolve=>finish=resolve)});
    h.token(null); h.documentEvents["petflow:customer-logout"]();
    assert.equal(h.calls[0].options.signal.aborted,true);
    finish(response({status:"SAIU_PARA_ENTREGA",endereco_entrega:address})); await settle();
    assert.equal(h.elements.trackingDetails.hidden,true);
    assert.equal(h.elements.destinationAddress.textContent,"");
});

test("trocar conta cancela consulta anterior e descarta resposta atrasada", async () => {
    const pending = [];
    const h = harness("tracking", {responder:()=>new Promise(resolve=>pending.push(resolve))});
    h.token("outra-conta"); const second = h.tick();
    assert.equal(h.calls[0].options.signal.aborted,true);
    pending[1](response({status:"EM_SEPARACAO",endereco_entrega:{...address,numero:"456"}})); await second;
    pending[0](response({status:"SAIU_PARA_ENTREGA",endereco_entrega:address})); await settle();
    assert.match(h.elements.destinationAddress.textContent,/456/);
    assert.equal(h.elements.trackingHeadline.textContent,"Preparando pedido");
});

test("renovação da sessão pública é reconhecida pelo módulo central", async () => {
    const h = harness("tracking"); await settle();
    h.context.NacaoCustomerSession={getToken:()=>"credencial-renovada",isCurrent:value=>["session","credencial-renovada"].includes(value)};
    await h.tick();
    assert.equal(h.calls.at(-1).options.headers.Authorization,"Bearer credencial-renovada");
    assert.equal(h.elements.trackingDetails.hidden,false);
});

test("aba oculta cancela consulta e retorno consulta status novamente", async () => {
    const pending = [];
    const h = harness("tracking", {responder:()=>new Promise(resolve=>pending.push(resolve))});
    h.context.document.hidden=true; h.documentEvents.visibilitychange();
    assert.equal(h.calls[0].options.signal.aborted,true);
    h.context.document.hidden=false; h.documentEvents.visibilitychange();
    pending[0](response({status:"SAIU_PARA_ENTREGA",endereco_entrega:address}));
    pending[1](response({status:"ENTREGUE",endereco_entrega:address})); await settle();
    assert.equal(h.elements.trackingHeadline.textContent,"Entregue");
});

test("sem sessão administrativa não usa credencial de cliente", async () => {
    const h = harness("tracking", {admin:true,token:null}); await settle();
    assert.equal(h.calls.length,0);
    assert.equal(h.elements.trackingLogin.href,"/admin/index.html");
    assert.equal(h.elements.trackingDetails.hidden,true);
});

test("administrador consulta endpoint administrativo sem GPS nem localização própria", async () => {
    const h = harness("tracking", {admin:true}); await settle();
    assert.equal(h.calls[0].url,"/api/vendas/pedido-teste/rastreamento");
    assert.equal(h.elements.trackingBack.href,"/admin/pages/vendas/vendas.html?pedido=pedido-teste");
    assert.equal(h.elements.trackingHeadline.textContent,"Saiu para entrega");
});
