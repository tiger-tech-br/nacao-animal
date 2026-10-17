"use strict";

const CART_API = "/api/public";

let cartProducts = [];
let cart = readCart();
let customer = null;
let shippingQuote = null;
let submitting = false;
let selectedCoupon = sessionStorage.getItem("petflow_cart_coupon") || "";
let appliedCoupon = null;
let couponSubtotal = null;
let couponLoading = false;
let couponRevision = 0;
let shippingRevision = 0;
let automaticShippingTimer = null;
let cepLookupTimer = null;
let cepLookupController = null;
let cepRevision = 0;
const deliveryFields = { cep: "deliveryCep", endereco: "deliveryStreet", numero: "deliveryNumber", complemento: "deliveryComplement", bairro: "deliveryDistrict", cidade: "deliveryCity", estado: "deliveryState" };
const embeddedCart = window.parent !== window && new URLSearchParams(location.search).get("sidebar") === "1";
if (embeddedCart) document.body.classList.add("cart-embedded");
document.getElementById("calculateShipping").hidden = Boolean(getToken());

document.addEventListener("DOMContentLoaded", () => {
    setupCartPage();
});

document.addEventListener("petflow:customer-logout", async () => {
    cart = {};
    shippingQuote = null;
    selectedCoupon = "";
    sessionStorage.removeItem("petflow_cart_coupon");
    persistCart();
    renderCart();
    await renderCustomer();
    await refreshCoupons();
});

document.addEventListener("petflow:cart-changed", () => {
    if (!embeddedCart && !submitting) {
        cart = readCart();
        renderCart();
        refreshCoupons();
    }
});

async function setupCartPage() {
    try {
        const response = await fetch(`${CART_API}/produtos`);
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.message || "Produtos indisponíveis.");
        }

        cartProducts = Array.isArray(payload.data) ? payload.data : [];
        renderCart();
        await renderCustomer();
        setupCartEvents();
        restoreDeliveryAddress();
        await refreshCoupons();
    } catch (error) {
        renderEmpty(error.message || "Não foi possível carregar sua sacola.");
    }
}

function setupCartEvents() {
    document.getElementById("toggleCoupons").addEventListener("click", () => {
        const panel = document.getElementById("couponPanel");
        panel.hidden = !panel.hidden;
        document.getElementById("toggleCoupons").setAttribute("aria-expanded", String(!panel.hidden));
        if (!panel.hidden) document.getElementById("couponCode").focus();
    });
    document.getElementById("couponForm").addEventListener("submit", event => {
        event.preventDefault();
        if (!submitting) refreshCoupons(document.getElementById("couponCode").value.trim().toUpperCase());
    });
    document.getElementById("availableCoupons").addEventListener("click", event => {
        const button = event.target.closest("[data-coupon-code]");
        if (button && !submitting) refreshCoupons(button.dataset.couponCode);
    });
    document.getElementById("removeCoupon").addEventListener("click", () => {
        if (!submitting) refreshCoupons("");
    });
    document.getElementById("continueShopping").addEventListener("click", event => {
        if (embeddedCart) {
            event.preventDefault();
            window.parent.postMessage({ type: "petflow:close-cart" }, location.origin);
        }
    });
    if (embeddedCart) {
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") window.parent.postMessage({ type: "petflow:close-cart" }, location.origin);
        });
        document.querySelectorAll("a").forEach(link => {
            if (link.id !== "continueShopping") link.target = "_top";
        });
    }
    document.getElementById("shippingForm").addEventListener("submit", event => { event.preventDefault(); calculateShipping(); });
    document.getElementById("lookupCep").addEventListener("click", lookupDeliveryCep);
    document.getElementById("deliveryCep").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            lookupDeliveryCep();
        }
    });
    document.getElementById("shippingForm").addEventListener("input", event => {
        if (submitting) return;
        if (event.target.id === "deliveryCep") {
            clearTimeout(cepLookupTimer);
            cepLookupController?.abort();
            const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
            event.target.value = digits.replace(/^(\d{5})(\d)/, "$1-$2");
            ++cepRevision;
            for (const id of ["deliveryStreet", "deliveryDistrict", "deliveryCity", "deliveryState"]) document.getElementById(id).value = "";
            if (digits.length === 8) cepLookupTimer = setTimeout(lookupDeliveryCep, 600);
        }
        invalidateShipping();
        sessionStorage.setItem("petflow_delivery_address", JSON.stringify(readDeliveryAddress()));
        scheduleAutomaticShipping();
    });
    document.addEventListener("input", event => {
        const input = event.target.closest("[data-cart-quantity]");

        if (!input || submitting) {
            return;
        }

        const product = cartProducts.find(item => getProductId(item) === input.dataset.cartQuantity);
        const available = stockAvailable(product);
        const maximum = Number.isFinite(available) ? Math.max(1, available) : 999;
        cart[input.dataset.cartQuantity] = Math.min(maximum, Math.max(1, Math.floor(Number(input.value) || 1)));
        persistCart();
        renderCart();
        refreshCoupons();
    });

    document.addEventListener("click", event => {
        const remove = event.target.closest("[data-cart-remove]");

        if (!remove || submitting) {
            return;
        }

        delete cart[remove.dataset.cartRemove];
        persistCart();
        renderCart();
        refreshCoupons();
    });

    document.getElementById("cartForm")?.addEventListener("submit", submitOrder);
}

