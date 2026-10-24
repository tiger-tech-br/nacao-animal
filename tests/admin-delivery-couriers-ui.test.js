"use strict";
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('public/js/pages/admin/admin-page.js','utf8');
const instrumented=source.replace(/\}\)\(\);\s*$/, `
    window.__deliveryTest={renderSaleDetails,renderSaleEmptyState,ensureAdminMenuLinks,
        selectSale(id){selectedSaleId=id;++saleDetailsRevision;}};
})();`);
const orderA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', orderB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const link=digit=>`https://example.test/entregador#${digit.repeat(64)}`;
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return{promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function element(){const events=new Map();return{value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,dataset:{},attributes:{},focused:0,selected:0,
    setAttribute(name,value){this.attributes[name]=String(value);},removeAttribute(name){delete this.attributes[name];delete this[name];},
    focus(){this.focused++;},select(){this.selected++;},querySelector(){return null;},querySelectorAll(){return[];},
    addEventListener(name,callback){const listeners=events.get(name)||[];listeners.push(callback);events.set(name,listeners);},
    async dispatch(name){for(const callback of events.get(name)||[])await callback({currentTarget:this,target:this,preventDefault(){}});}};}
function harness({post=()=>({data:{url:link('a')}}),clipboard,share}={}){
    const form=element();let markup='',children={};
    Object.defineProperty(form,'innerHTML',{get(){return markup;},set(value){markup=value;children=Object.fromEntries([...value.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,element()]));for(const id of ['driverLink','driverLinkActions'])if(children[id])children[id].hidden=true;}});
    form.querySelector=selector=>selector[0]==='#'?children[selector.slice(1)]||null:null;
    const elements={recordForm:form,formTitle:element()},gets=[],posts=[],copies=[],shares=[];
    const document={addEventListener(){},getElementById:id=>elements[id]||null,querySelector(){return null;},querySelectorAll(){return[];},createElement:element};
    const window={PetFlowAdminPage:{key:'vendas',endpoint:'/vendas',columns:[]}};
    vm.runInNewContext(instrumented,{window,document,Date,URL,
        apiGet(path){gets.push(path);assert.fail('O link direto não consulta cadastros ou vínculos prévios');},
        apiPost(path,body){posts.push({path,body:JSON.parse(JSON.stringify(body))});return Promise.resolve().then(()=>post(path,body));},
        navigator:{clipboard:{writeText(url){copies.push(url);return clipboard?clipboard(url):Promise.resolve();}},...(share?{share(value){shares.push(value);return share(value);}}:{})}});
    const hooks=window.__deliveryTest;
    return{hooks,form,gets,posts,copies,shares,child:id=>children[id],
        open(id=orderA,extra={}){hooks.selectSale(id);hooks.renderSaleDetails(form,{id,status:'SAIU_PARA_ENTREGA',cliente:{},itens:[],...extra});},
        close(){hooks.renderSaleEmptyState(form);}};
}

test('pedido mantém geração direta de link sem cadastro, escolha de entregador ou transporte',async()=>{
    const h=harness();h.open();await settle();
    assert.equal(h.child('createDriverLink').disabled,false);assert.deepEqual(h.gets,[]);
    assert.doesNotMatch(h.form.innerHTML,/deliveryCourier|reloadDeliveryCouriers|Gerenciar entregadores|meio_transporte|entregadorId/);
    await h.child('createDriverLink').dispatch('click');
    assert.deepEqual(h.posts,[{path:`/vendas/${orderA}/rastreamento`,body:{}}]);
    assert.equal(h.child('driverLink').value,link('a'));assert.equal(h.child('openDriverLink').href,link('a'));
    assert.equal(h.child('driverLinkActions').hidden,false);
});

