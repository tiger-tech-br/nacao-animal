"use strict";
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
require.cache[require.resolve("../config/env")] = { exports: { JWT_SECRET: "test-route-secret" } };
const { calcularRota, calcularRotaDiagnostico, calcularRotaEntrega } = require("../services/entregaRotaService");
const initialFetch = global.fetch;
const initialKey = process.env.GOOGLE_MAPS_API_KEY, initialOrigin = process.env.DELIVERY_ORIGIN_ADDRESS;
afterEach(() => {
    global.fetch = initialFetch;
    if (initialKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = initialKey;
    if (initialOrigin === undefined) delete process.env.DELIVERY_ORIGIN_ADDRESS; else process.env.DELIVERY_ORIGIN_ADDRESS = initialOrigin;
});
const address = { endereco: "Rua do Cliente", numero: "20", bairro: "Centro", cidade: "Santo André", estado: "SP", cep: "09060700" };
const responseRoute = { distanceMeters: 1200, duration: "180s", polyline: { encodedPolyline: "test-route" }, legs: [{ startLocation: { latLng: { latitude: -23.66, longitude: -46.55 } }, endLocation: { latLng: { latitude: -23.67, longitude: -46.56 } }, steps: [{ distanceMeters: 500, staticDuration: "60s", polyline: { encodedPolyline: "step-route" }, startLocation: { latLng: { latitude: -23.66, longitude: -46.55 } }, endLocation: { latLng: { latitude: -23.665, longitude: -46.555 } }, navigationInstruction: { maneuver: "TURN_RIGHT", instructions: "Vire à direita" } }] }] };
test("rota usa GPS do entregador e mantém o endereço da loja apenas para o frete", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key"; process.env.DELIVERY_ORIGIN_ADDRESS = "Loja configurada, 100";
    global.fetch = async (url, options) => {
        const request = JSON.parse(options.body);
        assert.deepEqual(request.origin.location.latLng,{latitude:-23.66,longitude:-46.55});
        assert.match(request.destination.address,/Rua do Cliente, 20/);
        assert.equal(request.origin.address,undefined);
        assert.match(options.headers["X-Goog-FieldMask"],/startLocation/);
        assert.match(options.headers["X-Goog-FieldMask"],/navigationInstruction/);
        return { ok: true, json: async () => ({ routes: [responseRoute] }) };
    };
    const route = await calcularRota({latitude:-23.66,longitude:-46.55},address);
    assert.equal(route.tipoOrigem,"GPS_ENTREGADOR");
    assert.deepEqual(route.origem,responseRoute.legs[0].startLocation.latLng);
    assert.deepEqual(route.destino,responseRoute.legs[0].endLocation.latLng);
    assert.equal(route.etapas[0].instrucao,"Vire à direita");
    assert.equal(route.etapas[0].manobra,"TURN_RIGHT");
});
test("rota rejeita GPS inválido e resposta sem ponto de partida", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key"; process.env.DELIVERY_ORIGIN_ADDRESS = "Loja configurada, 100";
    global.fetch = async (url, options) => {
        assert.equal(JSON.parse(options.body).origin.location.latLng.latitude,-23.66);
        return { ok: true, json: async () => ({ routes: [{ ...responseRoute, legs: [{ endLocation: responseRoute.legs[0].endLocation }] }] }) };
    };
    await assert.rejects(calcularRota(null,address),e=>e.status === 409);
    await assert.rejects(calcularRota({latitude:91,longitude:0},address),e=>e.status === 409);
    await assert.rejects(calcularRota({latitude:-23.66,longitude:-46.55},address),e=>e.status === 503);
});

test("perfil interno original pede alternativas de alta qualidade sem opções de locomoção",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    global.fetch=async(_url,options)=>{
        const request=JSON.parse(options.body);
        assert.equal(request.travelMode,"DRIVE");assert.equal(request.computeAlternativeRoutes,true);
        assert.equal(request.routingPreference,"TRAFFIC_UNAWARE");assert.equal(request.polylineQuality,"HIGH_QUALITY");
        assert.equal(options.headers["X-Goog-FieldMask"].includes("transitDetails"),false);
        assert.match(request.destination.address,/Rua do Cliente, 20/);
        return{ok:true,json:async()=>({routes:[responseRoute]})};
    };
    const result=await calcularRota({latitude:-23.66,longitude:-46.55},address);
    assert.equal(result.modo,"DRIVE");assert.equal(result.alternativas.length,1);
    assert.equal(result.id,result.alternativas[0].id);assert.equal(result.principal,true);
    assert.deepEqual(result.avisos,[]);
});