function renderCart() {
    const list = document.getElementById("cartItems");
    const total = document.getElementById("cartTotal");
    const items = getCartItems();

    if (!list || !total) {
        return;
    }

    if (!items.length) {
        renderEmpty("Sua sacola está vazia.");
        renderTotals();
        return;
    }

    list.innerHTML = items.map(({ product, quantity }) => {
        const id = getProductId(product);
        const available = stockAvailable(product);
        const unavailable = available <= 0;
        const exceedsStock = Number.isFinite(available) && quantity > available;

        return `
            <article class="cart-item">
                <img src="${escapeHtml(product.foto || "/images/products/petflow-prime-racao.jpg")}" alt="${escapeHtml(product.nome)}">
                <div>
                    <strong>${escapeHtml(product.nome)}</strong>
                    <span>${currency(product.preco)}</span>
                    ${unavailable ? '<small class="stock-message">Produto esgotado. Remova-o para continuar.</small>' : exceedsStock ? `<small class="stock-message">Somente ${available} unidade(s) disponível(is).</small>` : ""}
                </div>
                <input class="form-control" type="number" min="1" ${Number.isFinite(available) && available > 0 ? `max="${available}"` : ""} step="1" value="${quantity}" data-cart-quantity="${escapeHtml(id)}" aria-label="Quantidade" ${unavailable ? "disabled" : ""}>
                <button class="remove-button" type="button" data-cart-remove="${escapeHtml(id)}" aria-label="Remover item">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </article>
        `;
    }).join("");

    renderTotals();
}

