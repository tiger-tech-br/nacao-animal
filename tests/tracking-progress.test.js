"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {harness,response,address,settle}=require("./helpers/delivery-status-harness");

test("pedido avança conforme status do servidor e nunca a partir de GPS ou passagem do tempo",async()=>{
    const h=harness("tracking");await settle();
    assert.equal(h.elements.trackingHeadline.textContent,"Saiu para entrega");
    h.data({status:"EM_SEPARACAO",endereco_entrega:address,latitude:200,rota:{duracao:"0s"}});
    await h.tick();assert.equal(h.elements.trackingHeadline.textContent,"Preparando pedido");
    assert.equal(h.delay(),15000);
    await h.tick();assert.equal(h.elements.trackingHeadline.textContent,"Preparando pedido");
    h.data({status:"ENTREGUE",endereco_entrega:address});await h.tick();
    assert.equal(h.elements.trackingHeadline.textContent,"Entregue");
    const count=h.calls.length;await h.tick();assert.equal(h.calls.length,count);
});

for(const [status,label] of Object.entries({AGUARDANDO_PAGAMENTO:"Aguardando pagamento",PAGAMENTO_APROVADO:"Pagamento aprovado",EM_SEPARACAO:"Preparando pedido",SAIU_PARA_ENTREGA:"Saiu para entrega",ENTREGUE:"Entregue",FINALIZADA:"Finalizado",CANCELADA:"Cancelado"})){
    test(`status ${status} é apresentado com texto claro`,async()=>{
        const h=harness("tracking",{data:{status,endereco_entrega:address}});await settle();
        assert.equal(h.elements.trackingHeadline.textContent,label);
        assert.equal(h.elements.trackingDetails.hidden,false);
        assert.match(h.elements.trackingUpdated.textContent,/Status consultado em/);
        if(["ENTREGUE","FINALIZADA","CANCELADA"].includes(status)){
            assert.equal(h.elements.refreshTracking.disabled,true);
            const count=h.calls.length;await h.tick();assert.equal(h.calls.length,count);
        }
    });
}
test("cancelamento encerra acompanhamento e troca de conta permite consultar outro estado",async()=>{
    const h=harness("tracking",{data:{status:"CANCELADA"}});await settle();
    assert.equal(h.elements.trackingHeadline.textContent,"Cancelado");
    h.token("outra-conta");h.data({status:"SAIU_PARA_ENTREGA"});await h.tick();
    assert.equal(h.elements.trackingHeadline.textContent,"Saiu para entrega");
    assert.equal(h.elements.refreshTracking.disabled,false);
});
test("falha de rede não mostra status anterior como confirmado e recupera na próxima consulta",async()=>{
    let fail=false;
    const h=harness("tracking",{responder:()=>fail?Promise.reject(Error("Sem conexão")):response({status:"SAIU_PARA_ENTREGA",endereco_entrega:address})});
    await settle();fail=true;await h.tick();
    assert.equal(h.elements.trackingDetails.hidden,true);
    assert.match(h.elements.trackingStatus.textContent,/status atual não pôde ser confirmado/);
    fail=false;await h.elements.refreshTracking.events.click();
    assert.equal(h.elements.trackingDetails.hidden,false);
});
for(const code of [401,403,404])test(`consulta recusada ${code} apaga endereço e estado anteriores`,async()=>{
    let deny=false;
    const h=harness("tracking",{responder:()=>deny?response(null,code,"Acesso recusado"):response({status:"SAIU_PARA_ENTREGA",endereco_entrega:address})});
    await settle();deny=true;await h.tick();
    assert.equal(h.elements.destinationAddress.textContent,"");
    assert.equal(h.elements.trackingDetails.hidden,true);
    assert.equal(h.elements.trackingLogin.hidden,code===404);
});
for(const status of ["DESCONHECIDO","toString","__proto__",null])test("status inválido não cria confirmação nem interpretação de conteúdo",async()=>{
    const h=harness("tracking",{data:{status,endereco_entrega:address}});await settle();
    assert.equal(h.elements.trackingDetails.hidden,true);
    assert.match(h.elements.trackingStatus.textContent,/não foi possível confirmar/i);
});
test("endereço é texto literal e não depende de dados GPS",async()=>{
    const h=harness("tracking",{data:{status:"SAIU_PARA_ENTREGA",endereco_entrega:{...address,complemento:"<script>alert(1)</script>"}}});await settle();
    assert.match(h.elements.destinationAddress.textContent,/<script>/);
    assert.equal(h.elements.trackingHeadline.textContent,"Saiu para entrega");
});
test("atualizações simultâneas não duplicam consulta pendente",async()=>{
    let finish;
    const h=harness("tracking",{responder:()=>new Promise(resolve=>finish=resolve)});
    await h.tick();await h.elements.refreshTracking.events.click();
    assert.equal(h.calls.length,1);
    finish(response({status:"EM_SEPARACAO"}));await settle();
    assert.equal(h.elements.trackingHeadline.textContent,"Preparando pedido");
});
