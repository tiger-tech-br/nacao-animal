"use strict";

document.addEventListener("DOMContentLoaded", () => {
    loadPublicCatalog();
    loadStoreInfo();
    setupPublicSearch();
    setupCartCheckout();
    setupFavoritesPanel();
    setupCustomerHeader();
    setupNewsletterForm();
});

const PUBLIC_API = "/api/public";

let publicProducts = [];
let publicCart = normalizeCartStorage();
let publicFavorites = new Set(JSON.parse(sessionStorage.getItem("petflow_public_favorites") || "[]"));
let publicCustomer = null;
let currentSearchTerm = "";

async function loadStoreInfo() {
    try {
        const response = await fetch(`${PUBLIC_API}/loja`);
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.success === false || !payload.data || typeof payload.data !== "object") return;
        const data = payload.data;
        updateStoreBrand(data);
        const address = [data.endereco, data.numero, data.complemento, data.bairro,
            data.cidade, data.estado, data.cep].filter(Boolean).join(", ");
        document.querySelectorAll("[data-store-name]").forEach(item => { item.textContent = data.nome || "Nação Animal"; });
        document.querySelectorAll("[data-store-phone]").forEach(item => { item.textContent = data.telefone || "Telefone não informado"; });
        document.querySelectorAll("[data-store-email]").forEach(item => { item.textContent = data.email || "E-mail não informado"; });
        document.querySelectorAll("[data-store-address]").forEach(item => { item.textContent = address || "Endereço não informado"; });
        document.querySelectorAll("[data-store-cnpj]").forEach(item => { item.textContent = data.cnpj ? `CNPJ ${data.cnpj}` : "CNPJ não informado"; });
    } catch {
        // O rodape permanece sem inventar dados quando a configuracao nao puder ser carregada.
    }
}

function updateStoreBrand(store) {
    const defaultLogo = "/images/logo/nacao-animal-logo-transparent.png";
    const name = typeof store.nome === "string" && store.nome.trim() ? store.nome.trim() : "Nação Animal";
    const label = document.querySelector(".header .logo-text");
    const logo = document.querySelector(".header .logo img");
    if (label) label.textContent = name;
    if (!logo) return;

    let source = defaultLogo;
    if (typeof store.logo === "string" && store.logo.trim()) {
        try {
            const url = new URL(store.logo.trim(), window.location.href);
            const allowed = url.protocol === "https:" ||
                (url.protocol === "http:" && url.origin === window.location.origin);
            if (allowed && !url.username && !url.password) source = url.href;
        } catch {
            // Mantém o logo local quando a configuração não é uma URL válida.
        }
    }
    logo.alt = `Logo de ${name}`;
    logo.onerror = () => {
        logo.onerror = null;
        logo.src = defaultLogo;
    };
    logo.src = source;
}

async function loadPublicCatalog() {
    const grid = document.querySelector(".products-grid");

    if (!grid) {
        return;
    }

    try {
        const response = await fetch(`${PUBLIC_API}/produtos`);

        if (!response.ok) {
            throw new Error("Catálogo indisponível");
        }

        const payload = await response.json();
        publicProducts = Array.isArray(payload.data) ? payload.data : [];

        if (publicProducts.length) {
            applyPublicSearch(getSearchValue(), false);
            updateHeaderCounters();
            return;
        }

        grid.innerHTML = '<div class="public-empty">Nenhum produto ativo foi cadastrado ainda.</div>';
    } catch {
        publicProducts = [];
        grid.innerHTML = '<div class="public-empty">Não foi possível carregar os produtos. Atualize a página em alguns instantes.</div>';
    }
}

function productSlug(product) {
    return normalize(product.sku || product.nome || product.id)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function setupPublicSearch() {
    const form = document.querySelector(".search-form");
    const input = document.getElementById("search");

    if (!form || !input) {
        return;
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        applyPublicSearch(input.value, true);
    });

    input.addEventListener("input", () => {
        applyPublicSearch(input.value, false);
    });
}

function getSearchValue() {
    return document.getElementById("search")?.value || "";
}

