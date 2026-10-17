"use strict";
// O progresso vem da projeção do GPS sobre o trajeto, nunca de uma animação ou do relógio.
((root) => {
    const validPoint = p => Number.isFinite(p?.latitude) && Math.abs(p.latitude)<=90 && Number.isFinite(p?.longitude) && Math.abs(p.longitude)<=180;
    const rad = value => value * Math.PI / 180;
    function distance(a,b) {
        const h=Math.sin(rad(b.latitude-a.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
        return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
    }
    function decode(encoded) {
        if (typeof encoded!=="string" || encoded.length>200000) throw new Error("Trajeto inválido");
        let index=0,lat=0,lng=0;const points=[];
        function value() {
            let result=0,shift=0,byte;
            do { if(index>=encoded.length || shift>30) throw new Error("Polyline incompleta"); byte=encoded.charCodeAt(index++)-63;if(byte<0 || byte>63) throw new Error("Polyline inválida");result|=(byte&31)<<shift;shift+=5; } while(byte>=32);
            return result&1 ? ~(result>>1) : result>>1;
        }
        while(index<encoded.length) {
            lat+=value();lng+=value();const point={latitude:lat/1e5,longitude:lng/1e5};
            if(!validPoint(point)) throw new Error("Coordenada inválida");points.push(point);
        }
        return points;
    }
    const seconds = value => typeof value==="string" && /^\d+(?:\.\d+)?s$/.test(value) ? parseFloat(value) : null;
    function project(point,a,b) {
        const scale=Math.cos(rad(point.latitude)),factor=6371000*Math.PI/180;
        const ax=(a.longitude-point.longitude)*scale*factor,ay=(a.latitude-point.latitude)*factor;
        const dx=(b.longitude-a.longitude)*scale*factor,dy=(b.latitude-a.latitude)*factor;
        const fraction=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy || 1)));
        return {fraction,offset:Math.hypot(ax+fraction*dx,ay+fraction*dy)};
    }
    function create(route) {
        if(route?.tipoOrigem!=="GPS_ENTREGADOR" || !Array.isArray(route.etapas) || !route.etapas.length || !validPoint(route.destino)) return null;
        const steps=[],segments=[];let total=0;
        try {
            for(const item of route.etapas) {
                const path=decode(item.polyline),lengths=path.slice(1).map((p,i)=>distance(path[i],p)),geometryLength=lengths.reduce((a,b)=>a+b,0);
                if(path.length<2 || geometryLength===0 || !item.instrucao) return null;
                const meters=Number.isFinite(item.distanciaMetros) && item.distanciaMetros>0 ? item.distanciaMetros : geometryLength;
                const step={...item,start:total,end:total+meters,meters,seconds:seconds(item.duracao)};
                let walked=0;
                lengths.forEach((length,i)=>{segments.push({a:path[i],b:path[i+1],start:total+walked/geometryLength*meters,length:length/geometryLength*meters,index:steps.length});walked+=length;});
                steps.push(step);total+=meters;
            }
        } catch { return null; }
        let progress=0,initialized=false,lastFix,lastTime,lastPosition,offRouteFixes=0;
        return {
            update(position,now=Date.now()) {
                const time=new Date(position.atualizado_em).getTime();
                if(!validPoint(position) || !Number.isFinite(time) || now-time>15000 || time-now>5000) return {state:"stale"};
                if(!Number.isFinite(position.precisao_m) || position.precisao_m>50 || position.precisao_m<0) return {state:"imprecise"};
                const elapsed=lastTime ? Math.max(0,(time-lastTime)/1000) : 0;
                const maxAdvance=Math.max(150,elapsed*Math.max(10,position.velocidade_mps || 0)+position.precisao_m*2);
                let match;
                for(const segment of segments) {
                    const candidate=project(position,segment.a,segment.b),at=segment.start+segment.length*candidate.fraction;
                    if(initialized && (at<progress-25 || at>progress+maxAdvance)) continue;
                    // Em cruzamentos repetidos, preferir o segmento próximo do progresso conhecido.
                    const score=candidate.offset+(initialized ? Math.abs(at-progress)*.01 : at*.00001);
                    if(!match || score<match.score) match={...candidate,at,index:segment.index,score};
                }
                if(!match || match.offset>Math.max(50,position.precisao_m*2)) {
                    if(lastFix!==position.atualizado_em) {offRouteFixes++;lastFix=position.atualizado_em;}
                    return {state:"off-route",recalculate:offRouteFixes>=2};
                }
                const estimatedSpeed=lastPosition && lastTime && time>lastTime ? distance(lastPosition,position)/((time-lastTime)/1000) : null;
                offRouteFixes=0;lastFix=position.atualizado_em;lastTime=time;lastPosition={latitude:position.latitude,longitude:position.longitude};initialized=true;
                progress=Math.max(progress,match.at);
                let index=steps.findIndex(step=>step.end>progress+.5);if(index<0) index=steps.length-1;
                const current=steps[index],remainingInStep=Math.max(0,current.end-progress);
                const remainingMeters=Math.max(0,total-progress);
                let remainingSeconds;
                if(steps.every(step=>step.seconds!==null)) remainingSeconds=current.seconds*remainingInStep/current.meters+steps.slice(index+1).reduce((sum,step)=>sum+step.seconds,0);
                else remainingSeconds=seconds(route.duracao)===null ? null : seconds(route.duracao)*remainingMeters/total;
                return {state:remainingMeters<40 && distance(position,route.destino)<Math.max(25,position.precisao_m) ? "arrived" : "navigating",
                    index,current,next:steps[index+1],afterNext:steps[index+2],toNextMeters:remainingInStep,remainingMeters,remainingSeconds,
                    speedKmh:Math.round(Math.max(0,Number.isFinite(position.velocidade_mps) && position.velocidade_mps>=0 ? position.velocidade_mps : estimatedSpeed || 0)*3.6)};
            }
        };
    }
    const api={create,decode,distance};
    if(typeof module!=="undefined" && module.exports) module.exports=api;
    else root.PetFlowNavigationEngine=api;
})(typeof window!=="undefined" ? window : globalThis);
