"use strict";

(function setupPetFlowPublicHeader() {
    const HEADER_VERSION = "20261021-1";
    const DEFAULT_LOGO = "/images/logo/nacao-animal-logo-transparent.png";
    let storeInfoRequest;

    document.addEventListener("DOMContentLoaded", initPublicHeader);

    window.PetFlowPublicHeader = {
        init: initPublicHeader,
        update: updateHeaderState,
        clearSession: clearCustomerSession
    };

    function initPublicHeader() {
        ensureHeader();
        setupHeaderSearch();
        setupMenuToggle();
        setupStorefrontControls();
        updateHeaderState();
        return loadStoreBrand();
    }

    async function loadStoreBrand() {
        if (!storeInfoRequest) {
            storeInfoRequest = fetch("/api/public/loja")
                .then(async response => {
                    if (!response.ok) return {};
                    const payload = await response.json();
                    return payload.success !== false && payload.data && typeof payload.data === "object"
                        ? payload.data : {};
                })
                .catch(() => ({}));
        }

        const store = await storeInfoRequest;
        const name = typeof store.nome === "string" && store.nome.trim() ? store.nome.trim() : "Nação Animal";
        const label = document.querySelector(".public-header .logo-text");
        const logo = document.querySelector(".public-header .logo img");
        if (label) label.textContent = name;
        if (logo) {
            logo.alt = `Logo de ${name}`;
            logo.onerror = () => {
                logo.onerror = null;
                logo.src = DEFAULT_LOGO;
            };
            logo.src = safeStoreLogo(store.logo);
        }
    }

    function safeStoreLogo(value) {
        if (typeof value !== "string" || !value.trim()) return DEFAULT_LOGO;
        try {
            const url = new URL(value.trim(), window.location.href);
            const allowed = url.protocol === "https:" ||
                (url.protocol === "http:" && url.origin === window.location.origin);
            return allowed && !url.username && !url.password ? url.href : DEFAULT_LOGO;
        } catch {
            return DEFAULT_LOGO;
        }
    }

    function ensureHeader() {
        if (document.querySelector(".public-header")) {
            return;
        }

        const oldTopbar = document.querySelector(".category-topbar, .product-topbar, .service-topbar, .cart-topbar");

        if (oldTopbar) {
            oldTopbar.remove();
        }

        document.body.insertAdjacentHTML("afterbegin", headerTemplate());
    }

    function headerTemplate() {
        if (document.body?.classList?.contains("storefront-page")) return storefrontHeaderTemplate();
        return `
            <header class="header public-header" data-public-header="${HEADER_VERSION}">
                <div class="container">
                    <a class="logo" href="/#hero" aria-label="Ir para a página inicial">
                        <img src="/images/logo/nacao-animal-logo-transparent.png" alt="Logo da Nação Animal" width="60" height="60">
                        <span class="logo-text">Nação Animal</span>
                    </a>

                    <form class="search-form" data-public-header-search role="search" aria-label="Pesquisar produtos" autocomplete="off">
                        <label class="sr-only" for="publicHeaderSearch">Pesquisar produtos</label>
                        <input
                            class="form-control"
                            type="search"
                            id="publicHeaderSearch"
                            name="search"
                            placeholder="Buscar produtos"
                            maxlength="100"
                            aria-label="Pesquisar produtos">
                        <button class="search-button" type="submit" aria-label="Pesquisar"></button>
                    </form>

                    <nav class="menu" id="menu" aria-label="Menu principal">
                        <ul class="menu-list">
                            <li class="menu-item">
                                <a href="/#hero" class="menu-link" data-public-nav="home">Início</a>
                            </li>
                            <li class="menu-item">
                                <a href="/#categories" class="menu-link" data-public-nav="categories">Categorias</a>
                            </li>
                            <li class="menu-item">
                                <a href="/produtos" class="menu-link" data-public-nav="products">Produtos</a>
                            </li>
                            <li class="menu-item">

                            </li>
                            <li class="menu-item">
                                <a href="/#localizacao" class="menu-link" data-public-nav="contact">Contato</a>
                            </li>
                            <li class="menu-item menu-login-item">
                                <a href="/login" class="menu-link menu-login-link">Entrar</a>
                            </li>
                            <li class="menu-item menu-actions-item">
                                <a href="/#products" class="menu-action-link" aria-label="Abrir favoritos">
                                    <i class="fa-regular fa-heart"></i>
                                    Favoritos
                                </a>
                                <a href="/sacola" class="menu-action-link" aria-label="Abrir sacola">
                                    <i class="fa-solid fa-bag-shopping"></i>
                                    Sacola
                                </a>
                            </li>
                        </ul>
                    </nav>

                    <div class="header-actions">
                        <button
                            class="icon-badge customer-notification-button"
                            type="button"
                            aria-label="Notificações"
                            aria-expanded="false"
                            hidden>
                            <i class="fa-regular fa-bell"></i>
                        </button>

                        <a href="/#products" class="icon-badge" aria-label="Favoritos">
                            <i class="fa-regular fa-heart"></i>
                        </a>

                        <a href="/sacola" class="icon-badge" aria-label="Sacola">
                            <i class="fa-solid fa-bag-shopping"></i>
                        </a>

                        <a href="/login" class="btn btn-primary">Entrar</a>

                        <button
                            class="menu-toggle"
                            type="button"
                            aria-label="Abrir menu"
                            aria-controls="menu"
                            aria-expanded="false">
                        </button>
                    </div>
                </div>
            </header>
        `;
    }

    function storefrontIcon(name) {
        const paths = {
            search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
            cart: '<path d="M2 3h3l2.5 12h11L21 7H6"/><path d="M8 18h10"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
            menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
            close: '<path d="m6 6 12 12M18 6 6 18"/>',
            user: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>'
        };
        return `<svg class="storefront-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
    }

    function storefrontHeaderTemplate() {
        return `
            <header class="header public-header storefront-header" data-public-header="${HEADER_VERSION}">
                <div class="container">
                    <a class="logo" href="/#hero" aria-label="Ir para a página inicial">
                        <img src="${DEFAULT_LOGO}" alt="Logo da Nação Animal" width="175" height="175">
                        <span class="logo-text sr-only">Nação Animal</span>
                    </a>
                    <nav class="menu" id="menu" aria-label="Menu principal">
                        <ul class="menu-list">
                            <li class="menu-item"><a href="/#hero" class="menu-link" data-public-nav="home">Início</a></li>
                            <li class="menu-item"><a href="/sobre" class="menu-link" data-public-nav="about">Sobre</a></li>
                            <li class="menu-item"><a href="/produtos" class="menu-link" data-public-nav="products">Produtos</a></li>
                            <li class="menu-item"><a href="/servicos/dog-walker-pet-sitter" class="menu-link" data-public-nav="services">Serviços</a></li>
                            <li class="menu-item"><a href="/contato" class="menu-link" data-public-nav="contact">Contato</a></li>
                            <li class="menu-item menu-login-item"><a href="/login" class="menu-link menu-login-link" aria-label="Entrar ou cadastrar">${storefrontIcon("user")}<span data-customer-label>Entrar | Cadastrar</span></a></li>
                            <li class="menu-item menu-actions-item"><a href="/?favoritos=1#products" class="menu-action-link" aria-label="Abrir favoritos">Meus favoritos</a></li>
                        </ul>
                    </nav>
                    <div class="header-actions">
                        <button class="icon-badge customer-notification-button" type="button" aria-label="Notificações" aria-expanded="false" hidden><i class="fa-regular fa-bell" aria-hidden="true"></i></button>
                        <button class="storefront-search-toggle" type="button" aria-label="Abrir pesquisa" aria-controls="storefront-search" aria-expanded="false">${storefrontIcon("search")}</button>
                        <a class="icon-badge storefront-cart" href="/sacola" aria-label="Sacola" data-count="0">${storefrontIcon("cart")}</a>
                        <button class="menu-toggle" type="button" aria-label="Abrir menu" aria-controls="menu" aria-expanded="false">${storefrontIcon("menu")}</button>
                    </div>
                    <form class="search-form" id="storefront-search" data-public-header-search role="search" aria-label="Pesquisar produtos" autocomplete="off" hidden>
                        <label class="sr-only" for="publicHeaderSearch">Pesquisar produtos</label>
                        <input class="form-control" type="search" id="publicHeaderSearch" name="search" placeholder="O que seu pet precisa?" maxlength="100" aria-label="Pesquisar produtos">
                        <button class="search-button" type="submit" aria-label="Pesquisar">${storefrontIcon("search")}</button>
                        <button class="storefront-search-close" type="button" aria-label="Fechar pesquisa">${storefrontIcon("close")}</button>
                    </form>
                </div>
            </header>
        `;
    }

    function setupHeaderSearch() {
        const form = document.querySelector("[data-public-header-search]");
        const input = document.getElementById("publicHeaderSearch");

        if (!form || form.dataset.publicHeaderBound === "true") {
            return;
        }

        form.dataset.publicHeaderBound = "true";
        form.addEventListener("submit", event => {
            event.preventDefault();

            const query = String(input?.value || "").trim();
            const categorySearch = document.getElementById("categorySearch");

            if (categorySearch) {
                categorySearch.value = query;
                categorySearch.dispatchEvent(new Event("input", { bubbles: true }));
                document.getElementById("categoryProducts")?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

            window.location.href = query
                ? document.querySelector(".storefront-header")
                    ? `/?busca=${encodeURIComponent(query)}#products`
                    : `/#products?busca=${encodeURIComponent(query)}`
                : "/#products";
        });
    }

    function setupStorefrontControls() {
        const header = document.querySelector(".storefront-header");
        if (!header || header.dataset.storefrontBound === "true") return;
        header.dataset.storefrontBound = "true";
        const form = header.querySelector(".search-form");
        const input = document.getElementById("publicHeaderSearch");
        const toggle = header.querySelector(".storefront-search-toggle");
        const close = header.querySelector(".storefront-search-close");
        const menu = document.getElementById("menu");
        const menuToggle = header.querySelector(".menu-toggle");

        function closeSearch(returnFocus = false) {
            form.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
            if (returnFocus) toggle.focus();
        }

        function closeMenu(returnFocus = false) {
            menu?.classList.remove("active");
            menuToggle?.setAttribute("aria-expanded", "false");
            menuToggle?.setAttribute("aria-label", "Abrir menu");
            if (returnFocus) menuToggle?.focus();
        }

        toggle.addEventListener("click", () => {
            if (!form.hidden) return closeSearch(true);
            closeMenu();
            form.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
            input?.focus();
        });
        close.addEventListener("click", () => closeSearch(true));
        form.addEventListener("submit", () => closeSearch());
        menuToggle?.addEventListener("click", () => closeSearch());
        menu?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => closeMenu()));
        header.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            if (!form.hidden) {
                event.preventDefault();
                closeSearch(true);
            } else if (menu?.classList.contains("active")) {
                event.preventDefault();
                closeMenu(true);
            }
        });
        window.addEventListener("resize", () => {
            if (window.innerWidth > 992) closeMenu();
        });
    }

    function setupMenuToggle() {
        const button = document.querySelector(".public-header .menu-toggle");
        const menu = document.getElementById("menu");

        if (!button || button.dataset.publicHeaderBound === "true") {
            return;
        }

        button.dataset.publicHeaderBound = "true";
        button.addEventListener("click", () => {
            const willOpen = !menu?.classList.contains("active");

            menu?.classList.toggle("active", willOpen);
            button.setAttribute("aria-expanded", String(willOpen));
            button.setAttribute("aria-label", willOpen ? "Fechar menu" : "Abrir menu");
        });
    }

    function updateHeaderState() {
        updateActiveLink();
        updateCustomerLinks();
        updateHeaderCounters();
    }

    function updateActiveLink() {
        const path = window.location.pathname;

        document.querySelectorAll(".public-header .menu-link").forEach(link => {
            link.classList.remove("active");
        });

        if (path.startsWith("/categorias")) {
            setActive(document.querySelector(".storefront-header") ? "products" : "categories");
        } else if (path.startsWith("/produtos")) {
            setActive("products");
        } else if (path === "/servicos/dog-walker-pet-sitter") {
            setActive("services");
        } else if (path === "/sobre") {
            setActive("about");
        } else if (path === "/contato") {
            setActive("contact");
        } else if (path === "/") {
            setActive("home");
        }
    }

    function setActive(name) {
        document.querySelector(`.public-header [data-public-nav="${name}"]`)?.classList.add("active");
    }

    function updateCustomerLinks() {
        const token = getCustomerToken();
        const cached = readCustomerCache();
        const firstName = getFirstName(cached?.nome);
        const fullName = String(cached?.nome || "Cliente").trim();
        const notificationButton = document.querySelector(".public-header .customer-notification-button");

        if (notificationButton) {
            notificationButton.hidden = !token;
        }

        document.querySelectorAll(".public-header [data-public-logout]").forEach(link => link.remove());

        document.querySelectorAll(".public-header a[href='/login'], .public-header a[href='/conta'], .public-header .menu-login-link").forEach(link => {
            const label = link.querySelector("[data-customer-label]");
            if (token) {
                link.href = "/conta";
                (label || link).textContent = firstName;
                link.title = fullName;
                link.classList.add("is-authenticated");
                link.setAttribute("aria-label", "Abrir minha conta");
                insertLogoutLink(link);
                return;
            }

            link.href = "/login";
            (label || link).textContent = label ? "Entrar | Cadastrar" : "Entrar";
            link.removeAttribute("title");
            link.classList.remove("is-authenticated");
            link.setAttribute("aria-label", label ? "Entrar ou cadastrar" : "Entrar na conta");
        });
    }

    function insertLogoutLink(accountLink) {
        const logout = document.createElement("a");
        logout.href = "#";
        logout.className = accountLink.classList.contains("menu-login-link")
            ? "menu-link public-logout-link"
            : "btn public-logout-link";
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
        updateHeaderState();
        document.dispatchEvent(new CustomEvent("petflow:customer-logout"));
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
    }

    function updateHeaderCounters() {
        const cart = readJson("petflow_public_cart", {});
        const favorites = readJson("petflow_public_favorites", []);
        const cartCount = Object.values(cart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
        const favoritesCount = Array.isArray(favorites) ? favorites.length : 0;

        document.querySelectorAll(".public-header [aria-label='Sacola'], .public-header .menu-action-link[aria-label='Abrir sacola']").forEach(link => {
            link.dataset.count = String(cartCount);
            link.classList.toggle("has-count", cartCount > 0);
        });

        document.querySelectorAll(".public-header [aria-label='Favoritos'], .public-header .menu-action-link[aria-label='Abrir favoritos']").forEach(link => {
            link.dataset.count = String(favoritesCount);
            link.classList.toggle("has-count", favoritesCount > 0);
        });
    }

    function getCustomerToken() {
        return sessionStorage.getItem("petflow_customer_token");
    }

    function readCustomerCache() {
        return readJson("petflow_customer_user", null);
    }

    function readJson(key, fallback) {
        try {
            return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback));
        } catch {
            return fallback;
        }
    }

    function getFirstName(name) {
        const firstName = String(name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
        return firstName.length > 12 ? `${firstName.slice(0, 11)}...` : firstName;
    }
})();