function setupNewsletterForm() {
    const form = document.getElementById("newsletterForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const status = document.getElementById("newsletterStatus");
        const button = form.querySelector("button[type='submit']");
        const data = Object.fromEntries(new FormData(form).entries());

        setNewsletterStatus(status, "Enviando inscrição...");
        if (button) button.disabled = true;

        try {
            const response = await fetch(`${PUBLIC_API}/newsletter`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.message || "Não foi possível realizar a inscrição.");
            }

            form.reset();
            setNewsletterStatus(status, payload.message || "Inscrição realizada com sucesso.");
        } catch (error) {
            setNewsletterStatus(status, error.message || "Não foi possível realizar a inscrição.");
        } finally {
            if (button) button.disabled = false;
        }
    });
}

function setNewsletterStatus(element, message) {
    if (element) {
        element.textContent = message || "";
    }
}

function filterProducts(term) {
    const normalized = normalize(term);

    if (!normalized) {
        renderProducts(publicProducts.slice(0, 6));
        return;
    }

    const matches = publicProducts.filter(product => {
        return [
            product.nome,
            product.descricao,
            product.categoria,
            product.marca,
            product.fornecedor,
            product.sku
        ].some(value => normalize(value).includes(normalized));
    });

    renderProducts(matches, {
        emptyMessage: "Nenhum produto encontrado para essa busca."
    });
}

function applyPublicSearch(term, shouldScroll) {
    const normalized = normalize(term);
    currentSearchTerm = term || "";

    if (!normalized) {
        renderProducts(publicProducts.slice(0, 6));
        filterStaticCards(".category-card", "");
        return;
    }

    filterProducts(term);
    filterStaticCards(".category-card", normalized);

    if (shouldScroll) {
        document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
    }
}

function filterStaticCards(selector, normalizedTerm) {
    document.querySelectorAll(selector).forEach(card => {
        const text = normalize(card.textContent);
        card.hidden = Boolean(normalizedTerm) && !text.includes(normalizedTerm);
    });
}

