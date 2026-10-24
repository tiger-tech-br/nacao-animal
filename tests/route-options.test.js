"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("public/js/pages/delivery/route-options.js","utf8");
function harness({missing=false}={}) {
    const selections=[],document={hidden:false};
    function element(tag="div") {
        assert.ok(["div","button","strong","span"].includes(tag),`Elemento inesperado: ${tag}`);
        const node={tagName:tag.toUpperCase(),hidden:false,disabled:false,textContent:"",children:[],attributes:{},events:{},
            setAttribute(name,value){assert.ok(!["open","aria-modal","aria-haspopup"].includes(name),`Alternativas não abrem painel: ${name}`);this.attributes[name]=String(value);},
            appendChild(child){this.children.push(child);return child;},replaceChildren(...children){this.children=[...children];},
            querySelector(selector){return this.children.find(child=>child.className===selector.slice(1))||null;},
            addEventListener(name,fn){this.events[name]=fn;},focus(){assert.fail("Alternativas inline não deslocam o foco");}};
        Object.defineProperty(node,"innerHTML",{set(){assert.fail("Não monta HTML de dados do provedor");}});
        return node;
    }
    const ids=["routeAlternatives","routeOptionsStatus","routeWarnings"];
    const elements=Object.fromEntries(ids.map(id=>[id,element()]));
    document.getElementById=id=>{assert.ok(ids.includes(id),`Controle inesperado: ${id}`);return missing?null:elements[id];};document.createElement=element;
    document.addEventListener=()=>assert.fail("Alternativas inline não instalam listeners globais");
    Object.defineProperties(document,{body:{get(){assert.fail("Alternativas inline não alteram a página");}},activeElement:{get(){assert.fail("Alternativas inline não interceptam o teclado");}}});
    const context={document,console,addEventListener(){assert.fail("Alternativas inline não instalam listeners globais");}};context.window=context;
    Object.defineProperties(context,{fetch:{get(){assert.fail("Opções de rotas não fazem chamadas de rede");}},navigator:{get(){assert.fail("Opções de rotas não capturam GPS");}},sessionStorage:{get(){assert.fail("Opções não guardam rotas");}},localStorage:{get(){assert.fail("Opções não guardam rotas");}}});
    vm.runInNewContext(source,context);
    const api=context.PetFlowDeliveryRouteOptions({onSelect:route=>selections.push(route)});
    return {api,elements,document,selections};
}
const option=(id="rota-0",extra={})=>({id,resumo:`Opção ${id}`,polyline:id,distanciaMetros:1400,duracao:"180s",etapas:[],...extra});
const bundle=(extra={})=>({...option(),alternativas:[option(),option("rota-1"),option("rota-2")],...extra});

test("painel oferece somente alternativas de trajeto, sem escolha ou inferência de locomoção",()=>{
    const h=harness();
    assert.deepEqual(Object.keys(h.api).sort(),["clear","render","setBusy"]);
    h.api.render(bundle());assert.equal(h.elements.routeAlternatives.children.length,3);
    assert.doesNotMatch(h.elements.routeOptionsStatus.textContent,/carro|moto|bicicleta|transporte/i);
});

test("todas as alternativas disponíveis aparecem uma única vez com rota ativa e nomes seguros",()=>{
    const h=harness(),route=bundle();route.alternativas.push(option("rota-1"));route.alternativas[1].resumo="<img src=x onerror=alert(1)>";
    const before=JSON.stringify(route);Object.freeze(route);h.api.render(route);
    const buttons=h.elements.routeAlternatives.children;assert.equal(buttons.length,3);
    assert.equal(buttons[0].attributes["aria-pressed"],"true");assert.equal(buttons[1].attributes["aria-pressed"],"false");
    assert.equal(buttons[1].children[0].textContent,"<img src=x onerror=alert(1)>");
    assert.match(buttons[1].children[1].textContent,/1,4 km.*3 min/);
    assert.match(h.elements.routeOptionsStatus.textContent,/3 rotas disponíveis/);
    buttons[1].events.click();
    assert.equal(h.selections.length,1);assert.equal(h.selections[0],route.alternativas[1]);
    assert.equal(buttons[0].attributes["aria-pressed"],"false");assert.equal(buttons[1].attributes["aria-pressed"],"true");
    assert.equal(buttons[1].querySelector(".route-option-selection").textContent,"Em uso");
    assert.equal(JSON.stringify(route),before,"Componente não modifica etapas, GPS ou envelope do provedor");
});

test("carregamento impede seleção concorrente; nova renderização invalida cliques antigos",()=>{
    const h=harness();h.api.render(bundle());const old=h.elements.routeAlternatives.children[1];h.api.setBusy(true);
    assert.ok(h.elements.routeAlternatives.children.every(button=>button.disabled));
    old.events.click();assert.equal(h.selections.length,0);
    h.api.setBusy(false);h.api.render(bundle({alternativas:[option("rota-0"),option("rota-3")]}));
    old.events.click();assert.equal(h.selections.length,0,"Callback de uma rota substituída não seleciona a rota antiga");
    const newest=h.elements.routeAlternatives.children[1];h.api.clear();newest.events.click();
    assert.equal(h.selections.length,0);assert.equal(h.elements.routeAlternatives.children.length,0);
});

test("falha de atualização não deixa indicador de busca preso",()=>{
    const h=harness();h.api.render(bundle());const status=h.elements.routeOptionsStatus.textContent;
    h.api.setBusy(true);assert.match(h.elements.routeOptionsStatus.textContent,/Buscando/);h.api.setBusy(false);
    assert.equal(h.elements.routeOptionsStatus.textContent,status);
});

test("avisos gerais recebidos do provedor são exibidos como texto e removidos ao limpar",()=>{
    const h=harness();h.api.render(bundle({avisos:["Confira o trajeto.","Confira o trajeto.","<b>Trecho restrito</b>"]}));
    assert.equal(h.elements.routeWarnings.hidden,false);
    assert.equal(h.elements.routeWarnings.textContent,"Confira o trajeto. <b>Trecho restrito</b>");
    h.api.clear();assert.equal(h.elements.routeWarnings.hidden,true);assert.equal(h.elements.routeWarnings.textContent,"");
});

test("alternativas ficam inline sem abrir painel ou capturar foco e ignoram seleção enquanto página oculta",()=>{
    const h=harness();h.api.render(bundle());
    const button=h.elements.routeAlternatives.children[1];
    assert.equal(button.type,"button");assert.equal(button.attributes["aria-pressed"],"false");
    assert.equal(h.elements.routeAlternatives.attributes["aria-busy"],"false");
    h.document.hidden=true;button.events.click();assert.equal(h.selections.length,0);
    h.document.hidden=false;button.events.click();assert.equal(h.selections.length,1);
    button.events.click();assert.equal(h.selections.length,1,"Selecionar a rota ativa não repete a ação");
});

test("rota única, sem rota e documento sem controles mantêm mensagens honestas e fallback seguro",()=>{
    const h=harness();h.api.render(option());assert.equal(h.elements.routeAlternatives.children.length,1);assert.match(h.elements.routeOptionsStatus.textContent,/uma rota/);
    h.api.render(null);assert.equal(h.elements.routeAlternatives.children.length,0);assert.match(h.elements.routeOptionsStatus.textContent,/Nenhuma rota/);
    const missing=harness({missing:true});
    missing.api.render(bundle());missing.api.setBusy(true);missing.api.clear();
});