test("posição parada ou campos de locomoção extras não inferem outro perfil de rota",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    let calls=0;
    global.fetch=async(_url,options)=>{
        calls++;assert.equal(JSON.parse(options.body).travelMode,"DRIVE");
        return{ok:true,json:async()=>({routes:[responseRoute]})};
    };
    assert.equal((await calcularRota({latitude:-23.66,longitude:-46.55,speed:0,modo:"WALK"},address)).modo,"DRIVE");
    assert.equal(calls,1);
});

test("perfil de diagnóstico a pé é escolhido somente pela chamada do servidor e mantém alternativas e avisos",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    const routes=Array.from({length:2},(_,index)=>({...structuredClone(responseRoute),
        warnings:["Confira a travessia indicada pelo provedor."],routeLabels:[index?"DEFAULT_ROUTE_ALTERNATE":"DEFAULT_ROUTE"]}));
    let calls=0;
    global.fetch=async(_url,options)=>{
        calls++;
        const request=JSON.parse(options.body);
        assert.equal(request.travelMode,"WALK");assert.equal(request.computeAlternativeRoutes,true);
        assert.equal(request.polylineQuality,"HIGH_QUALITY");
        assert.equal(Object.hasOwn(request,"routingPreference"),false);
        assert.equal(Object.hasOwn(request,"transitPreferences"),false);
        return{ok:true,json:async()=>({routes})};
    };
    const result=await calcularRotaDiagnostico({latitude:-23.66,longitude:-46.55,modo:"DRIVE",speed:25},address);
    assert.equal(calls,1);assert.equal(result.modo,"WALK");assert.equal(result.alternativas.length,2);
    for(const option of result.alternativas){
        assert.equal(option.modo,"WALK");assert.equal(option.calculadaEm,result.calculadaEm);
        assert.match(option.avisos[0],/a pé.*beta.*caminhos ou calçadas/);
        assert.equal(option.avisos[1],"Confira a travessia indicada pelo provedor.");
        assert.equal(option.etapas[0].modo,"WALK");
        assert.equal(Object.hasOwn(option,"alternativas"),false);
    }
});

test("diagnóstico a pé conserva validação de GPS e falha sanitizada sem mudar para carro",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    let calls=0;
    global.fetch=async(_url,options)=>{
        calls++;assert.equal(JSON.parse(options.body).travelMode,"WALK");
        return{ok:false,json:async()=>({error:{message:"private-provider-value"}})};
    };
    await assert.rejects(calcularRotaDiagnostico({latitude:91,longitude:0},address),error=>error.status===409);
    assert.equal(calls,0);
    await assert.rejects(calcularRotaDiagnostico({latitude:-23.66,longitude:-46.55},address),
        error=>error.status===503&&!error.message.includes("private-provider-value"));
    assert.equal(calls,1);
});

test("meio de transporte cadastrado determina perfil de entrega, alternativas e avisos sem inferir velocidade",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    const profiles={CARRO:"DRIVE",MOTO:"TWO_WHEELER",BICICLETA:"BICYCLE",A_PE:"WALK"};
    for(const [meio,mode] of Object.entries(profiles)){
        let calls=0;
        global.fetch=async(_url,options)=>{
            calls++;
            const request=JSON.parse(options.body);
            assert.equal(request.travelMode,mode);assert.equal(request.computeAlternativeRoutes,true);
            assert.equal(request.polylineQuality,"HIGH_QUALITY");
            assert.equal(request.routingPreference,["DRIVE","TWO_WHEELER"].includes(mode)?"TRAFFIC_UNAWARE":undefined);
            assert.equal(Object.hasOwn(request,"meioTransporte"),false);
            return{ok:true,json:async()=>({routes:[{...responseRoute,warnings:["Aviso do Google."]},responseRoute]})};
        };
        const result=await calcularRotaEntrega({latitude:-23.66,longitude:-46.55,speed:0,modo:"TRANSIT"},address,meio);
        assert.equal(calls,1);assert.equal(result.modo,mode);assert.equal(result.alternativas.length,2);
        for(const option of result.alternativas){
            assert.equal(option.modo,mode);assert.equal(option.calculadaEm,result.calculadaEm);
            if(mode==="DRIVE")assert.ok(!option.avisos.some(warning=>warning.includes("versão beta")));
            else assert.match(option.avisos[0],/versão beta.*calçadas/);
        }
        assert.ok(result.avisos.includes("Aviso do Google."));
    }
});