function renderTotals() {
    document.getElementById("calculateShipping").hidden = Boolean(getToken());
    const items = getCartItems();
    const productsTotal = couponSubtotal ?? getCartTotal(items);
    const discount = appliedCoupon?.desconto || 0;
    const subtotal = Math.round((productsTotal - discount) * 100) / 100;
    const invalidStock = items.some(({ product, quantity }) => {
        const available = stockAvailable(product);
        return available <= 0 || (Number.isFinite(available) && quantity > available);
    });
    const stockStatus = document.getElementById("cartStockStatus");
    stockStatus.hidden = !invalidStock;
    stockStatus.textContent = invalidStock ? "Ajuste ou remova os itens sem estoque antes de comprar." : "";
    document.getElementById("cartProductsTotal").textContent = currency(productsTotal);
    document.getElementById("cartDiscount").textContent = discount ? `-${currency(discount)}` : currency(0);
    document.getElementById("cartItemCount").textContent = items.reduce((sum, item) => sum + item.quantity, 0);
    const savings = document.getElementById("cartSavings");
    savings.hidden = !discount;
    savings.textContent = `Você economizou ${currency(discount)}`;
    document.getElementById("appliedCoupon").hidden = !selectedCoupon;
    document.getElementById("appliedCouponCode").textContent = selectedCoupon;
    document.getElementById("cartSubtotal").textContent = currency(subtotal);
    document.getElementById("cartShippingRow").hidden = !shippingQuote;
    document.getElementById("cartTotalRow").hidden = !shippingQuote;
    document.getElementById("cartDeliveryPrompt").hidden = Boolean(shippingQuote);
    document.getElementById("cartShipping").textContent = shippingQuote ? (shippingQuote.valor === 0 ? "Grátis" : currency(shippingQuote.valor)) : "";
    document.getElementById("cartTotal").textContent = shippingQuote ? currency(subtotal + shippingQuote.valor) : "";
    document.querySelector("#cartForm button[type='submit']").disabled = submitting || couponLoading || invalidStock || !shippingQuote || !items.length;
    document.querySelector("#cartForm button[type='submit']").textContent = submitting ? "Criando pedido..." : (getToken() ? "Comprar" : "Entrar para comprar");
    document.querySelectorAll("[data-cart-quantity]").forEach(el => {
        const product = cartProducts.find(item => getProductId(item) === el.dataset.cartQuantity);
        el.disabled = submitting || stockAvailable(product) <= 0;
    });
    document.querySelectorAll("[data-cart-remove], #applyCoupon, #removeCoupon, [data-coupon-code]").forEach(el => { el.disabled = submitting; });
    document.querySelectorAll("#shippingForm input, #lookupCep").forEach(el => { el.disabled = submitting; });
}

async function refreshCoupons(codigo = selectedCoupon) {
    const revision = ++couponRevision;
    selectedCoupon = codigo;
    appliedCoupon = null;
    couponSubtotal = null;
    const status = document.getElementById("couponStatus");
    const availability = document.getElementById("couponAvailability");
    const list = document.getElementById("availableCoupons");
    list.replaceChildren();
    document.getElementById("couponCount").textContent = "0";
    const items = getCartItems();
    if (!getToken() || !items.length) {
        couponLoading = false;
        selectedCoupon = "";
        sessionStorage.removeItem("petflow_cart_coupon");
        status.textContent = "";
        availability.textContent = !getToken() ? "Entre para consultar seus cupons." : "Adicione produtos para consultar cupons.";
        renderTotals();
        return;
    }
    couponLoading = true;
    status.textContent = "Consultando cupons...";
    availability.textContent = "Verificando cupons para este pedido...";
    renderTotals();
    try {
        const response = await fetch(`${CART_API}/cupons/consultar`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify({ codigo, itens: items.map(({ product, quantity }) => ({ produto_id: product.id, quantidade: quantity })) })
        });
        const payload = await response.json();
        if (revision !== couponRevision) return;
        if (!response.ok) throw new Error(payload.message || "Não foi possível consultar cupons.");
        appliedCoupon = payload.data.cupom;
        selectedCoupon = appliedCoupon?.codigo || "";
        couponSubtotal = payload.data.produtos;
        const available = payload.data.disponiveis;
        document.getElementById("couponCount").textContent = available.length;
        availability.textContent = available.length
            ? `${available.length} ${available.length === 1 ? "cupom disponível" : "cupons disponíveis"} para este pedido`
            : "Nenhum cupom disponível para esta sacola. Você ainda pode digitar um código.";
        list.innerHTML = available.map(coupon => `<div class="coupon-option"><div><strong>${escapeHtml(coupon.codigo)}</strong><p>${escapeHtml(coupon.descricao)}</p><small>Economize ${currency(coupon.desconto)}${coupon.expiraEm ? ` · Até ${escapeHtml(new Date(coupon.expiraEm).toLocaleString("pt-BR"))}` : ""}</small></div><button class="btn-secondary" type="button" data-coupon-code="${escapeHtml(coupon.codigo)}">Usar</button></div>`).join("");
        status.textContent = appliedCoupon ? `Cupom aplicado: ${currency(appliedCoupon.desconto)} de desconto nos produtos.` : "Use um cupom por pedido. O frete é calculado separadamente.";
    } catch (error) {
        if (revision !== couponRevision) return;
        selectedCoupon = "";
        status.textContent = `${error.message || "Não foi possível consultar cupons."} Nenhum cupom aplicado.`;
        availability.textContent = "Tente consultar novamente pelo botão Aplicar.";
    } finally {
        if (revision === couponRevision) {
            couponLoading = false;
            sessionStorage.setItem("petflow_cart_coupon", selectedCoupon);
            renderTotals();
        }
    }
}

