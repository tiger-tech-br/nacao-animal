"use strict";
// O progresso vem da projeção do GPS sobre o trajeto, nunca de uma animação ou do relógio.
((root) => {
    const validPoint = p => Number.isFinite(p?.latitude) && Math.abs(p.latitude)<=90 && Number.isFinite(p?.longitude) && Math.abs(p.longitude)<=180;
    const rad = value => value * Math.PI / 180;
    function distance(a,b) {
        const h=Math.sin(rad(b.latitude-a.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
        return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
    }
    function bearing(a,b) {
        const lat1=rad(a.latitude),lat2=rad(b.latitude),delta=rad(b.longitude-a.longitude);
        return (Math.atan2(Math.sin(delta)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta))*180/Math.PI+360)%360;
    }
    const angle=(a,b)=>Math.abs((a-b+540)%360-180);
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
        if(route?.tipoOrigem!=="GPS_ENTREGADOR" || !Array.isArray(route.etapas) || !validPoint(route.destino)) return null;
        const zeroRoute=route.distanciaMetros===0 && validPoint(route.origem) && distance(route.origem,route.destino)<=5;
        if(!route.etapas.length && !zeroRoute) return null;
        const steps=[],segments=[];let total=0;
        try {
            for(const [index,item] of route.etapas.entries()) {
                const path=item.polyline==null?[]:decode(item.polyline),lengths=path.slice(1).map((p,i)=>distance(path[i],p)),geometryLength=lengths.reduce((a,b)=>a+b,0);
                const terminalPoint=path.at(-1)||item.destino||(zeroRoute?route.destino:null);
                const previousEnd=segments.at(-1)?.b;
                // O Google pode incluir um último passo de chegada sem deslocamento.
                if(index===route.etapas.length-1 && (previousEnd || zeroRoute) && (item.distanciaMetros===undefined || item.distanciaMetros===0) && geometryLength===0 && validPoint(terminalPoint) && distance(terminalPoint,route.destino)<=5 && (!previousEnd || distance(previousEnd,route.destino)<=5)) continue;
                if(path.length<2 || geometryLength===0 || !item.instrucao) return null;
                const meters=Number.isFinite(item.distanciaMetros) && item.distanciaMetros>0 ? item.distanciaMetros : geometryLength;
                const step={...item,start:total,end:total+meters,meters,seconds:seconds(item.duracao)};
                let walked=0;
                lengths.forEach((length,i)=>{if(length>0)segments.push({a:path[i],b:path[i+1],bearing:bearing(path[i],path[i+1]),start:total+walked/geometryLength*meters,length:length/geometryLength*meters,index:steps.length});walked+=length;});
                steps.push(step);total+=meters;
            }
        } catch { return null; }
        let progress=0,initialized=false,lastFix,lastTime,lastPosition,previousSensorPosition,offRouteFixes=0,lastSensorTime=-Infinity,lastResult;
        return {
            update(position,now=Date.now()) {
                const time=new Date(position.atualizado_em).getTime();
                if(!validPoint(position) || !Number.isFinite(time) || now-time>15000 || time-now>5000) return {state:"stale"};
                // O mesmo fix e respostas fora de ordem não avançam manobras nem contam como outro desvio.
                if(time<=lastSensorTime && lastResult) return lastResult;
                lastSensorTime=time;
                const remember=result=>{lastResult=result;return result;};
                if(!Number.isFinite(position.precisao_m) || position.precisao_m>50 || position.precisao_m<0) return remember({state:"imprecise"});
                if(!segments.length) {
                    if(distance(position,route.destino)<=Math.max(25,position.precisao_m)) {offRouteFixes=0;return remember({state:"arrived",remainingMeters:0,remainingSeconds:0,speedKmh:Number.isFinite(position.velocidade_mps)&&position.velocidade_mps>=0?Math.round(position.velocidade_mps*3.6):0});}
                    return remember({state:"off-route",recalculate:++offRouteFixes>=2});
                }
                const elapsed=lastTime ? Math.max(0,(time-lastTime)/1000) : 0;
                const moved=previousSensorPosition?distance(previousSensorPosition,position):0;
                const hasMovement=previousSensorPosition && moved>=Math.max(5,position.precisao_m*2);
                const heading=Number.isFinite(position.heading) && position.heading>=0 && position.heading<360 && position.velocidade_mps>=2 ? position.heading
                    : hasMovement ? bearing(previousSensorPosition,position) : null;
                if(!previousSensorPosition || hasMovement) previousSensorPosition={latitude:position.latitude,longitude:position.longitude};
                const maxAdvance=Math.max(50,elapsed*Math.max(10,position.velocidade_mps || 0)+position.precisao_m*2,lastPosition?distance(lastPosition,position)*2+position.precisao_m*2:0);
                const calculatedAt=new Date(route.calculadaEm).getTime(),routeAge=Number.isFinite(calculatedAt)?Math.max(0,(time-calculatedAt)/1000):0;
                const initialAdvance=Math.max(150,routeAge*Math.max(10,position.velocidade_mps || 0)+position.precisao_m*2,validPoint(route.origem)?distance(route.origem,position)*2+50:0);
                const backwardTolerance=Math.max(8,Math.min(25,position.precisao_m*2));
                const currentStep=initialized?Math.max(0,steps.findIndex(step=>step.end>progress+.5)):0;
                let match;
                for(const segment of segments) {
                    const candidate=project(position,segment.a,segment.b),at=segment.start+segment.length*candidate.fraction;
                    if(initialized && (at<progress-backwardTolerance || at>progress+maxAdvance)) continue;
                    if(!initialized && at>initialAdvance) continue;
                    const direction=heading===null?0:angle(heading,segment.bearing);
                    // Em cruzamentos repetidos, preferir o segmento próximo do progresso conhecido.
                    const score=candidate.offset+direction/180*20+(initialized ? Math.abs(at-progress)*.01+Math.abs(segment.index-currentStep)*.25 : at*.00001);
                    if(!match || score<match.score) match={...candidate,at,index:segment.index,score,direction};
                }
                const nearDestination=match && total-match.at<40 && distance(position,route.destino)<Math.max(25,position.precisao_m);
                if(!match || match.offset>Math.max(50,position.precisao_m*2) || (!nearDestination && heading!==null && match.direction>110)) {
                    if(lastFix!==time) {offRouteFixes++;lastFix=time;}
                    return remember({state:"off-route",recalculate:offRouteFixes>=2});
                }
                const estimatedSpeed=lastPosition && lastTime && time>lastTime ? distance(lastPosition,position)/((time-lastTime)/1000) : null;
                offRouteFixes=0;lastFix=time;lastTime=time;lastPosition={latitude:position.latitude,longitude:position.longitude};initialized=true;
                progress=Math.max(progress,match.at);
                let index=steps.findIndex(step=>step.end>progress+.5);if(index<0) index=steps.length-1;
                const current=steps[index],remainingInStep=Math.max(0,current.end-progress);
                const remainingMeters=Math.max(0,total-progress);
                let remainingSeconds;
                if(steps.every(step=>step.seconds!==null)) remainingSeconds=current.seconds*remainingInStep/current.meters+steps.slice(index+1).reduce((sum,step)=>sum+step.seconds,0);
                else remainingSeconds=seconds(route.duracao)===null ? null : seconds(route.duracao)*remainingMeters/total;
                return remember({state:remainingMeters<40 && distance(position,route.destino)<Math.max(25,position.precisao_m) ? "arrived" : "navigating",
                    index,current,next:steps[index+1],afterNext:steps[index+2],toNextMeters:remainingInStep,remainingMeters,remainingSeconds,
                    speedKmh:Math.round(Math.max(0,Number.isFinite(position.velocidade_mps) && position.velocidade_mps>=0 ? position.velocidade_mps : estimatedSpeed || 0)*3.6)});
            }
        };
    }
    const api={create,decode,distance};
    if(typeof module!=="undefined" && module.exports) module.exports=api;
    else root.PetFlowNavigationEngine=api;
})(typeof window!=="undefined" ? window : globalThis);
