"use strict";

(() => {
    const API = "/api/public/rede-sandbox";
    const fixture = Object.freeze({ cardNumber: "5448280000000007", expirationMonth: 1, expirationYear: 2035, securityCode: "123" });
    let active = false;
    let configured = false;
    let busy = false;
    let elements;

    window.NacaoAnimalCartSandbox = { isActive: () => active, renderItems, renderTotals, submit };
    document.addEventListener("DOMContentLoaded", setup);

    async function setup() {
        elements = {
            banner: document.getElementById("cartSandboxBanner"),
            toggle: document.getElementById("cartSandboxToggle"),
            availability: document.getElementById("cartSandboxAvailability"),
            description: document.getElementById("cartSandboxDescription"),
            fields: document.getElementById("cartSandboxFields"),
            scenario: document.getElementById("cartSandboxScenario"),
            card: document.getElementById("cartSandboxCard"),
            month: document.getElementById("cartSandboxMonth"),
            year: document.getElementById("cartSandboxYear"),
            code: document.getElementById("cartSandboxCode"),
            fill: document.getElementById("cartSandboxFill"),
            result: document.getElementById("cartSandboxResult"),
            form: document.getElementById("cartForm"),
            submit: document.querySelector("#cartForm button[type='submit']")
        };
        if (!elements.banner || !elements.form) return;
        elements.toggle.addEventListener("click", toggle);
        elements.fill.addEventListener("click", fillCard);
        elements.fields.addEventListener("input", clearResult);
        elements.scenario.addEventListener("change", () => {
            if (!active || busy) return;
            clearResult();
            renderItems();
        });
        try {
            const data = await callApi(API);
            if (data.environment !== "sandbox") return;
            configured = data.configured === true;
            elements.banner.hidden = false;
            elements.toggle.disabled = !configured;
            if (!configured) elements.availability.textContent = "As credenciais de Sandbox da Rede precisam ser configuradas no servidor antes do teste.";
            if (configured && new URLSearchParams(location.search).get("teste") === "1") toggle();
        } catch { /* Em produção ou fora deste computador, a sacola continua sem controles de teste. */ }
    }

    async function callApi(url, options = {}) {
        let response;
        try {
            response = await fetch(url, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
        } catch {
            throw new Error("Não foi possível confirmar o resultado do teste. Consulte a operação antes de tentar novamente.");
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.success !== true) {
            throw new Error(typeof payload?.message === "string" ? payload.message : "O teste local não está disponível. Verifique o servidor antes de tentar novamente.");
        }
        return payload.data;
    }

    function toggle() {
        if (busy || !configured) return;
        active = !active;
        document.body.classList.toggle("cart-sandbox-active", active);
        elements.fields.hidden = !active;
        elements.fields.disabled = !active;
        elements.toggle.textContent = active ? "Voltar à minha sacola" : "Usar sacola de teste";
        elements.description.textContent = active
            ? "Esta sacola usa um produto fictício. O teste não cria pedidos nem altera seu estoque ou sua sacola original."
            : "Use uma sacola fictícia para testar o cartão aqui mesmo. Sua sacola atual será preservada.";
        if (!active) {
            for (const input of [elements.card, elements.month, elements.year, elements.code]) input.value = "";
        }
        elements.result.hidden = true;
        elements.result.replaceChildren();
        document.dispatchEvent(new CustomEvent("nacao:cart-sandbox-changed"));
        if (active) {
            renderItems();
            elements.fill.focus();
        }
    }

    function amount() { return elements.scenario.value === "declined" ? 80 : 2000; }
    function money(cents) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

    function renderItems() {
        if (!active || !elements) return false;
        const item = document.createElement("article");
        item.className = "cart-item cart-sandbox-item";
        const image = document.createElement("img");
        image.src = "/images/logo/nacao-animal-logo-transparent.png";
        image.alt = "";
        const details = document.createElement("div");
        const badge = document.createElement("small");
        badge.textContent = "Produto fictício · teste";
        const name = document.createElement("strong");
        name.textContent = "Item para testar o pagamento";
        const price = document.createElement("span");
        price.textContent = money(amount());
        const description = document.createElement("p");
        description.textContent = "Sem entrega e sem movimentação de estoque.";
        details.append(badge, name, price, description);
        const quantity = document.createElement("span");
        quantity.className = "cart-sandbox-quantity";
        quantity.textContent = "1 unidade";
        item.append(image, details, quantity);
        document.getElementById("cartItems").replaceChildren(item);
        renderTotals();
        return true;
    }

    function renderTotals() {
        if (!active || !elements) return false;
        for (const id of ["cartProductsTotal", "cartSubtotal", "cartTotal"]) document.getElementById(id).textContent = money(amount());
        document.getElementById("cartDiscount").textContent = money(0);
        document.getElementById("cartItemCount").textContent = "1";
        document.getElementById("cartShipping").textContent = "Não se aplica ao teste";
        for (const id of ["cartShippingRow", "cartDeliveryPrompt", "cartStockStatus", "cartSavings", "appliedCoupon"]) document.getElementById(id).hidden = true;
        document.getElementById("cartTotalRow").hidden = false;
        elements.submit.disabled = busy || !configured;
        elements.submit.textContent = busy ? "Aguardando o resultado da Rede…" : "Confirmar compra de teste";
        elements.fields.disabled = busy;
        elements.toggle.disabled = busy;
        elements.form.setAttribute("aria-busy", String(busy));
        return true;
    }

    function fillCard() {
        if (!active || busy) return;
        elements.card.value = "5448 2800 0000 0007";
        elements.month.value = "01";
        elements.year.value = "2035";
        elements.code.value = fixture.securityCode;
        clearResult();
        elements.submit.focus();
    }

    function clearResult() {
        if (busy) return;
        elements.result.hidden = true;
        elements.result.replaceChildren();
    }

    function showMessage(title, message, outcome = "") {
        elements.result.hidden = false;
        elements.result.dataset.outcome = outcome;
        const heading = document.createElement("h3");
        heading.textContent = title;
        const paragraph = document.createElement("p");
        paragraph.textContent = message;
        elements.result.replaceChildren(heading, paragraph);
    }

    function showResult(data) {
        const approved = data?.status === "approved" && data.returnCode === "00" && data.amount === 2000;
        const declined = data?.status === "declined" && data.returnCode === "80" && data.amount === 80;
        if (!approved && !declined) throw new Error("A Rede retornou um resultado diferente do esperado. Consulte o teste antes de repetir.");
        showMessage(approved ? "Pagamento fictício aprovado" : "Pagamento fictício recusado", approved
            ? "A compra foi aprovada no Sandbox. Confira a consulta e o estorno abaixo. Nenhum pedido foi criado na loja."
            : "A Rede confirmou a recusa esperada para este teste. Nenhuma cobrança real foi feita.", approved ? "approved" : "declined");
        const rows = [["Valor fictício", money(data.amount)], ["Código da Rede", data.returnCode]];
        const refundLabels = { Done: "Estorno fictício concluído", Pending: "Estorno solicitado; aguardando confirmação", Failed: "A solicitação de estorno falhou", Unavailable: "Não foi possível confirmar o estorno" };
        if (approved) {
            rows.push(["Consulta", data.consulted === true ? "Transação confirmada" : "Consulta não confirmada"]);
            rows.push(["Estorno", refundLabels[data.refundStatus] || "Estorno não confirmado"]);
        }
        if (typeof data.tid === "string" && data.tid) rows.push(["Identificador do teste", data.tid]);
        const list = document.createElement("dl");
        for (const [label, value] of rows) {
            const row = document.createElement("div");
            const term = document.createElement("dt");
            term.textContent = label;
            const definition = document.createElement("dd");
            definition.textContent = value;
            row.append(term, definition);
            list.append(row);
        }
        elements.result.append(list);
    }

    async function submit(event) {
        event.preventDefault();
        if (!active || busy || !configured) return;
        const card = { cardNumber: elements.card.value.replace(/[ -]/g, ""), expirationMonth: Number(elements.month.value), expirationYear: Number(elements.year.value), securityCode: elements.code.value.trim() };
        if (Object.keys(fixture).some(key => card[key] !== fixture[key])) {
            showMessage("Confira o cartão fictício", "Use somente os dados indicados acima. O botão Preencher cartão fictício completa todos os campos.", "error");
            return;
        }
        busy = true;
        renderTotals();
        if (window.parent !== window) window.parent.postMessage({ type: "petflow:cart-busy", busy: true }, location.origin);
        showMessage("Processando no Sandbox…", "Aguarde a resposta da Rede. A compra aprovada também será consultada e estornada no ambiente de testes.");
        try {
            showResult(await callApi(`${API}/transactions`, { method: "POST", body: JSON.stringify({ scenario: elements.scenario.value, ...card }) }));
        } catch (error) {
            showMessage("Teste não concluído", error.message, "error");
        } finally {
            busy = false;
            renderTotals();
            if (window.parent !== window) window.parent.postMessage({ type: "petflow:cart-busy", busy: false }, location.origin);
        }
    }
})();