async function calculateShipping({ retry = 0 } = {}) {
    clearTimeout(automaticShippingTimer);
    if (submitting) return;
    const address = readDeliveryAddress();
    const button = document.getElementById("calculateShipping");
    const status = document.getElementById("shippingStatus");
    if (!hasDeliveryAddress(address) || !/^\d{8}$/.test(address.cep)) {
        status.textContent = "Confira o CEP e preencha o endereço e o número para consultar a entrega.";
        document.getElementById("shippingForm").reportValidity();
        return;
    }
    const revision = ++shippingRevision;
    shippingQuote = null;
    renderTotals();
    button.disabled = true;
    status.textContent = "Calculando o trajeto até seu endereço...";
    try {
        const response = await fetch(`${CART_API}/frete/cotar`, { method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
            body: JSON.stringify({ endereco: address }) });
        const payload = await response.json();
        if (revision !== shippingRevision) return;
        if (!response.ok) {
            if (response.status === 401) {
                customer = null;
                clearCartSession();
            }
            throw Object.assign(new Error(payload.message || "Não foi possível calcular o frete."), {
                status: response.status,
                retryAfter: Number(response.headers?.get("Retry-After")) || 60
            });
        }
        shippingQuote = payload.data;
        sessionStorage.setItem("petflow_delivery_address", JSON.stringify(address));
        status.textContent = `${(shippingQuote.distanciaMetros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} km pelas ruas — ${currency(shippingQuote.valor)}. Cotação válida por 15 minutos.`;
    } catch (error) {
        if (revision !== shippingRevision) return;
        status.textContent = error.message || "Não foi possível consultar a entrega. Tente novamente.";
        const canRetry = !error.status || error.status === 429 || error.status >= 500;
        if (customer && getToken() && retry === 0 && canRetry) {
            const seconds = error.status === 429 ? Math.min(300, Math.max(1, error.retryAfter)) : 10;
            status.textContent += ` Nova tentativa automática em ${seconds} segundos.`;
            automaticShippingTimer = setTimeout(() => {
                if (revision === shippingRevision && customer && getToken()) return calculateShipping({ retry: 1 });
            }, seconds * 1000);
        }
    }
    finally { if (revision === shippingRevision) { button.disabled = false; renderTotals(); } }
}

function readDeliveryAddress() {
    const address = Object.fromEntries(Object.entries(deliveryFields).map(([field, id]) => [field, document.getElementById(id).value.trim()]));
    address.cep = address.cep.replace(/\D/g, "");
    address.estado = address.estado.toUpperCase();
    return address;
}

function restoreDeliveryAddress() {
    let address = customer || {};
    try { address = JSON.parse(sessionStorage.getItem("petflow_delivery_address")) || address; } catch { /* Usa endereço salvo do cliente. */ }
    for (const [field, id] of Object.entries(deliveryFields)) document.getElementById(id).value = address[field] || "";
    renderTotals();
    if (customer && getToken() && hasDeliveryAddress(readDeliveryAddress())) return calculateShipping();
    if (customer && getToken()) document.getElementById("shippingStatus").textContent = "Complete o endereço para calcularmos a entrega automaticamente.";
}

