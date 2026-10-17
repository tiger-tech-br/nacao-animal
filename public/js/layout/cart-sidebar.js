"use strict";

// A mesma sacola atende a página completa e o painel, sem duplicar o checkout.
(() => {
    if (window.parent !== window) return;
    let dialog;
    let frame;
    let busy = false;

    function syncCart() {
        window.PetFlowPublicHeader?.update();
        document.dispatchEvent(new CustomEvent("petflow:cart-changed"));
    }

    function closeCart() {
        if (!busy) dialog?.close();
    }

    function openCart() {
        if (!dialog) {
            dialog = document.createElement("dialog");
            dialog.className = "cart-sidebar";
            dialog.setAttribute("aria-labelledby", "cartSidebarTitle");
            dialog.innerHTML = `<header class="cart-sidebar-heading"><h2 id="cartSidebarTitle">Minha sacola</h2><button type="button" aria-label="Fechar sacola" autofocus>×</button></header><iframe title="Produtos e resumo da sacola"></iframe>`;
            document.body.append(dialog);
            frame = dialog.querySelector("iframe");
            dialog.querySelector("button").addEventListener("click", closeCart);
            dialog.addEventListener("click", event => {
                if (event.target === dialog) {
                    const rect = dialog.getBoundingClientRect();
                    if (event.clientX < rect.left || event.clientX > rect.right) closeCart();
                }
            });
            dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
            dialog.addEventListener("close", () => {
                document.documentElement.classList.remove("cart-sidebar-open");
                syncCart();
            });
            window.addEventListener("message", event => {
                if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
                if (event.data?.type === "petflow:cart-changed") syncCart();
                if (event.data?.type === "petflow:close-cart") closeCart();
                if (event.data?.type === "petflow:cart-busy") {
                    busy = event.data.busy === true;
                    dialog.querySelector("button").disabled = busy;
                }
            });
        }
        if (dialog.open) return;
        frame.src = "/sacola?sidebar=1";
        dialog.showModal();
        document.documentElement.classList.add("cart-sidebar-open");
    }

    document.addEventListener("click", event => {
        const link = event.target.closest("a[href='/sacola'], [aria-label='Sacola'], [aria-label='Abrir sacola']");
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openCart();
    }, true);

    window.PetFlowCart = { open: openCart, close: closeCart };
})();