test('menu não inclui cadastro de entregadores nem cria novo atalho de GPS',()=>{
    const h=harness(),links=[];
    const nav={querySelector(selector){const key=/data-active-page="([^"]+)"/.exec(selector)?.[1];return links.find(item=>item.dataset.activePage===key)||null;},appendChild(item){links.push(item);}};
    const sidebar={querySelector:()=>nav};h.hooks.ensureAdminMenuLinks(sidebar);h.hooks.ensureAdminMenuLinks(sidebar);
    assert.equal(new Set(links.map(item=>item.href)).size,links.length);
    assert.ok(links.every(item=>!item.href.includes('entregadores')&&item.href!=='/admin/testar-gps'));
    assert.doesNotMatch(fs.readFileSync('admin/pages/dashboard/dashboard.html','utf8'),/href="\/admin\/pages\/entregadores\//);
});

test('pedido fora de entrega não mostra ações GPS nem consulta a API de rastreamento',()=>{
    const h=harness();h.open(orderA,{status:'EM_SEPARACAO'});
    assert.equal(h.child('createDriverLink'),undefined);assert.deepEqual(h.gets,[]);assert.deepEqual(h.posts,[]);
});

test('envio duplicado cria um link e bloqueia ações enquanto aguarda',async()=>{
    const pending=deferred(),h=harness({post:()=>pending.promise});h.open();
    const creating=h.child('createDriverLink').dispatch('click');await settle();
    await h.child('createDriverLink').dispatch('click');await h.child('copyDriverLink').dispatch('click');
    assert.equal(h.posts.length,1);assert.equal(h.child('createDriverLink').disabled,true);assert.deepEqual(h.copies,[]);
    pending.resolve({data:{url:link('a')}});await creating;assert.equal(h.child('createDriverLink').disabled,false);
});

test('gerar novamente limpa URL, cópia e abertura anteriores até receber o novo link',async()=>{
    const pending=deferred();let calls=0;const h=harness({post:()=>++calls===1?{data:{url:link('a')}}:pending.promise});h.open();
    await h.child('createDriverLink').dispatch('click');await h.child('copyDriverLink').dispatch('click');
    const creating=h.child('createDriverLink').dispatch('click');await settle();
    assert.equal(h.child('driverLink').value,'');assert.equal(h.child('driverLinkActions').hidden,true);assert.equal(h.child('openDriverLink').href,undefined);
    await h.child('copyDriverLink').dispatch('click');await h.child('shareDriverLink').dispatch('click');assert.deepEqual(h.copies,[link('a')]);
    pending.resolve({data:{url:link('b')}});await creating;assert.equal(h.child('driverLink').value,link('b'));
});

for(const bad of ['erro','url inválida'])test(`falha de criação com ${bad} não deixa link anterior disponível e permite tentar de novo`,async()=>{
    let fail=false;const h=harness({post(){if(fail){if(bad==='erro')throw Error('Falha controlada');return{data:{url:'javascript:alert(1)'}};}return{data:{url:link('a')}};}});h.open();
    await h.child('createDriverLink').dispatch('click');fail=true;await h.child('createDriverLink').dispatch('click');
    assert.equal(h.child('driverLink').value,'');assert.equal(h.child('driverLinkActions').hidden,true);assert.equal(h.child('openDriverLink').href,undefined);
    assert.equal(h.child('createDriverLink').disabled,false);assert.match(h.child('driverLinkStatus').textContent,/Tente novamente/);
    fail=false;await h.child('createDriverLink').dispatch('click');assert.equal(h.posts.length,3);
});

for(const transition of ['trocar','fechar'])for(const failure of [false,true])test(`${transition} detalhes descarta ${failure?'erro':'sucesso'} atrasado da criação`,async()=>{
    const pending=deferred(),h=harness({post:()=>pending.promise});h.open();const creating=h.child('createDriverLink').dispatch('click');await settle();
    if(transition==='trocar')h.open(orderB);else h.close();const current=h.form.innerHTML;
    if(failure)pending.reject(Error('Resposta antiga'));else pending.resolve({data:{url:link('a')}});await creating;
    assert.equal(h.form.innerHTML,current);assert.equal(h.child('driverLink')?.value||'','');assert.deepEqual(h.copies,[]);
    if(transition==='trocar')assert.equal(h.child('createDriverLink').disabled,false);
});

test('cópia atrasada não troca a mensagem de um novo link',async()=>{
    const pending=deferred();let calls=0;const h=harness({clipboard:()=>pending.promise,post:()=>({data:{url:link(++calls===1?'a':'b')}})});h.open();
    await h.child('createDriverLink').dispatch('click');const copying=h.child('copyDriverLink').dispatch('click');await settle();
    await h.child('createDriverLink').dispatch('click');const message=h.child('driverLinkStatus').textContent;pending.resolve();await copying;
    assert.equal(h.child('driverLinkStatus').textContent,message);assert.equal(h.child('driverLink').value,link('b'));
});

test('falha tardia de compartilhar link anterior não copia o link novo',async()=>{
    const pending=deferred();let calls=0;const h=harness({share:()=>pending.promise,post:()=>({data:{url:link(++calls===1?'a':'b')}})});h.open();
    await h.child('createDriverLink').dispatch('click');const sharing=h.child('shareDriverLink').dispatch('click');await settle();
    await h.child('createDriverLink').dispatch('click');pending.reject(Error('Indisponível'));await sharing;
    assert.deepEqual(h.copies,[]);assert.equal(h.shares[0].url,link('a'));assert.equal(h.child('driverLink').value,link('b'));
});

test('compartilhamento indisponível oferece cópia somente do vínculo ainda atual',async()=>{
    const h=harness({share:()=>Promise.reject(Error('Indisponível'))});h.open();await h.child('createDriverLink').dispatch('click');
    await h.child('shareDriverLink').dispatch('click');assert.deepEqual(h.copies,[link('a')]);
});

test('cancelar compartilhamento não copia o link',async()=>{
    const h=harness({share:()=>Promise.reject(Object.assign(Error('Cancelado'),{name:'AbortError'}))});h.open();await h.child('createDriverLink').dispatch('click');
    await h.child('shareDriverLink').dispatch('click');assert.deepEqual(h.copies,[]);
});
