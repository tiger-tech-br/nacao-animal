"use strict";
// Percursos inteiramente artificiais para testar a navegação sem sensor ou rede.
((root) => {
    const BASE = { latitude: 40.78, longitude: -73.97 };
    const METERS_LAT = 111195, METERS_LNG = METERS_LAT * Math.cos(BASE.latitude * Math.PI / 180);
    const rad = value => value * Math.PI / 180;
    const point = (east, north) => ({ latitude: BASE.latitude + north / METERS_LAT, longitude: BASE.longitude + east / METERS_LNG });
    const valid = value => Number.isFinite(value?.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value?.longitude) && Math.abs(value.longitude) <= 180;
    function distance(a, b) {
        const h = Math.sin(rad(b.latitude-a.latitude)/2)**2 + Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1-h)));
    }
    function bearing(a, b) {
        const lat1=rad(a.latitude), lat2=rad(b.latitude), delta=rad(b.longitude-a.longitude);
        return (Math.atan2(Math.sin(delta)*Math.cos(lat2), Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta))*180/Math.PI+360)%360;
    }
    function encode(points) {
        let latitude=0, longitude=0, encoded="";
        const part = input => {
            let value=input<0 ? ~(input<<1) : input<<1, result="";
            while(value>=32) { result+=String.fromCharCode((32|(value&31))+63); value>>=5; }
            return result+String.fromCharCode(value+63);
        };
        for(const current of points) {
            const lat=Math.round(current.latitude*1e5), lng=Math.round(current.longitude*1e5);
            encoded+=part(lat-latitude)+part(lng-longitude); latitude=lat; longitude=lng;
        }
        return encoded;
    }
    function maneuver(previous, current) {
        if(previous===null) return "STRAIGHT";
        const turn=(current-previous+540)%360-180;
        return Math.abs(turn)>150 ? "U_TURN_LEFT" : Math.abs(turn)<25 ? "STRAIGHT" : turn>0 ? "TURN_RIGHT" : "TURN_LEFT";
    }
    function routeFrom(points, speed=10) {
        const path=points.filter((item,index)=>index===0 || distance(points[index-1],item)>.05).map(item=>({...item}));
        if(path.length<2) throw new RangeError("O percurso simulado já chegou ao destino.");
        let previous=null;
        const etapas=path.slice(1).map((end,index)=>{
            const start=path[index], heading=bearing(start,end), manobra=maneuver(previous,heading);
            previous=heading;
            const turn=manobra==="U_TURN_LEFT" ? "Faça o retorno" : manobra==="TURN_LEFT" ? "Vire à esquerda" : manobra==="TURN_RIGHT" ? "Vire à direita" : "Siga em frente";
            const meters=Math.max(1,Math.round(distance(start,end)));
            return { instrucao:`${turn} no trecho ${index+1} do percurso simulado.`, manobra, polyline:encode([start,end]), distanciaMetros:meters, duracao:`${Math.max(1,Math.round(meters/speed))}s` };
        });
        return { tipoOrigem:"GPS_ENTREGADOR", origem:{...path[0]}, destino:{...path.at(-1)}, polyline:encode(path),
            distanciaMetros:etapas.reduce((total,step)=>total+step.distanciaMetros,0), duracao:`${etapas.reduce((total,step)=>total+parseFloat(step.duracao),0)}s`, calculadaEm:new Date().toISOString(), etapas };
    }
    function interpolate(points, spacing=10) {
        const samples=[{...points[0]}];
        for(let index=1;index<points.length;index++) {
            const a=points[index-1], b=points[index], count=Math.max(1,Math.round(distance(a,b)/spacing));
            for(let step=1;step<=count;step++) samples.push({ latitude:a.latitude+(b.latitude-a.latitude)*step/count, longitude:a.longitude+(b.longitude-a.longitude)*step/count });
        }
        return samples;
    }
    function framesFrom(points, { spacing=10, nullHeading=false, previous=null, firstLabel="Partida do percurso simulado" }={}) {
        return interpolate(points,spacing).map((position,index,all)=>{
            const prior=index ? all[index-1] : previous;
            const speed=prior ? distance(prior,position) : 0;
            return { type:"position", ...position, heading:nullHeading ? null : speed>.05 ? bearing(prior,position) : null,
                velocidade_mps:speed, precisao_m:nullHeading ? 1 : 4, label:index===0 ? firstLabel : "Posição artificial avançando no percurso" };
        });
    }
    const stopped = position => ({ type:"position", latitude:position.latitude, longitude:position.longitude, heading:null, velocidade_mps:0, precisao_m:position.precisao_m, label:"Parado no destino simulado" });
    function closestSegment(position,path) {
        const x=(position.longitude-BASE.longitude)*METERS_LNG, y=(position.latitude-BASE.latitude)*METERS_LAT;
        let best={index:0,offset:Infinity};
        for(let index=0;index<path.length-1;index++) {
            const a=path[index],b=path[index+1], ax=(a.longitude-BASE.longitude)*METERS_LNG,ay=(a.latitude-BASE.latitude)*METERS_LAT;
            const dx=(b.longitude-a.longitude)*METERS_LNG,dy=(b.latitude-a.latitude)*METERS_LAT;
            const fraction=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy || 1)));
            const offset=Math.hypot(x-ax-fraction*dx,y-ay-fraction*dy);
            if(offset<best.offset) best={index,offset};
        }
        return best;
    }
    function rerouter(path,speed=10) {
        const destination=path.at(-1);
        return position => {
            if(!valid(position)) throw new TypeError("Informe uma posição válida do percurso simulado.");
            const start={latitude:position.latitude,longitude:position.longitude};
            const nearest=closestSegment(start,path);
            const tail=nearest.offset<=15 ? path.slice(nearest.index+1)
                : [{latitude:start.latitude,longitude:destination.longitude},destination];
            return routeFrom([start,...tail],speed);
        };
    }
    const definitions=[
        { id:"curvas-chegada", title:"Curvas e chegada", description:"Percurso artificial com duas curvas, avanço, parada e chegada ao destino." },
        { id:"desvio-recalculo", title:"Desvio e recálculo", description:"Duas posições realmente fora da rota sintética acionam um novo trajeto até o mesmo destino." },
        { id:"sinal-parada-retomada", title:"Perda de sinal e retomada", description:"Parada, ausência de leituras por 16 segundos e retomada sem inventar posições durante a perda de sinal." },
        { id:"passos-curtos-retorno", title:"Passos curtos e retorno", description:"Passos artificiais menores que cinco metros, sem rumo nativo, com curva e retorno para testar a direção estimada." }
    ];
    function create(id) {
        const definition=definitions.find(item=>item.id===id);
        if(!definition) throw new RangeError("Percurso simulado não encontrado.");
        let path,frames,speed=10;
        if(id==="curvas-chegada") {
            path=[point(0,0),point(100,0),point(100,100),point(40,100)];
            frames=framesFrom(path); frames.push(stopped(frames.at(-1)));
        } else if(id==="desvio-recalculo") {
            path=[point(0,0),point(200,0),point(200,100)];
            const detour=[point(0,0),point(40,0),point(40,70)];
            frames=framesFrom(detour);
            frames[frames.length-2].label="Primeira posição mais de 50 m fora da rota";
            frames.at(-1).label="Segunda posição fora da rota: recalcular agora";
            const resumed=framesFrom([point(40,70),point(200,70),point(200,100)]);
            frames.push(...resumed.slice(1)); frames.push(stopped(frames.at(-1)));
        } else if(id==="sinal-parada-retomada") {
            path=[point(0,0),point(80,0),point(80,80)];
            const moving=framesFrom(path);
            const pause=stopped(moving[4]); pause.label="Parada com uma leitura nova e velocidade zero";
            frames=[...moving.slice(0,5),pause,
                {type:"hold",label:"Parado: conservar a última posição e o horário da leitura"},
                {type:"hold",label:"Parado: não criar outra leitura de GPS"},
                ...Array.from({length:16},(_,index)=>({type:"signal-loss",label:`Sem leitura GPS: segundo ${index+1} de 16`})),
                ...moving.slice(5)];
            frames.push(stopped(frames.at(-1)));
        } else {
            speed=2.5;
            path=[point(0,0),point(12,0),point(12,12),point(12,0),point(62,0)];
            frames=framesFrom(path,{spacing:2.5,nullHeading:true}); frames.push(stopped(frames.at(-1)));
        }
        return { ...definition, route:routeFrom(path,speed), frames, reroute:rerouter(path,speed) };
    }
    const api={ list:()=>definitions.map(item=>({...item})), create };
    if(typeof module!=="undefined" && module.exports) module.exports=api;
    else root.PetFlowDeliveryScenarios=api;
})(typeof window!=="undefined" ? window : globalThis);
