"use strict";
(() => {
    const seconds = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value
        : typeof value === "string" && /^\d+(?:\.\d+)?s$/.test(value) ? parseFloat(value) : null;
    const lengthText = value => Number.isFinite(value) && value >= 0
        ? value < 1000 ? `${Math.round(value)} m` : `${(value/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})} km` : "Distância indisponível";
    window.PetFlowDeliveryRouteOptions = function ({onSelect}={}) {
        const ids=["routeAlternatives","routeOptionsStatus","routeWarnings"];
        const el=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
        let busy=false,version=0,selectedId=null,options=[],buttons=[],beforeBusyStatus="";
        const ready=Boolean(el.routeAlternatives&&el.routeOptionsStatus);
        function warning(routeWarnings=[]) {
            if(!el.routeWarnings)return;
            const warnings=Array.isArray(routeWarnings)?[...new Set(routeWarnings.filter(value=>typeof value==="string"&&value.trim()).map(value=>value.slice(0,600)))]:[];
            el.routeWarnings.hidden=!warnings.length;
            el.routeWarnings.textContent=warnings.join(" ");
        }
        function controls() {
            if(!ready)return;
            buttons.forEach(button=>{button.disabled=busy;});
            el.routeAlternatives.setAttribute("aria-busy",String(busy));
        }
        function clear() {
            version++;options=[];buttons=[];selectedId=null;busy=false;beforeBusyStatus="";
            if(ready){el.routeAlternatives.replaceChildren();el.routeOptionsStatus.textContent="As rotas disponíveis aparecerão após calcular o percurso.";warning();controls();}
        }
        function render(route) {
            if(!ready)return;
            const current=++version,seen=new Set();
            const source=Array.isArray(route?.alternativas)&&route.alternativas.length?route.alternativas:route?[route]:[];
            options=source.filter(option=>option&&typeof option.polyline==="string"&&option.polyline.length).map((option,index)=>({
                route:option,id:typeof option.id==="string"&&option.id?option.id:`rota-${index}`
            })).filter(option=>{if(seen.has(option.id))return false;seen.add(option.id);return true;});
            selectedId=typeof route?.id==="string"?route.id:options.find(option=>option.route.polyline===route?.polyline)?.id??options[0]?.id??null;
            buttons=[];el.routeAlternatives.replaceChildren();
            for(const [index,item] of options.entries()) {
                const button=document.createElement("button"),title=document.createElement("strong"),detail=document.createElement("span"),selected=document.createElement("span");
                button.type="button";button.className="route-option";button.setAttribute("aria-pressed",String(item.id===selectedId));
                const name=typeof item.route.resumo==="string"&&item.route.resumo.trim()?item.route.resumo.trim().slice(0,180):index===0?"Rota sugerida":`Alternativa ${index}`;
                title.textContent=name;
                const time=seconds(item.route.duracao);
                detail.textContent=`${lengthText(item.route.distanciaMetros)} · ${time===null?"Tempo indisponível":`${Math.max(1,Math.ceil(time/60))} min`}`;
                selected.className="route-option-selection";selected.textContent=item.id===selectedId?"Em uso":"Usar esta rota";
                button.appendChild(title);button.appendChild(detail);button.appendChild(selected);button.disabled=busy;
                button.addEventListener("click",()=>{
                    if(current!==version||busy||item.id===selectedId||document.hidden)return;
                    selectedId=item.id;
                    buttons.forEach((other,n)=>{
                        const active=options[n].id===selectedId;other.setAttribute("aria-pressed",String(active));
                        other.querySelector(".route-option-selection").textContent=active?"Em uso":"Usar esta rota";
                    });
                    onSelect?.(item.route);
                });
                buttons.push(button);el.routeAlternatives.appendChild(button);
            }
            el.routeOptionsStatus.textContent=options.length>1?`${options.length} rotas disponíveis. Escolha com segurança antes de sair ou enquanto estiver parado.`
                :options.length===1?"O Google disponibilizou uma rota para este percurso.":"Nenhuma rota disponível neste momento.";
            warning(route?.avisos);controls();
        }
        if(ready)warning();
        return {render,clear,setBusy(value){
            const next=Boolean(value);
            if(ready&&next&&!busy)beforeBusyStatus=el.routeOptionsStatus.textContent;
            busy=next;controls();
            if(ready&&busy)el.routeOptionsStatus.textContent="Buscando rotas disponíveis...";
            else if(ready&&el.routeOptionsStatus.textContent==="Buscando rotas disponíveis...")
                el.routeOptionsStatus.textContent=beforeBusyStatus||"As rotas disponíveis aparecerão após calcular o percurso.";
        }};
    };
})();