test("meio de transporte inválido não consulta Google nem recebe perfil padrão silenciosamente",async()=>{
    let calls=0;global.fetch=async()=>{calls++;throw new Error("Não deve consultar o provedor.");};
    for(const value of [undefined,null,"","carro","CARRO ","DRIVE","WALK","TRANSIT","__proto__","constructor",[],{},1])
        await assert.rejects(calcularRotaEntrega({latitude:-23.66,longitude:-46.55},address,value),error=>error.status===400);
    assert.equal(calls,0);
});

test("alternativas mantêm IDs do lote, selecionam a principal e não se repetem recursivamente",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    const routes=Array.from({length:5},(_,index)=>({...structuredClone(responseRoute),distanceMeters:1000+index*100,
        polyline:{encodedPolyline:`route-${index}`},description:`Pela via ${index+1}`,routeToken:"PRIVATE_ROUTE_TOKEN",
        routeLabels:[index===1?"DEFAULT_ROUTE":"DEFAULT_ROUTE_ALTERNATE"]}));
    global.fetch=async()=>({ok:true,json:async()=>({routes})});
    const result=await calcularRota({latitude:-23.66,longitude:-46.55},address);
    assert.equal(result.id,"rota-1");assert.equal(result.resumo,"Pela via 2");assert.equal(result.alternativas.length,4);
    assert.equal(result.alternativas[0].id,result.id);
    assert.deepEqual(result.alternativas.map(option=>option.id),["rota-1","rota-0","rota-2","rota-3"]);
    assert.equal(result.alternativas.filter(option=>option.principal).length,1);
    for(const option of result.alternativas){
        assert.equal(option.calculadaEm,result.calculadaEm);assert.equal(option.modo,"DRIVE");
        assert.equal(Object.hasOwn(option,"alternativas"),false);
        assert.deepEqual(option.destino,result.destino);
    }
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_ROUTE_TOKEN/);
});

test("alternativa inválida não remove uma rota válida nem aparece como escolha utilizável",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    global.fetch=async()=>({ok:true,json:async()=>({routes:[{...responseRoute,routeLabels:["DEFAULT_ROUTE"]},
        {...responseRoute,polyline:{encodedPolyline:"bad-route"},legs:[]} ]})});
    const result=await calcularRota({latitude:-23.66,longitude:-46.55},address);
    assert.equal(result.alternativas.length,1);assert.equal(result.id,"rota-0");
    assert.equal(result.polyline,responseRoute.polyline.encodedPolyline);
});

test("metadados de transferência do provedor conservam embarque e desembarque sem expor seleção de transporte",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    const raw=structuredClone(responseRoute),step=raw.legs[0].steps[0];
    delete step.navigationInstruction;step.travelMode="TRANSIT";
    step.transitDetails={headsign:"Terminal Central",transitLine:{nameShort:"10",name:"Linha Dez",vehicle:{type:"BUS"}},
        stopDetails:{departureStop:{name:"Estação Norte"},arrivalStop:{name:"Praça Central"},
            departureTime:"2026-10-24T17:00:00Z",arrivalTime:"2026-10-24T17:10:00Z"}};
    global.fetch=async()=>({ok:true,json:async()=>({routes:[raw]})});
    const result=await calcularRota({latitude:-23.66,longitude:-46.55},address);
    assert.equal(result.etapas[0].modo,"TRANSIT");
    assert.deepEqual(result.etapas[0].transporte,{linha:"10",embarque:"Estação Norte",desembarque:"Praça Central",
        letreiro:"Terminal Central",veiculo:"BUS",partida:"2026-10-24T17:00:00.000Z",chegada:"2026-10-24T17:10:00.000Z"});
    assert.match(result.etapas[0].instrucao,/linha 10.*Estação Norte.*Praça Central/);
});

test("falha do provedor não repete chamadas nem expõe diagnóstico bruto",async()=>{
    process.env.GOOGLE_MAPS_API_KEY="test-key";
    for(const payload of [{routes:[]},{error:{message:"private-server-value latitude=-23.66"}}]){
        let calls=0;
        global.fetch=async(_url,options)=>{
            calls++;assert.equal(JSON.parse(options.body).travelMode,"DRIVE");
            return{ok:!payload.error,json:async()=>payload};
        };
        await assert.rejects(calcularRota({latitude:-23.66,longitude:-46.55},address),
            error=>error.status===503&&!/private-server-value|-23\.66/.test(error.message));
        assert.equal(calls,1);
    }
});