function scheduleAutomaticShipping() {
    clearTimeout(automaticShippingTimer);
    const address = readDeliveryAddress();
    if (!customer || !getToken() || !hasDeliveryAddress(address) || !/^\d{8}$/.test(address.cep) || !/^[A-Z]{2}$/.test(address.estado)) return;
    document.getElementById("shippingStatus").textContent = "Atualizando a entrega para este endereço...";
    automaticShippingTimer = setTimeout(() => {
        if (customer && getToken()) return calculateShipping();
    }, 800);
}

function invalidateShipping() {
    clearTimeout(automaticShippingTimer);
    ++shippingRevision;
    shippingQuote = null;
    document.getElementById("calculateShipping").disabled = false;
    document.getElementById("shippingStatus").textContent = customer && getToken()
        ? "Complete o endereço para calcularmos a entrega automaticamente."
        : "Confira o endereço e consulte a entrega.";
    renderTotals();
}

async function lookupDeliveryCep() {
    if (submitting) return;
    clearTimeout(cepLookupTimer);
    const cep = document.getElementById("deliveryCep").value.replace(/\D/g, "");
    const status = document.getElementById("cepStatus");
    if (!/^\d{8}$/.test(cep)) { status.textContent = "Informe um CEP com 8 dígitos."; return; }
    cepLookupController?.abort();
    const controller = new AbortController();
    cepLookupController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const revision = ++cepRevision;
    status.textContent = "Buscando endereço...";
    try {
        const response = await fetch(`${CART_API}/frete/cep/${cep}`, { signal: controller.signal });
        const payload = await response.json();
        if (revision !== cepRevision) return;
        if (!response.ok) throw new Error(payload.message || "Não foi possível consultar o CEP.");
        for (const [field, id] of Object.entries(deliveryFields)) {
            if (field !== "numero" && field !== "complemento") document.getElementById(id).value = payload.data[field] || "";
        }
        invalidateShipping();
        sessionStorage.setItem("petflow_delivery_address", JSON.stringify(readDeliveryAddress()));
        status.textContent = payload.data.endereco ? "Endereço encontrado. Confira e informe o número." : "CEP encontrado. Complete a rua, o bairro e o número.";
        document.getElementById(payload.data.endereco ? "deliveryNumber" : "deliveryStreet").focus();
        scheduleAutomaticShipping();
    } catch (error) {
        if (revision === cepRevision) status.textContent = error.name === "AbortError"
            ? "A consulta demorou demais. Tente novamente ou preencha o endereço manualmente."
            : (error.message || "Preencha o endereço manualmente ou tente novamente.");
    } finally {
        clearTimeout(timeout);
        if (cepLookupController === controller) cepLookupController = null;
    }
}

function renderEmpty(message) {
    const list = document.getElementById("cartItems");

    if (!list) {
        return;
    }

    list.innerHTML = `
        <div class="empty-cart">
            <i class="fa-solid fa-bag-shopping"></i>
            <strong>Sua sacola está vazia.</strong>
            <p>${escapeHtml(message)}</p>
            <a class="btn-secondary" href="/#products">Ver produtos</a>
        </div>
    `;
}