function renderProducts(products, options = {}) {
    const grid = document.querySelector(".products-grid");

    if (!grid) {
        return;
    }

    if (!products.length) {
        grid.innerHTML = `<div class="public-empty">${options.emptyMessage || "Nenhum produto disponível no momento."}</div>`;
        return;
    }

    grid.innerHTML = products.map(product => {
        const id = product.id || product.sku || product.nome;
        const inCart = Boolean(publicCart[String(id)]);
        const favorite = publicFavorites.has(String(id));
        const href = `/produtos/${productSlug(product)}`;
        const available = stockAvailable(product);

        return `
            <article class="product-card" data-product-card data-id="${escapeHtml(id)}">
                <a class="product-link" href="${escapeHtml(href)}" aria-label="Ver produto ${escapeHtml(product.nome)}">
                    <img class="product-image" src="${escapeHtml(product.foto || "/images/products/petflow-prime-racao.jpg")}" alt="${escapeHtml(product.nome)}" loading="lazy" decoding="async">
                </a>
                <div class="product-content">
                    <span class="product-category">${escapeHtml(product.categoria || "Nação Animal")}</span>
                    <h3 class="product-title"><a href="${escapeHtml(href)}">${escapeHtml(product.nome)}</a></h3>
                    <p class="product-description">${escapeHtml(product.descricao || "Produto selecionado para cuidar melhor do seu pet.")}</p>
                    <div class="product-footer">
                        <strong class="product-price">${currency(product.preco)}</strong>
                        <div class="cart-actions" aria-label="Ações da sacola">
                            <button class="cart-action add ${inCart ?"is-active" : ""}" type="button" data-action="toggle-cart" ${available <= 0 ? "disabled" : ""}>
                                <i class="fa-solid ${available <= 0 ? "fa-ban" : inCart ?"fa-check" : "fa-plus"}"></i>
                                <span>${available <= 0 ? "Esgotado" : inCart ?"Na sacola" : "Adicionar à sacola"}</span>
                            </button>
                            <button class="cart-action favorite ${favorite ?"is-active" : ""}" type="button" data-action="toggle-favorite">
                                <i class="fa-${favorite ?"solid" : "regular"} fa-heart"></i>
                                <span>${favorite ?"Favorito" : "Favoritar"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    if (options.emptyMessage) {
        grid.insertAdjacentHTML("afterbegin", `<div class="public-empty">${escapeHtml(options.emptyMessage)}</div>`);
    }

    bindProductActions();
}

function bindProductActions() {
    document.querySelectorAll("[data-action='toggle-cart']").forEach(button => {
        if (button.dataset.boundAction === "true") {
            return;
        }

        button.dataset.boundAction = "true";
        button.addEventListener("click", () => {
            const id = button.closest("[data-product-card]")?.dataset.id;

            if (!id) {
                return;
            }

            toggleCartProduct(id);
            persistPublicState();
            syncProductButtons();
        });
    });

    document.querySelectorAll("[data-action='toggle-favorite']").forEach(button => {
        if (button.dataset.boundAction === "true") {
            return;
        }

        button.dataset.boundAction = "true";
        button.addEventListener("click", () => {
            const id = button.closest("[data-product-card]")?.dataset.id;

            if (!id) {
                return;
            }

            toggleSet(publicFavorites, id);
            persistPublicState();
            syncProductButtons();
        });
    });
}

function syncProductButtons() {
    document.querySelectorAll("[data-product-card]").forEach(card => {
        const id = card.dataset.id;
        const inCart = Boolean(publicCart[String(id)]);
        const favorite = publicFavorites.has(String(id));
        const cartButton = card.querySelector("[data-action='toggle-cart']");
        const favoriteButton = card.querySelector("[data-action='toggle-favorite']");
        const product = publicProducts.find(item => String(item.id || item.sku || item.nome) === String(id));
        const available = stockAvailable(product);

        if (cartButton) {
            const unavailable = available <= 0;
            cartButton.disabled = unavailable;
            cartButton.classList.toggle("is-active", inCart);
            cartButton.innerHTML = `
                <i class="fa-solid ${unavailable ? "fa-ban" : inCart ? "fa-check" : "fa-plus"}"></i>
                <span>${unavailable ? "Esgotado" : inCart ? "Na sacola" : "Adicionar à sacola"}</span>
            `;
        }

        if (favoriteButton) {
            favoriteButton.classList.toggle("is-active", favorite);
            favoriteButton.innerHTML = `
                <i class="fa-${favorite ? "solid" : "regular"} fa-heart"></i>
                <span>${favorite ? "Favorito" : "Favoritar"}</span>
            `;
        }
    });
}

function currentVisibleProducts() {
    const visibleIds = [...document.querySelectorAll("[data-product-card]")].map(card => card.dataset.id);
    const products = publicProducts.filter(product => visibleIds.includes(String(product.id || product.sku || product.nome)));

    if (products.length) {
        return products;
    }

    const normalized = normalize(currentSearchTerm);

    if (normalized) {
        return publicProducts.filter(product => {
            return [
                product.nome,
                product.descricao,
                product.categoria,
                product.marca,
                product.fornecedor,
                product.sku
            ].some(value => normalize(value).includes(normalized));
        });
    }

    return publicProducts.slice(0, 6);
}

function toggleSet(set, value) {
    if (set.has(String(value))) {
        set.delete(String(value));
        return;
    }

    set.add(String(value));
}

function toggleCartProduct(id) {
    const key = String(id);

    if (publicCart[key]) {
        delete publicCart[key];
        return;
    }

    publicCart[key] = 1;
}

function persistPublicState() {
    sessionStorage.setItem("petflow_public_cart", JSON.stringify(publicCart));
    sessionStorage.setItem("petflow_public_favorites", JSON.stringify([...publicFavorites]));
    updateHeaderCounters();
    renderFavoritesItems();
}

function updateHeaderCounters() {
    const cartCount = Object.values(publicCart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);

    document.querySelectorAll("[aria-label='Sacola']").forEach(link => {
        link.dataset.count = String(cartCount);
        link.classList.toggle("has-count", cartCount > 0);
    });

    document.querySelectorAll("[aria-label='Favoritos'], .menu-action-link[aria-label='Abrir favoritos']").forEach(link => {
        link.dataset.count = String(publicFavorites.size);
        link.classList.toggle("has-count", publicFavorites.size > 0);
    });
}

function setupFavoritesPanel() {
    injectFavoritesPanel();

    document.querySelectorAll("[aria-label='Favoritos'], .menu-action-link[aria-label='Abrir favoritos']").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            openFavoritesPanel();
        });
    });

    document.addEventListener("click", event => {
        if (event.target.closest("[data-favorites-close]")) {
            closeFavoritesPanel();
        }

        if (event.target.classList.contains("favorites-overlay")) {
            closeFavoritesPanel();
        }

        const remove = event.target.closest("[data-favorite-remove]");
        if (remove) {
            publicFavorites.delete(remove.dataset.favoriteRemove);
            persistPublicState();
            renderProducts(currentVisibleProducts());
        }

        const addCart = event.target.closest("[data-favorite-add-cart]");
        if (addCart && !addCart.disabled) {
            const product = publicProducts.find(item => String(item.id || item.sku || item.nome) === addCart.dataset.favoriteAddCart);
            if (stockAvailable(product) <= 0) return;
            publicCart[addCart.dataset.favoriteAddCart] = 1;
            persistPublicState();
            renderProducts(currentVisibleProducts());
        }
    });
}

function injectFavoritesPanel() {
    if (document.querySelector(".favorites-overlay")) {
        return;
    }

    document.body.insertAdjacentHTML("beforeend", `
        <div class="favorites-overlay" hidden>
            <aside class="favorites-panel" role="dialog" aria-modal="true" aria-labelledby="favoritesTitle">
                <header class="checkout-header">
                    <div>
                        <span>Favoritos</span>
                        <h2 id="favoritesTitle">Produtos salvos</h2>
                    </div>
                    <button class="icon-badge" type="button" data-favorites-close aria-label="Fechar favoritos">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>
                <div class="favorites-items" id="favoritesItems"></div>
            </aside>
        </div>
    `);
}

function openFavoritesPanel() {
    const overlay = document.querySelector(".favorites-overlay");

    if (!overlay) {
        return;
    }

    renderFavoritesItems();
    overlay.hidden = false;
    document.body.classList.add("favorites-open");
}

function closeFavoritesPanel() {
    const overlay = document.querySelector(".favorites-overlay");

    if (overlay) {
        overlay.hidden = true;
    }

    document.body.classList.remove("favorites-open");
}

function renderFavoritesItems() {
    const list = document.getElementById("favoritesItems");

    if (!list) {
        return;
    }

    const items = getFavoriteProducts();

    if (!items.length) {
        list.innerHTML = `
            <div class="public-empty">
                <strong>Nenhum favorito ainda.</strong>
                <p>Toque no coração dos produtos para salvar o que gostou.</p>
                <a class="btn btn-secondary" href="#products" data-favorites-close>Ver produtos</a>
            </div>
        `;
        return;
    }

    list.innerHTML = items.map(product => {
        const id = String(product.id || product.sku || product.nome);
        const inCart = Boolean(publicCart[id]);
        const available = stockAvailable(product);

        return `
            <article class="favorite-item">
                <img src="${escapeHtml(product.foto || "/images/products/petflow-prime-racao.jpg")}" alt="${escapeHtml(product.nome)}">
                <div>
                    <strong>${escapeHtml(product.nome)}</strong>
                    <span>${currency(product.preco)}</span>
                </div>
                <button class="cart-action add ${inCart ? "is-active" : ""}" type="button" data-favorite-add-cart="${escapeHtml(id)}" ${available <= 0 ? "disabled" : ""}>
                    <i class="fa-solid ${available <= 0 ? "fa-ban" : inCart ? "fa-check" : "fa-plus"}"></i>
                    <span>${available <= 0 ? "Esgotado" : inCart ? "Na sacola" : "Sacola"}</span>
                </button>
                <button class="icon-badge" type="button" data-favorite-remove="${escapeHtml(id)}" aria-label="Remover dos favoritos">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </article>
        `;
    }).join("");
}

function getFavoriteProducts() {
    return [...publicFavorites]
        .map(id => publicProducts.find(product => String(product.id || product.sku || product.nome) === String(id)))
        .filter(Boolean);
}

function stockAvailable(product) {
    if (!product || product.estoque_disponivel == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, Number(product.estoque_disponivel) || 0);
}

function setupCartCheckout() {
    document.addEventListener("petflow:cart-changed", () => {
        publicCart = normalizeCartStorage();
        updateHeaderCounters();
        syncProductButtons();
        renderFavoritesItems();
    });
}

function injectCheckoutModal() {
    if (document.querySelector(".checkout-overlay")) {
        return;
    }

    document.body.insertAdjacentHTML("beforeend", `
        <div class="checkout-overlay" hidden>
            <aside class="checkout-panel" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle">
                <header class="checkout-header">
                    <div>
                        <span>Sacola Nação Animal</span>
                        <h2 id="checkoutTitle">Finalizar pedido</h2>
                    </div>
                    <button class="icon-badge" type="button" data-cart-close aria-label="Fechar sacola">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>
                <div class="checkout-items" id="checkoutItems"></div>
                <form class="checkout-form" id="checkoutForm">
                    <div class="checkout-alert" id="checkoutCustomer"></div>
                    <label>Observações<textarea class="form-control" name="observacoes" placeholder="Ex: entregar à tarde"></textarea></label>
                    <div class="checkout-total">
                        <span>Total</span>
                        <strong id="checkoutTotal">R$ 0,00</strong>
                    </div>
                    <button class="btn btn-primary" type="submit">Finalizar pedido</button>
                    <p class="checkout-status" id="checkoutStatus" role="status"></p>
                </form>
            </aside>
        </div>
    `);
}
function openCheckoutModal() {
    window.PetFlowCart?.open();
}

function closeCheckoutModal() {
    const overlay = document.querySelector(".checkout-overlay");

    if (overlay) {
        overlay.hidden = true;
    }

    document.body.classList.remove("checkout-open");
}

function renderCheckoutItems() {
    const list = document.getElementById("checkoutItems");
    const total = document.getElementById("checkoutTotal");

    if (!list || !total) {
        return;
    }

    const items = getCartProducts();

    if (!items.length) {
        list.innerHTML = `<div class="public-empty">Sua sacola está vazia.</div>`;
        total.textContent = currency(0);
        return;
    }

    list.innerHTML = items.map(({ product, quantity }) => `
        <article class="checkout-item">
            <img src="${escapeHtml(product.foto || "/images/products/petflow-prime-racao.jpg")}" alt="${escapeHtml(product.nome)}">
            <div>
                <strong>${escapeHtml(product.nome)}</strong>
                <span>${currency(product.preco)}</span>
            </div>
            <input class="form-control" type="number" min="1" step="1" value="${quantity}" data-cart-quantity="${escapeHtml(product.id)}" aria-label="Quantidade">
            <button class="icon-badge" type="button" data-cart-remove="${escapeHtml(product.id)}" aria-label="Remover item">
                <i class="fa-solid fa-trash"></i>
            </button>
        </article>
    `).join("");

    total.textContent = currency(items.reduce((sum, item) => sum + Number(item.product.preco || 0) * item.quantity, 0));
}

function getCartProducts() {
    return Object.entries(publicCart)
        .map(([id, quantity]) => {
            const product = publicProducts.find(item => String(item.id || item.sku || item.nome) === String(id));

            return product
                ?{ product, quantity: Math.max(1, Number(quantity || 1)) }
                : null;
        })
        .filter(Boolean);
}

async function submitPublicOrder(event) {
    event.preventDefault();

    const status = document.getElementById("checkoutStatus");
    const form = event.target;
    const items = getCartProducts();
    const token = getCustomerToken();

    if (!items.length) {
        if (status) status.textContent = "Adicione produtos antes de finalizar.";
        return;
    }

    if (!token) {
        if (status) status.textContent = "Entre na sua conta para finalizar o pedido.";
        renderCheckoutCustomer();
        return;
    }

    if (!publicCustomer || !hasDeliveryAddress(publicCustomer)) {
        if (status) status.textContent = "Atualize seu endereço antes de finalizar.";
        renderCheckoutCustomer();
        return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (status) status.textContent = "Enviando pedido...";

    try {
        const response = await fetch(`${PUBLIC_API}/pedidos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                formaPagamento: "PAGBANK",
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
            if (response.status === 401) {
                clearCustomerSession();
                setupCustomerHeader();
            }

            throw new Error(payload.message || "Não foi possível enviar o pedido.");
        }

        if (status) {
            status.textContent = "Pedido recebido. Abrindo pagamento seguro...";
        }

        const paymentStarted = await startPublicPayment(
            payload.payment?.vendaId ||
            payload.data?.id,
            token,
            status
        );

        if (paymentStarted) {
            publicCart = {};
            persistPublicState();
            renderProducts(currentVisibleProducts());
            renderCheckoutItems();
            form.reset();
        }
    } catch (error) {
        if (status) {
            status.textContent = error.message || "Não foi possível enviar o pedido.";
        }
    }
}

