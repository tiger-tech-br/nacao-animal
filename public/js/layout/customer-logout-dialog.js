"use strict";

(function () {
    if (window.NacaoAnimalLogoutDialog) return;

    const title = "Deseja sair da sua conta?";
    const description = "Os dados desta sessão serão removidos deste navegador. Seu cadastro e seus pedidos continuam salvos.";
    let pending = null;

    function confirm(triggerElement) {
        if (pending) return pending.promise;

        let resolveConfirmation;
        const promise = new Promise(resolve => { resolveConfirmation = resolve; });
        const request = { promise };
        const pageDocument = typeof document === "undefined" ? null : document;
        const previousFocus = triggerElement || pageDocument?.activeElement;
        let dialog = null;
        let settled = false;
        pending = request;

        function finish(confirmed) {
            if (settled) return;
            settled = true;

            if (dialog) {
                if (dialog.open && typeof dialog.close === "function") {
                    dialog.close();
                }
                dialog.remove();
            }

            if (previousFocus?.isConnected && typeof previousFocus.focus === "function") {
                previousFocus.focus();
            }

            if (pending === request) pending = null;
            resolveConfirmation(confirmed === true);
        }

        function fallback() {
            // Mantém uma única decisão mesmo com chamadas no mesmo ciclo.
            Promise.resolve().then(() => {
                let confirmed = false;
                try {
                    confirmed = typeof window.confirm === "function"
                        && window.confirm(`${title}\n\n${description}`) === true;
                } catch (_error) {
                    confirmed = false;
                }
                finish(confirmed);
            });
        }

        if (!pageDocument?.body || typeof pageDocument.createElement !== "function") {
            fallback();
            return promise;
        }

        dialog = pageDocument.createElement("dialog");
        if (typeof dialog.showModal !== "function") {
            fallback();
            return promise;
        }

        dialog.className = "customer-logout-dialog";
        dialog.setAttribute("aria-labelledby", "customer-logout-title");
        dialog.setAttribute("aria-describedby", "customer-logout-description");

        const close = pageDocument.createElement("button");
        close.type = "button";
        close.className = "customer-logout-dialog__close";
        close.setAttribute("aria-label", "Fechar");
        close.textContent = "×";
        close.addEventListener("click", () => finish(false));

        const content = pageDocument.createElement("div");
        content.className = "customer-logout-dialog__content";

        const emblem = pageDocument.createElement("span");
        emblem.className = "customer-logout-dialog__emblem";
        emblem.setAttribute("aria-hidden", "true");
        emblem.textContent = "?";

        const heading = pageDocument.createElement("h2");
        heading.id = "customer-logout-title";
        heading.textContent = title;

        const message = pageDocument.createElement("p");
        message.id = "customer-logout-description";
        message.textContent = description;

        const actions = pageDocument.createElement("div");
        actions.className = "customer-logout-dialog__actions";

        const cancel = pageDocument.createElement("button");
        cancel.type = "button";
        cancel.className = "customer-logout-dialog__cancel";
        cancel.textContent = "Continuar na conta";
        cancel.autofocus = true;
        cancel.addEventListener("click", () => finish(false));

        const accept = pageDocument.createElement("button");
        accept.type = "button";
        accept.className = "customer-logout-dialog__confirm";
        accept.textContent = "Sim, sair";
        accept.addEventListener("click", () => finish(true));

        actions.appendChild(cancel);
        actions.appendChild(accept);
        content.appendChild(emblem);
        content.appendChild(heading);
        content.appendChild(message);
        content.appendChild(actions);
        dialog.appendChild(close);
        dialog.appendChild(content);

        dialog.addEventListener("cancel", event => {
            event.preventDefault();
            finish(false);
        });
        dialog.addEventListener("close", () => finish(false));

        pageDocument.body.appendChild(dialog);
        try {
            dialog.showModal();
            cancel.focus();
        } catch (_error) {
            dialog.remove();
            dialog = null;
            fallback();
        }

        return promise;
    }

    window.NacaoAnimalLogoutDialog = { confirm };
})();