async function renderCustomer() {
    clearTimeout(automaticShippingTimer);
    ++shippingRevision;
    shippingQuote = null;
    customer = null;
    document.getElementById("calculateShipping").disabled = false;
    const container = document.getElementById("cartCustomer");
    const submit = document.querySelector("#cartForm button[type='submit']");
    const token = getToken();

    if (!container || !submit) {
        return;
    }

    if (!token) {
        submit.disabled = true;
        container.innerHTML = `
            <div class="customer-card-inner is-warning">
                <strong>Calcule a entrega sem cadastro</strong>
                <p>Informe seu CEP abaixo. Você só precisa entrar na conta para comprar.</p>
                <a class="btn-secondary" href="/login" target="_top">Entrar ou cadastrar</a>
            </div>
        `;
        return;
    }

    try {
        customer = await fetchCustomerProfile();
        const addressComplete = hasDeliveryAddress(customer);
        const contact = [customer.telefone, customer.email].filter(Boolean).join(" - ");

        submit.disabled = true;
        document.getElementById("calculateShipping").disabled = false;
        document.getElementById("shippingStatus").textContent = "Confira o endereço abaixo para consultar a entrega.";
        container.innerHTML = `
            <div class="customer-card-inner ${addressComplete ? "" : "is-warning"}">
                <div>
                    <span>Cliente</span>
                    <strong>${escapeHtml(customer.nome || "Cliente PetFlow")}</strong>
                    <p>${escapeHtml(contact)}</p>
                </div>
                <a class="btn-secondary" href="/conta" target="_top">Editar meus dados</a>
            </div>
        `;
    } catch {
        clearCartSession();
        submit.disabled = true;
        container.innerHTML = `
            <div class="customer-card-inner is-warning">
                <strong>Sessão expirada</strong>
                <p>Você pode consultar a entrega abaixo e entrar novamente para comprar.</p>
                <a class="btn-secondary" href="/login" target="_top">Entrar novamente</a>
            </div>
        `;
    }
}

function clearCartSession() {
    selectedCoupon = "";
    appliedCoupon = null;
    couponSubtotal = null;
    sessionStorage.removeItem("petflow_cart_coupon");
    sessionStorage.removeItem("petflow_customer_token");
    sessionStorage.removeItem("petflow_customer_user");
    sessionStorage.removeItem("petflow_public_favorites");
    localStorage.removeItem("petflow_customer_token");
    localStorage.removeItem("petflow_customer_user");
    localStorage.removeItem("petflow_public_favorites");
    localStorage.removeItem("petflow_public_cart");
    persistCart();
}

async function submitOrder(event) {
    event.preventDefault();
    if (submitting || couponLoading) return;

    const status = document.getElementById("cartStatus");
    const token = getToken();
    const items = getCartItems();

    if (!items.length) {
        setStatus(status, "Adicione produtos antes de finalizar.");
        return;
    }

    const invalidStock = items.find(({ product, quantity }) => {
        const available = stockAvailable(product);
        return available <= 0 || (Number.isFinite(available) && quantity > available);
    });
    if (invalidStock) {
        setStatus(status, `O estoque de ${invalidStock.product.nome} mudou. Ajuste a sacola antes de finalizar.`);
        renderCart();
        return;
    }

    if (!token) {
        window.top.location.href = "/login";
        return;
    }

    if (!customer || !hasDeliveryAddress(readDeliveryAddress())) {
        setStatus(status, "Confira o endereço de entrega acima antes de finalizar.");
        return;
    }

    if (!shippingQuote || new Date(shippingQuote.expiraEm) <= new Date()) {
        shippingQuote = null;
        renderTotals();
        setStatus(status, "Calcule novamente o frete antes de pagar.");
        await calculateShipping();
        if (shippingQuote) setStatus(status, "Entrega atualizada. Confira o total e clique em Comprar para continuar.");
        return;
    }
    submitting = true;
    if (embeddedCart) window.parent.postMessage({ type: "petflow:cart-busy", busy: true }, location.origin);
    renderTotals();
    const data = Object.fromEntries(new FormData(event.target).entries());
    setStatus(status, "Finalizando pedido...");

    try {
        const response = await fetch(`${CART_API}/pedidos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                formaPagamento: "PAGBANK",
                freteToken: shippingQuote.token,
                enderecoEntrega: readDeliveryAddress(),
                cupomCodigo: appliedCoupon?.codigo || null,
                observacoes: data.observacoes,
                itens: items.map(({ product, quantity }) => ({
                    produto_id: product.id,
                    quantidade: quantity,
                    valor_unitario: Number(product.preco || 0)
                }))
            })
        });
        const payload = await response.json();

        if (!response.ok) {
            if (response.status === 409) shippingQuote = null;
            throw new Error(payload.message || "Não foi possível finalizar o pedido.");
        }

        cart = {};
        selectedCoupon = "";
        appliedCoupon = null;
        couponSubtotal = null;
        ++couponRevision;
        sessionStorage.removeItem("petflow_cart_coupon");
        persistCart();
        renderCart();
        event.target.reset();
        setStatus(status, "Pedido recebido. Abrindo checkout seguro do PagBank...");

        await startPayment(
            payload.payment?.vendaId ||
            payload.data?.id,
            token,
            status
        );
    } catch (error) {
        setStatus(status, error.message || "Não foi possível finalizar o pedido.");
    } finally {
        submitting = false;
        if (embeddedCart) window.parent.postMessage({ type: "petflow:cart-busy", busy: false }, location.origin);
        renderTotals();
    }
}

async function startPayment(vendaId, token, status) {
    if (!vendaId) {
        setStatus(
            status,
            "Pedido criado, mas não foi possível abrir o checkout do PagBank."
        );
        return;
    }

    try {
        const response = await fetch(`${CART_API}/pagamentos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                vendaId
            })
        });

        const payload = await response.json();

        if (!response.ok) {
            throw new Error(
                payload.message ||
                "Não foi possível abrir o checkout do PagBank."
            );
        }

        if (payload.payment?.checkoutUrl) {
            window.top.location.href = payload.payment.checkoutUrl;
            return;
        }

        setStatus(
            status,
            "Pedido criado. Acesse seus pedidos para acompanhar o pagamento."
        );
    } catch (error) {
        setStatus(
            status,
            error.message ||
            "Pedido criado, mas o checkout do PagBank não foi aberto."
        );
    }
}