async function startPublicPayment(vendaId, token, status) {
    if (!vendaId) {
        if (status) {
            status.textContent =
                "Pedido criado, mas não foi possível iniciar o pagamento.";
        }
        return false;
    }

    try {
        const response = await fetch(`${PUBLIC_API}/pagamentos`, {
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
                "Não foi possível iniciar o pagamento."
            );
        }

        if (payload.payment?.checkoutUrl) {
            window.location.href = payload.payment.checkoutUrl;
            return true;
        }

        if (status) {
            status.textContent =
                "Pedido criado. Acesse seus pedidos para acompanhar o pagamento.";
        }
        return false;
    } catch (error) {
        if (status) {
            status.textContent =
                friendlyPaymentError(error.message) ||
                "Pedido criado, mas o pagamento não foi iniciado.";
        }
        return false;
    }
}

function friendlyPaymentError(message) {
    const text = String(message || "");

    if (text.toLowerCase().includes("allowlist")) {
        return "O PagBank bloqueou este checkout porque a conta ainda precisa de liberação para usar a API em produção. O pedido foi criado, mas o pagamento não foi aberto.";
    }

    return text;
}

function setupCustomerHeader() {
    const token = getCustomerToken();
    const cached = readCustomerCache();
    const firstName = getFirstName(cached?.nome);
    const fullName = String(cached?.nome || "Cliente").trim();
    const notificationButton = document.querySelector(".customer-notification-button");

    if (notificationButton) {
        notificationButton.hidden = !token;
    }

    document.querySelectorAll("[data-public-logout]").forEach(link => link.remove());

    document.querySelectorAll("a[href='/login'], a[href='/conta'], .menu-login-link").forEach(link => {
        if (token) {
            link.href = "/conta";
            link.textContent = firstName;
            link.title = fullName;
            link.classList.add("is-authenticated");
            link.setAttribute("aria-label", "Abrir minha conta");
            insertLogoutLink(link);
            return;
        }

        link.href = "/login";
        link.textContent = "Entrar";
        link.removeAttribute("title");
        link.classList.remove("is-authenticated");
        link.setAttribute("aria-label", "Entrar na conta");
    });

    window.PetFlowNotifications?.refresh();
}

