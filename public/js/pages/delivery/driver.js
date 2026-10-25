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
    const content = document.getElementById("driverContent"), completeSection = document.getElementById("completeDeliverySection");
    const completeButton = document.getElementById("completeDelivery"), summary = document.getElementById("completionSummary");
    const completionHeading = document.getElementById("completionHeading"), completionTime = document.getElementById("completionTime");
    const completionNotice = document.getElementById("completionNotice"), navigationNotice = document.getElementById("deliveryNavigationNotice");
    const activeNotice = document.getElementById("deliveryActiveNotice"), dialog = document.getElementById("completeDeliveryDialog");
    const cancelCompletion = document.getElementById("completionCancel"), confirmCompletion = document.getElementById("completionConfirm");
    const completionError = document.getElementById("completionDialogError");
    const retryEmail = document.getElementById("retryDeliveryEmail");
    let version = 0, controller, ended = false, pending = false, ready = false, currentShare = null, completed = false;
    let completionEmailStatus = null;

    function parseShare(value) {
        if (typeof window.NacaoMapsLocationLink?.parse !== "function")
            throw new Error("Não foi possível preparar o compartilhamento. Atualize a página e tente novamente.");
        return window.NacaoMapsLocationLink.parse(value);
    }
    function controls() {
        retry.disabled = pending || ended;
        retry.hidden = completed;
        shareInput.disabled = shareSubmit.disabled = removeShare.disabled = pending || ended || !ready;
        completeButton.disabled = pending || ended || !ready;
        confirmCompletion.disabled = cancelCompletion.disabled = pending;
        confirmCompletion.textContent = pending && !dialog.hidden ? "Registrando entrega…" : "Sim, concluir entrega";
        retryEmail.hidden = !completed || completionEmailStatus !== "failed";
        retryEmail.disabled = pending || retryEmail.hidden;
        retryEmail.textContent = pending && completed ? "Enviando aviso…" : "Tentar enviar aviso por e-mail";
    }
    function closeCompletionDialog(restoreFocus = true) {
        if (dialog.hidden) return;
        dialog.hidden = true;
        content.inert = false;
        if (restoreFocus && ready && !ended) completeButton.focus?.();
    }
    function showCompletionDialog() {
        if (pending || ended || !ready || document.hidden) return;
        completionError.textContent = "";
        dialog.hidden = false;
        content.inert = true;
        controls();
        cancelCompletion.focus?.();
    }
    function renderCompleted(data, focus = false) {
        completed = ended = true;
        completionEmailStatus = data.emailStatus || null;
        clear();
        closeCompletionDialog(false);
        summary.hidden = false;
        const timestamp = data.entregueEm || data.entregue_em;
        completionTime.textContent = Number.isFinite(Date.parse(timestamp))
            ? `Registrada em ${new Date(timestamp).toLocaleString("pt-BR")}.` : "Conclusão registrada pela loja.";
        const emailNotice = data.emailStatus === "failed" ? " O pedido foi atualizado, mas o aviso por e-mail não pôde ser enviado."
            : data.emailStatus === "pending" ? " O aviso por e-mail está em processamento."
                : ["sent", "unchanged"].includes(data.emailStatus) ? " O aviso por e-mail foi enviado ao cliente." : "";
        completionNotice.textContent = "Pare o compartilhamento da sua localização no Google Maps. Concluir a entrega no site não encerra o compartilhamento no aplicativo." + emailNotice;
        status.textContent = "Entrega concluída. O status do pedido foi atualizado para Entregue.";
        controls();
        if (focus) completionHeading.focus?.();
    }
    async function retryCompletionEmail() {
        if (!completed || pending || completionEmailStatus !== "failed" || document.hidden) return;
        pending = true;
        controls();
        const current = ++version;
        controller = new AbortController();
        try {
            // O mesmo comprovante permite reenviar apenas o aviso, sem repetir a entrega ou os sinos.
            const response = await fetch("/api/public/entregas/concluir", {
                method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                cache: "no-store", body: JSON.stringify({ confirmar: true }),
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
            });
            const payload = await response.json().catch(() => ({}));
            if (current !== version || document.hidden) return;
            if (!response.ok) {
                if ([401, 403, 410].includes(response.status)) completionEmailStatus = "unavailable";
                throw new Error(payload.message || "Não foi possível enviar o aviso. Confira sua conexão e tente novamente.");
            }
            if (payload.data?.status !== "ENTREGUE") throw new Error("Não foi possível confirmar o envio do aviso. Tente novamente.");
            renderCompleted(payload.data);
        } catch (error) {
            if (current === version && !document.hidden) {
                completionNotice.textContent = "A entrega continua registrada como Entregue. " +
                    (completionEmailStatus === "unavailable" ? "O link não permite mais reenviar o aviso. Consulte a loja."
                        : "Não foi possível confirmar o envio do aviso por e-mail. Confira sua conexão e tente novamente.");
            }
        } finally {
            if (current === version) {
                pending = false;
                controller = null;
                controls();
                (retryEmail.hidden ? completionHeading : retryEmail).focus?.();
            }
        }
    }
    retryEmail.addEventListener("click", () => { void retryCompletionEmail(); });
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
        completeSection.hidden = navigationNotice.hidden = activeNotice.hidden = true;
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
            if (payload.data?.status === "ENTREGUE" && payload.data.concluida_pelo_entregador === true) {
                renderCompleted(payload.data);
                return;
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
            completeSection.hidden = navigationNotice.hidden = activeNotice.hidden = false;
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
    async function completeDelivery() {
        if (dialog.hidden || ended || pending || !ready || document.hidden) return;
        pending = true;
        completionError.textContent = "";
        controls();
        dialog.focus?.();
        const current = ++version;
        controller = new AbortController();
        try {
            const response = await fetch("/api/public/entregas/concluir", {
                method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                cache: "no-store", body: JSON.stringify({ confirmar: true }),
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
            });
            const payload = await response.json().catch(() => ({}));
            if (current !== version || document.hidden) return;
            if (!response.ok) {
                if ([401, 403, 410].includes(response.status)) {
                    ended = true;
                    clear();
                    closeCompletionDialog(false);
                }
                throw new Error(payload.message || "Não foi possível confirmar a entrega. Tente novamente.");
            }
            if (payload.data?.status !== "ENTREGUE") throw new Error("A conclusão ainda não foi confirmada pela loja. Tente novamente.");
            renderCompleted(payload.data, true);
        } catch (error) {
            if (current === version && !document.hidden) {
                if (ended) {
                    status.textContent = error.message || "Este link não está mais disponível. Consulte a loja.";
                    status.focus?.();
                } else {
                    completionError.textContent = error.name === "TimeoutError" || error.name === "TypeError"
                        ? "Não foi possível confirmar a entrega. Confira sua conexão e tente novamente."
                        : error.message || "Não foi possível confirmar a entrega. Tente novamente.";
                }
            }
        } finally {
            if (current === version) {
                pending = false;
                controller = null;
                controls();
                if (!dialog.hidden) confirmCompletion.focus?.();
            }
        }
    }
    completeButton.addEventListener("click", showCompletionDialog);
    cancelCompletion.addEventListener("click", () => { if (!pending) closeCompletionDialog(); });
    confirmCompletion.addEventListener("click", () => { void completeDelivery(); });
    dialog.addEventListener("click", event => { if (event.target === dialog && !pending) closeCompletionDialog(); });
    dialog.addEventListener("keydown", event => {
        if (dialog.hidden) return;
        if (event.key === "Escape") {
            event.preventDefault();
            if (!pending) closeCompletionDialog();
        } else if (event.key === "Tab") {
            const first = pending ? dialog : cancelCompletion, last = pending ? dialog : confirmCompletion;
            if (pending || (event.shiftKey && document.activeElement !== last) || (!event.shiftKey && document.activeElement !== first)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus?.();
            }
        }
    });
    document.addEventListener("focusin", event => {
        if (!dialog.hidden && !dialog.contains?.(event.target)) (pending ? dialog : cancelCompletion).focus?.();
    });
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
        if (document.hidden) { cancel(); closeCompletionDialog(false); clear(); }
        else load();
    });
    window.addEventListener("pagehide", () => { cancel(); closeCompletionDialog(false); clear(); });
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
