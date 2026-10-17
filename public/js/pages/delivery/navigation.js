"use strict";
(() => {
    const icons = maneuver => maneuver?.includes("ROUNDABOUT") ? "⟳" : maneuver?.includes("U_TURN") ? "↶" : maneuver?.includes("LEFT") ? "↰" : maneuver?.includes("RIGHT") ? "↱" : maneuver?.includes("MERGE") ? "⤴" : "↑";
    const meters = value => value>=1000 ? `${(value/1000).toLocaleString("pt-BR",{maximumFractionDigits:1})} km` : `${Math.round(value/10)*10} m`;
    window.PetFlowDeliveryNavigation = function ({map,recalculate}) {
        const ids=["navigationPanel","navigationInstruction","navigationDistance","navigationManeuver","navigationNext","navigationSummary","navigationTime","navigationRemaining","navigationArrival","navigationSpeed","toggleVoice"];
        const el=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
        let trip,engine,routeKey="",active=false,voice=false,followed=false,lastState;
        const spoken=new Set();
        const speech=window.speechSynthesis;
        if(!speech || !window.SpeechSynthesisUtterance) el.toggleVoice.disabled=true;
        function speak(text,key) {
            if(!voice || !active || document.hidden || spoken.has(key)) return;
            spoken.add(key);speech.cancel();const utterance=new window.SpeechSynthesisUtterance(text);utterance.lang="pt-BR";speech.speak(utterance);
        }
        function render() {
            if(!active || !trip || document.hidden) return;
            const result=engine?.update(trip) || {state:"missing"};lastState=result;
            el.navigationPanel.hidden=false;el.navigationSummary.hidden=false;
            el.navigationTime.textContent=el.navigationRemaining.textContent=el.navigationArrival.textContent=el.navigationSpeed.textContent="—";
            if(!["navigating","arrived"].includes(result.state)) {
                const messages={missing:"Aguardando as orientações da rota. Use Atualizar rota se necessário.",stale:"GPS sem atualização recente. Aguardando sua posição.",imprecise:"GPS impreciso. Aguarde uma posição mais precisa.","off-route":"Fora da rota. Aguardando atualização do trajeto."};
                el.navigationInstruction.textContent=messages[result.state];el.navigationDistance.textContent="";el.navigationNext.textContent="";el.navigationManeuver.textContent="!";
                if(voice) speech.cancel();if(result.recalculate) recalculate();return;
            }
            if(!followed) followed=map.follow()!==false;
            el.navigationTime.textContent=result.remainingSeconds===null ? "—" : `${Math.max(1,Math.ceil(result.remainingSeconds/60))} min`;
            el.navigationRemaining.textContent=meters(result.remainingMeters);
            el.navigationArrival.textContent=result.remainingSeconds===null ? "" : new Date(Date.now()+result.remainingSeconds*1000).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
            el.navigationSpeed.textContent=result.speedKmh===null ? "—" : `${result.speedKmh}`;
            if(result.state==="arrived") {
                el.navigationInstruction.textContent="Você está perto do endereço da entrega.";el.navigationDistance.textContent="Confira o número do imóvel.";el.navigationManeuver.textContent="●";el.navigationNext.textContent="";
                speak("Você está perto do endereço da entrega. Confira o número do imóvel.",`${routeKey}:arrival`);return;
            }
            const approaching=result.next && result.toNextMeters<=Math.max(100,(trip.velocidade_mps || 0)*8);
            const instruction=approaching ? result.next : result.current;
            const next=approaching ? result.afterNext : result.next;
            el.navigationInstruction.textContent=instruction.instrucao;
            el.navigationManeuver.textContent=icons(instruction.manobra);
            el.navigationDistance.textContent=approaching ? `Em ${meters(result.toNextMeters)}` : result.next ? `${meters(result.toNextMeters)} até a próxima manobra` : `${meters(result.remainingMeters)} até o destino`;
            el.navigationNext.textContent=next ? `Depois: ${next.instrucao}` : "";
            const bucket=approaching ? (result.toNextMeters<=25 ? "now" : "approach") : "current";
            speak(approaching ? `Em ${meters(result.toNextMeters)}, ${instruction.instrucao}` : instruction.instrucao,`${routeKey}:${result.index}:${bucket}`);
        }
        el.toggleVoice.addEventListener("click",()=>{
            voice=!voice;
            el.toggleVoice.querySelector(".control-icon").textContent=voice ? "🔊" : "🔇";
            el.toggleVoice.querySelector(".sr-only").textContent=voice ? "Voz ligada" : "Voz desligada";
            el.toggleVoice.setAttribute("aria-label",voice ? "Desligar orientação por voz" : "Ligar orientação por voz");
            el.toggleVoice.title=voice ? "Desligar orientação por voz" : "Ligar orientação por voz";
            el.toggleVoice.setAttribute("aria-pressed",String(voice));
            if(!voice) speech.cancel();else {spoken.clear();render();}
        });
        setInterval(render,5000);document.addEventListener("visibilitychange",()=>{if(document.hidden){if(voice)speech.cancel();}else render();});
        return {
            start(){active=true;document.body.classList.add("navigation-active");},
            update(data){trip=data;const key=data.rota ? JSON.stringify([data.rota.calculadaEm,data.rota.polyline,data.rota.etapas]) : "";
                if(key!==routeKey){routeKey=key;engine=window.PetFlowNavigationEngine.create(data.rota);spoken.clear();}render();},
            stop(){active=false;followed=false;trip=null;engine=null;routeKey="";spoken.clear();if(speech)speech.cancel();el.navigationPanel.hidden=el.navigationSummary.hidden=true;document.body.classList.remove("navigation-active");},
            pause(){if(trip){trip={...trip,atualizado_em:null};render();}},
            needsRoute(){return lastState?.recalculate || !engine;}
        };
    };
})();
