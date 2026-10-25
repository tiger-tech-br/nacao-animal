"use strict";
(() => {
    const token = location.hash.slice(1);
    const status = document.getElementById("driverStatus");
    const details = document.getElementById("driverDetails");
    const destination = document.getElementById("destinationAddress");
    const navigate = document.getElementById("navigateGoogleMaps");
    const retry = document.getElementById("reloadDelivery");
    let version = 0, controller, ended = false, pending = false;

    function clear() {
        details.hidden = true;
        navigate.hidden = true;
        navigate.removeAttribute("href");
        destination.textContent = "";
    }
    function cancel() {
        version++;
        controller?.abort();
        controller = null;
        pending = false;
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
        retry.disabled = true;
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
                retry.disabled = ended;
            }
        }
    }
    retry.addEventListener("click", load);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) { cancel(); clear(); }
        else load();
    });
    window.addEventListener("pagehide", () => { cancel(); clear(); });
    window.addEventListener("pageshow", load);
    if (!/^[a-f0-9]{64}$/.test(token)) {
        ended = true; clear(); retry.disabled = true;
        status.textContent = "Link inválido. Peça à loja o link completo desta entrega.";
    } else load();
})();
