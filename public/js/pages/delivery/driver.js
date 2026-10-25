"use strict";
(() => {
    const token = location.hash.slice(1);
    const status = document.getElementById("driverStatus");
    const details = document.getElementById("driverDetails");
    const destination = document.getElementById("destinationAddress");
    const navigate = document.getElementById("navigateGoogleMaps");
    const retry = document.getElementById("reloadDelivery");
    const shareSection = document.getElementById("shareLocationSection"), shareForm = document.getElementById("shareLocationForm");
    const shareInput = document.getElementById("sharedLocationUrl"), shareSubmit = document.getElementById("shareLocationSubmit");
    const shareStatus = document.getElementById("shareLocationStatus"), removeShare = document.getElementById("removeLocationShare");
    const sharedDetails = document.getElementById("driverSharedLocation"), sharedLink = document.getElementById("driverSharedLocationOpen");
    let version = 0, controller, ended = false, pending = false, ready = false, currentShare = null;

    function parseShare(value) {
        if (typeof window.NacaoMapsLocationLink?.parse !== "function")
            throw new Error("Não foi possível preparar o compartilhamento. Atualize a página e tente novamente.");
        return window.NacaoMapsLocationLink.parse(value);
    }
    function controls() {
        retry.disabled = pending || ended;
        shareInput.disabled = shareSubmit.disabled = removeShare.disabled = pending || ended || !ready;
    }
    function renderShare(value) {
        currentShare = null;
        sharedDetails.hidden = true;
        sharedLink.removeAttribute("href");
        if (!value || !Number.isFinite(Date.parse(value.expira_em)) || Date.parse(value.expira_em) <= Date.now()) return;
        try {
            const url = parseShare(value.url);
            currentShare = { url, expires: Date.parse(value.expira_em) };
            sharedLink.href = url;
            sharedDetails.hidden = false;
        } catch { /* Não exibe links inesperados retornados pelo servidor. */ }
    }

    function clear() {
        details.hidden = true;
        navigate.hidden = true;
        navigate.removeAttribute("href");
        destination.textContent = "";
        ready = false;
        shareSection.hidden = true;
        shareInput.value = shareStatus.textContent = "";
        renderShare(null);
        controls();
    }
    function cancel() {
        version++;
        controller?.abort();
        controller = null;
        pending = false;
        controls();
    }
    function deliveryAddress(address) {
        if (!address || typeof address !== "object" || Array.isArray(address)) return null;
        const field = name => typeof address[name] === "string" || typeof address[name] === "number"
            ? String(address[name]).trim() : "";
        if (!["endereco", "numero", "cidade", "estado"].every(name => field(name))) return null;
        const route = [field("endereco"), field("numero"), field("bairro"), field("cidade"), field("estado"), field("cep"), "Brasil"].filter(Boolean).join(", ");
        if (route.length > 1500) return null;
        return { route, label: [route, field("complemento")].filter(Boolean).join(" · ") };
    }
    async function load() {
        if (ended || pending || document.hidden) return;
        clear();
        pending = true;
        controls();
        status.textContent = "Consultando os dados da entrega…";
        const current = ++version;
        controller = new AbortController();
        try {
            const response = await fetch("/api/public/entregas/viagem", {
                headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
            });
            const payload = await response.json();
            if (current !== version || document.hidden) return;
            if (!response.ok) {
                ended = [401, 403, 410].includes(response.status);
                throw new Error(payload.message || "Não foi possível consultar a entrega.");
            }
            if (payload.data?.status !== "SAIU_PARA_ENTREGA") {
                ended = true;
                throw new Error("Esta entrega não está em andamento. Consulte a loja.");
            }
            const address = deliveryAddress(payload.data.endereco_entrega);
            if (!address) throw new Error("O endereço desta entrega está incompleto. Peça à loja para conferir o pedido.");
            const url = new URL("https://www.google.com/maps/dir/");
            url.search = new URLSearchParams({ api: "1", destination: address.route, travelmode: "driving", dir_action: "navigate" }).toString();
            if (url.href.length > 2048) throw new Error("O endereço desta entrega é muito longo. Peça à loja para conferir o pedido.");
            destination.textContent = address.label;
            navigate.href = url.href;
            details.hidden = navigate.hidden = false;
            ready = true;
            shareSection.hidden = false;
            renderShare(payload.data.compartilhamento);
            if (currentShare) shareStatus.textContent = "O link está disponível para a loja e o cliente. Confira no Google Maps se o compartilhamento continua ativo.";
            status.textContent = "Endereço carregado. Toque em Navegar no Google Maps para abrir o trajeto.";
        } catch (error) {
            if (current === version && !document.hidden) {
                clear();
                status.textContent = error.message || "Não foi possível consultar a entrega. Tente novamente.";
            }
        } finally {
            if (current === version) {
                pending = false;
                controller = null;
                controls();
            }
        }
    }
    async function saveShare(method) {
        if (ended || pending || !ready || document.hidden) return;
        let url;
        if (method === "POST") {
            try { url = parseShare(shareInput.value); }
            catch (error) { shareStatus.textContent = error.message || "Confira o link de localização copiado no Google Maps."; return; }
        }
        pending = true; controls();
        shareStatus.textContent = method === "POST" ? "Compartilhando o link…" : "Removendo o link do site…";
        const current = ++version;
        controller = new AbortController();
        try {
            const response = await fetch("/api/public/entregas/compartilhamento", {
                method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, cache: "no-store",
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
                ...(method === "POST" ? { body: JSON.stringify({ url }) } : {})
            });
            const payload = await response.json();
            if (current !== version || document.hidden) return;
            if (!response.ok) {
                if ([401, 403, 410].includes(response.status)) { ended = true; clear(); }
                throw new Error(payload.message || "Não foi possível atualizar o compartilhamento. Tente novamente.");
            }
            renderShare(method === "DELETE" ? null : payload.data?.compartilhamento);
            shareInput.value = "";
            if (method === "DELETE") {
                shareStatus.textContent = "Link removido do site. Para encerrar o acesso de quem já recebeu o link, pare o compartilhamento também no Google Maps.";
            } else if (!currentShare) {
                shareStatus.textContent = "Não foi possível confirmar o link salvo. Atualize os dados da entrega antes de tentar novamente.";
            } else if (payload.data?.emailStatus === "failed") {
                shareStatus.textContent = "Link salvo e disponível no painel e no sino do cliente. Não foi possível enviar o aviso por e-mail.";
            } else if (payload.data?.emailStatus === "unchanged") {
                shareStatus.textContent = "Esse link já foi compartilhado. Confira no Google Maps se a localização continua ativa.";
            } else if (payload.data?.emailStatus === "not_applicable") {
                shareStatus.textContent = "Link compartilhado com a loja. Confira no Google Maps se a localização continua ativa.";
            } else if (payload.data?.emailStatus === "pending") {
                shareStatus.textContent = "Link salvo e disponível no painel e no sino do cliente. O aviso por e-mail está em processamento.";
            } else if (payload.data?.emailStatus === "sent") {
                shareStatus.textContent = "Link compartilhado com a loja e o cliente. Aviso disponível no sino e enviado por e-mail.";
            } else {
                shareStatus.textContent = "Link compartilhado com a loja e o cliente. Confira no Google Maps se a localização continua ativa.";
            }
        } catch (error) {
            if (current === version && !document.hidden) {
                if (ended) status.textContent = error.message;
                else shareStatus.textContent = error.message || "Não foi possível atualizar o compartilhamento. Tente novamente.";
            }
        } finally {
            if (current === version) { pending = false; controller = null; controls(); }
        }
    }
    shareForm.addEventListener("submit", event => { event.preventDefault(); void saveShare("POST"); });
    removeShare.addEventListener("click", () => { void saveShare("DELETE"); });
    sharedLink.addEventListener("click", event => {
        if (!ready || !currentShare || currentShare.expires <= Date.now()) {
            event.preventDefault(); renderShare(null);
            shareStatus.textContent = "Atualize os dados da entrega para conferir se há um link disponível.";
        }
    });
    retry.addEventListener("click", load);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) { cancel(); clear(); }
        else load();
    });
    window.addEventListener("pagehide", () => { cancel(); clear(); });
    window.addEventListener("pageshow", load);
    setInterval(() => {
        if (!document.hidden && currentShare && currentShare.expires <= Date.now()) {
            renderShare(null);
            shareStatus.textContent = "Este link não está mais disponível no site. Confira o compartilhamento no Google Maps e atualize a entrega.";
        }
    }, 15000);
    if (!/^[a-f0-9]{64}$/.test(token)) {
        ended = true; clear(); retry.disabled = true;
        status.textContent = "Link inválido. Peça à loja o link completo desta entrega.";
    } else load();
})();