function closeCustomerNotifications() { window.PetFlowNotifications?.close(); }

function insertLogoutLink(accountLink) {
    const logout = document.createElement("a");
    logout.href = "#";
    logout.className = accountLink.classList.contains("menu-login-link")
        ? "menu-link public-logout-link"
        : "btn btn-secondary public-logout-link";
    logout.dataset.publicLogout = "true";
    logout.textContent = "Sair";
    logout.setAttribute("aria-label", "Sair da conta");
    logout.addEventListener("click", handleCustomerLogout);
    accountLink.insertAdjacentElement("afterend", logout);
}

function handleCustomerLogout(event) {
    event.preventDefault();
    const token = sessionStorage.getItem("petflow_customer_token") || localStorage.getItem("petflow_customer_token");
    if (token) {
        fetch("/api/public/clientes/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true
        }).catch(() => {});
    }
    clearCustomerSession();
    closeCustomerNotifications();
    setupCustomerHeader();
    syncProductButtons();
    renderFavoritesItems();
    renderCheckoutItems();
    renderCheckoutCustomer();
}

function clearCustomerSession() {
    sessionStorage.removeItem("petflow_customer_token");
    sessionStorage.removeItem("petflow_customer_user");
    sessionStorage.removeItem("petflow_public_favorites");
    sessionStorage.removeItem("petflow_public_cart");
    localStorage.removeItem("petflow_customer_token");
    localStorage.removeItem("petflow_customer_user");
    localStorage.removeItem("petflow_public_favorites");
    localStorage.removeItem("petflow_public_cart");
    publicCustomer = null;
    publicFavorites = new Set();
    publicCart = {};
    updateHeaderCounters();
}