async function fetchCustomerProfile() {
    const response = await fetch(`${CART_API}/clientes/me`, {
        headers: {
            Authorization: `Bearer ${getToken()}`
        }
    });
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload.message || "Cliente não autenticado.");
    }

    sessionStorage.setItem("petflow_customer_user", JSON.stringify(payload.data));
    window.PetFlowPublicHeader?.update();
    return payload.data;
}

function getCartItems() {
    return Object.entries(cart)
        .map(([id, quantity]) => {
            const product = cartProducts.find(item => getProductId(item) === String(id));

            return product
                ? { product, quantity: Math.max(1, Number(quantity || 1)) }
                : null;
        })
        .filter(Boolean);
}

function getCartTotal(items) {
    return items.reduce((sum, item) => sum + Number(item.product.preco || 0) * item.quantity, 0);
}

function getProductId(product) {
    return String(product.id || product.sku || product.nome);
}

function stockAvailable(product) {
    if (!product || product.estoque_disponivel == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor(Number(product.estoque_disponivel) || 0));
}

function readCart() {
    try {
        return JSON.parse(sessionStorage.getItem("petflow_public_cart") || "{}") || {};
    } catch {
        return {};
    }
}

function persistCart() {
    sessionStorage.setItem("petflow_public_cart", JSON.stringify(cart));
    window.PetFlowPublicHeader?.update();
    if (embeddedCart) window.parent.postMessage({ type: "petflow:cart-changed" }, location.origin);
}

function getToken() {
    return sessionStorage.getItem("petflow_customer_token");
}

function hasDeliveryAddress(data) {
    return Boolean(data?.endereco && data?.numero && data?.bairro && data?.cidade && data?.estado && data?.cep);
}

function formatAddress(data) {
    return [
        data.endereco,
        data.numero,
        data.complemento,
        data.bairro,
        data.cidade,
        data.estado
    ].filter(Boolean).join(", ");
}

function currency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function setStatus(element, message) {
    if (element) {
        element.textContent = message || "";
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