function getFirstName(name) {
    const firstName = String(name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
    return firstName.length > 12 ? `${firstName.slice(0, 11)}...` : firstName;
}

async function renderCheckoutCustomer() {
    const container = document.getElementById("checkoutCustomer");
    const submit = document.querySelector("#checkoutForm button[type='submit']");

    if (!container || !submit) {
        return;
    }

    const token = getCustomerToken();

    if (!token) {
        submit.disabled = true;
        container.innerHTML = `
            <div class="checkout-account-card is-warning">
                <strong>Entre para finalizar</strong>
                <p>É necessário entrar na sua conta antes de finalizar o pedido.</p>
                <div class="checkout-account-actions">
                    <a class="btn btn-primary" href="/login">Entrar ou cadastrar</a>
                </div>
            </div>
        `;
        return;
    }

    try {
        publicCustomer = await fetchCustomerProfile();
        const addressComplete = hasDeliveryAddress(publicCustomer);

        submit.disabled = !addressComplete;

        if (addressComplete) {
            container.innerHTML = "";
            return;
        }

        container.innerHTML = `
            <div class="checkout-account-card is-warning">
                <strong>Endereço incompleto</strong>
                <p>Atualize seu endereço na área do cliente antes de finalizar.</p>
                <div class="checkout-account-actions">
                    <a class="btn btn-secondary" href="/conta">Editar meus dados</a>
                </div>
            </div>
        `;
    } catch {
        clearCustomerSession();
        submit.disabled = true;
        container.innerHTML = `
            <div class="checkout-account-card is-warning">
                <strong>Sessão expirada</strong>
                <p>Entre novamente para finalizar seu pedido.</p>
                <div class="checkout-account-actions">
                    <a class="btn btn-primary" href="/login">Entrar novamente</a>
                </div>
            </div>
        `;
        setupCustomerHeader();
    }
}

async function fetchCustomerProfile() {
    const response = await fetch(`${PUBLIC_API}/clientes/me`, {
        headers: {
            Authorization: `Bearer ${getCustomerToken()}`
        }
    });
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload.message || "Cliente não autenticado.");
    }

    sessionStorage.setItem("petflow_customer_user", JSON.stringify(payload.data));
    return payload.data;
}

function getCustomerToken() {
    return sessionStorage.getItem("petflow_customer_token");
}

function readCustomerCache() {
    try {
        return JSON.parse(sessionStorage.getItem("petflow_customer_user") || "null");
    } catch {
        return null;
    }
}

function hasDeliveryAddress(customer) {
    return Boolean(customer?.endereco && customer?.numero && customer?.bairro && customer?.cidade && customer?.estado);
}

function formatNotificationDate(value) {
    if (!value) {
        return "";
    }

    return new Date(value).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}
function normalizeCartStorage() {
    try {
        const stored = JSON.parse(sessionStorage.getItem("petflow_public_cart") || "{}");

        if (Array.isArray(stored)) {
            return Object.fromEntries(stored.map(id => [String(id), 1]));
        }

        return stored && typeof stored === "object" ?stored : {};
    } catch {
        return {};
    }
}

function currency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
