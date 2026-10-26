"use strict";

const CATEGORY_API = "/api/public";

const TAXONOMY = window.NacaoCatalogTaxonomy;
const CATEGORY_CONFIG = {
    favoritos: {
        title: "Meus favoritos",
        description: "Reencontre os produtos que você gostou. Seus favoritos ficam salvos durante esta sessão de navegação.",
        image: "/images/categories/accessories-cutout-v1.png",
        favoritesOnly: true
    },
    todas: {
        title: "Todos os produtos",
        description: "Explore o catálogo da Nação Animal e encontre o que seu melhor amigo precisa.",
        image: "/images/categories/accessories-cutout-v1.png",
        all: true
    },
    ...TAXONOMY.categories
};

let allProducts = [];
let publicFavorites = readFavorites();
let currentSlug = "caes";
let currentType = "";
let catalogFailed = false;

document.addEventListener("DOMContentLoaded", () => {
    setupCategoryPage();
});

document.addEventListener("petflow:customer-logout", () => {
    publicFavorites = new Set();
    applyFilters();
});

window.addEventListener("pageshow", event => {
    if (!event.persisted) return;
    publicFavorites = readFavorites();
    applyFilters();
    window.PetFlowPublicHeader?.update();
});

window.addEventListener("popstate", () => {
    currentSlug = getCurrentSlug();
    currentType = getCurrentType();
    const config = CATEGORY_CONFIG[currentSlug];
    if (!config) {
        renderUnknownCategory();
        return;
    }
    const toolbar = document.getElementById("categoryToolbar");
    const filter = document.getElementById("categoryFilter");
    if (toolbar) toolbar.hidden = false;
    if (filter) filter.value = currentSlug;
    renderCategoryHeader(config);
    applyFilters();
});

async function setupCategoryPage() {
    catalogFailed = false;
    currentSlug = getCurrentSlug();
    currentType = getCurrentType();
    const config = CATEGORY_CONFIG[currentSlug];
    if (!config) {
        renderUnknownCategory();
        return;
    }
    renderCategoryHeader(config);
    setupToolbar();

    try {
        const response = await fetch(`${CATEGORY_API}/produtos`);
        const payload = await response.json();

        if (!response.ok || payload.success === false || !Array.isArray(payload.data)) {
            throw new Error(payload.message || "Produtos indisponíveis.");
        }

        allProducts = payload.data;
        applyFilters();
    } catch (error) {
        catalogFailed = true;
        renderEmpty(error.message || "Não foi possível carregar os produtos.", config.favoritesOnly ? "Não foi possível carregar seus favoritos" : "Não foi possível carregar a seleção");
        setText("categoryResults", "Catálogo indisponível no momento.");
    } finally {
        document.getElementById("categoryProducts")?.setAttribute("aria-busy", "false");
    }
}

function setupToolbar() {
    const search = document.getElementById("categorySearch");
    const filter = document.getElementById("categoryFilter");
    const toolbar = document.getElementById("categoryToolbar");
    const sort = document.getElementById("categorySort");

    if (filter) {
        filter.value = currentSlug;
        filter.addEventListener("change", () => {
            if (!CATEGORY_CONFIG[filter.value]) return;
            currentSlug = filter.value;
            currentType = "";
            renderCategoryHeader(CATEGORY_CONFIG[currentSlug]);
            updateUrl(currentSlug);
            applyFilters();
        });
    }

    search?.addEventListener("input", applyFilters);
    sort?.addEventListener("change", applyFilters);
    toolbar?.addEventListener("submit", event => {
        event.preventDefault();
        applyFilters();
    });
}

function applyFilters() {
    const config = CATEGORY_CONFIG[currentSlug];
    if (!config) return;
    if (catalogFailed) {
        renderEmpty("Atualize a página para tentar carregar os produtos novamente.", "Catálogo indisponível no momento");
        setText("categoryResults", "Catálogo indisponível no momento.");
        return;
    }
    const query = normalize(document.getElementById("categorySearch")?.value || "");
    const selection = filterByPetCategory(allProducts, config);
    const categoryProducts = currentType ? selection.filter(product => TAXONOMY.getProductSubcategory(product) === currentType) : selection;
    const matches = query ? filterBySearch(categoryProducts, query) : categoryProducts;
    const products = sortProducts(matches, document.getElementById("categorySort")?.value || "default");

    renderProducts(products, config, query);
}

function sortProducts(products, sort) {
    const sorted = [...products];
    if (sort === "price-asc") sorted.sort((a, b) => Number(a.preco || 0) - Number(b.preco || 0));
    else if (sort === "price-desc") sorted.sort((a, b) => Number(b.preco || 0) - Number(a.preco || 0));
    else if (sort === "name") sorted.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", { sensitivity: "base" }));
    return sorted;
}

function renderCategoryHeader(config, preserveTypeLinks = false) {
    const type = config.subcategories?.find(item => item.slug === currentType);
    document.title = `Nação Animal | ${type ? `${config.label} - ${type.label}` : config.title}`;
    setText("categoryTitle", config.title);
    setText("categoryDescription", config.description);
    setText("categoryBreadcrumb", type ? `${config.label} › ${type.label}` : config.title);
    setText("productsTitle", type?.label || (config.favoritesOnly ? "Produtos salvos" : config.all ? "Catálogo completo" : "Produtos da categoria"));
    renderSubcategories(config, preserveTypeLinks);
    setText("categoryEyebrow", currentSlug === "jardinagem" ? "Um carinho para suas plantas" : "Um carinho para cada pet");
    setText("categorySearchLabel", currentSlug === "jardinagem" ? "O que suas plantas precisam?" : "O que você procura?");
    const paw = document.getElementById("categoryPaw");
    if (paw) {
        paw.classList.toggle("is-gardening", currentSlug === "jardinagem");
        paw.innerHTML = `<i class="fa-solid fa-${currentSlug === "jardinagem" ? "seedling" : "paw"}"></i>`;
    }
    const search = document.getElementById("categorySearch");
    if (search) search.placeholder = config.favoritesOnly ? "Buscar nos favoritos" : config.all ? "Buscar no catálogo" : "Buscar nesta categoria";
    document.querySelectorAll("[data-category-link]").forEach(link => {
        if (link.dataset.categoryLink === currentSlug) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });

    const image = document.getElementById("categoryImage");

    if (image) {
        image.hidden = false;
        image.src = config.image;
        image.alt = config.title;
    }
}

function renderSubcategories(config, preserveLinks = false) {
    const nav = document.getElementById("categoryTypes");
    if (!nav) return;
    const types = config.subcategories || [];
    nav.hidden = !types.length;
    if (!types.length) { nav.innerHTML = ""; return; }
    nav.setAttribute("aria-label", `Tipos de produtos de ${config.label}`);
    if (preserveLinks) {
        nav.querySelectorAll("[data-product-type]").forEach(link => {
            if (link.dataset.productType === currentType) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });
        return;
    }
    const choices = [{ slug: "", label: "Todos" }, ...types];
    nav.innerHTML = choices.map(type => `<a href="/categorias/${config.slug}${type.slug ? `?tipo=${type.slug}` : ""}" data-product-type="${type.slug}"${type.slug === currentType ? ' aria-current="page"' : ""}>${escapeHtml(type.label)}</a>`).join("");
    nav.querySelectorAll("[data-product-type]").forEach(link => link.addEventListener("click", event => {
        if (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        currentType = link.dataset.productType;
        updateUrl(currentSlug);
        renderCategoryHeader(config, true);
        applyFilters();
    }));
}

function renderUnknownCategory() {
    document.title = "Nação Animal | Categoria não encontrada";
    setText("categoryTitle", "Categoria não encontrada");
    setText("categoryDescription", "Escolha uma das categorias abaixo para encontrar os produtos do seu pet.");
    setText("categoryBreadcrumb", "Não encontrada");
    setText("categoryResults", "Escolha uma categoria para continuar.");
    const toolbar = document.getElementById("categoryToolbar");
    const image = document.getElementById("categoryImage");
    if (toolbar) toolbar.hidden = true;
    if (image) image.hidden = true;
    const types = document.getElementById("categoryTypes");
    if (types) types.hidden = true;
    renderEmpty("Essa categoria não está disponível. Você pode explorar as categorias da nossa loja.", "Vamos encontrar o que seu pet precisa?");
    document.getElementById("categoryProducts")?.setAttribute("aria-busy", "false");
}

function filterByPetCategory(products, config) {
    if (config.favoritesOnly) return products.filter(product => publicFavorites.has(String(product.id || product.sku || product.nome)));
    if (config.all) return [...products];
    return products.filter(product => TAXONOMY.matchesCategory(product, config));
}

function filterBySearch(products, query) {
    return products.filter(product => productHaystack(product).includes(query));
}

function productHaystack(product) {
    return normalize([
        product.nome,
        product.descricao,
        product.categoria,
        TAXONOMY.types[TAXONOMY.getProductSubcategory(product)]?.label,
        product.marca,
        product.fornecedor,
        product.sku
    ].filter(Boolean).join(" "));
}

function renderProducts(products, config, query = "") {
    const grid = document.getElementById("categoryProducts");

    if (!grid) {
        return;
    }

    setText("categoryResults", `${products.length} ${products.length === 1 ? "produto encontrado" : "produtos encontrados"}${query ? " nesta busca" : config.favoritesOnly ? " nos favoritos" : config.all ? " no catálogo" : " na categoria"}.`);

    if (!products.length) {
        if (config.favoritesOnly && !query) {
            renderEmpty(
                publicFavorites.size ? "Os produtos salvos não estão disponíveis no catálogo no momento. Explore a loja para encontrar outras opções para seu pet." : "Toque no coração dos produtos que você gostou para encontrá-los aqui.",
                publicFavorites.size ? "Seus produtos salvos estão indisponíveis" : "Você ainda não tem favoritos"
            );
            return;
        }
        const message = query
            ? `Nenhum produto encontrado para "${query}" em ${config.title.toLowerCase()}.`
            : config.all ? "Ainda não há produtos cadastrados no catálogo." : `Ainda não há produtos cadastrados para ${config.title.toLowerCase()}.`;

        renderEmpty(message, query ? "Vamos tentar outra busca?" : "Novidades chegando por aqui");
        return;
    }

    grid.innerHTML = products.map(product => {
        const id = String(product.id || product.sku || product.nome);
        const href = `/produtos/${productSlug(product)}`;
        const inCart = Boolean(readCart()[id]);
        const favorite = publicFavorites.has(id);
        const available = stockAvailable(product);
        const hasPrice = hasValidPrice(product);
        const photo = typeof product.foto === "string" ? product.foto.trim() : "";

        return `
            <article class="product-card" data-product-id="${escapeHtml(id)}">
                <a class="product-link" href="${escapeHtml(href)}" aria-label="Ver produto ${escapeHtml(product.nome)}">
                    ${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(product.nome)}" loading="lazy" decoding="async">` : '<span class="product-image-placeholder" role="img" aria-label="Sem foto">Sem foto</span>'}
                </a>
                <button class="cart-action favorite ${favorite ? "is-active" : ""}" type="button" data-favorite-product="${escapeHtml(id)}" aria-label="${favorite ? "Remover" : "Salvar"} ${escapeHtml(product.nome)} ${favorite ? "dos" : "nos"} favoritos" aria-pressed="${favorite}">
                    <i class="fa-${favorite ? "solid" : "regular"} fa-heart" aria-hidden="true"></i>
                </button>
                <div class="product-content">
                    <span class="product-category">${escapeHtml(product.categoria || "Nação Animal")}</span>
                    <h3 class="product-title"><a href="${escapeHtml(href)}">${escapeHtml(product.nome)}</a></h3>
                    <div class="product-footer">
                        <strong class="product-price">${hasPrice ? currency(product.preco) : "Preço indisponível"}</strong>
                        <button class="cart-action ${inCart ? "is-active" : ""}" type="button" data-add-cart="${escapeHtml(id)}" aria-label="${escapeHtml(product.nome)}: ${available <= 0 ? "esgotado" : !hasPrice ? "preço indisponível" : inCart ? "na sacola" : "adicionar à sacola"}" aria-pressed="${inCart}" ${available <= 0 || !hasPrice ? "disabled" : ""}>
                            <i class="fa-solid ${available <= 0 ? "fa-ban" : inCart ? "fa-check" : "fa-cart-shopping"}" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    bindCartButtons();
}

function stockAvailable(product) {
    if (!product || product.estoque_disponivel == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, Number(product.estoque_disponivel) || 0);
}

function hasValidPrice(product) {
    return (typeof product?.preco === "number" || typeof product?.preco === "string")
        && String(product.preco).trim() !== ""
        && Number.isFinite(Number(product.preco)) && Number(product.preco) >= 0;
}

function renderEmpty(message, title = "Categoria em atualização") {
    const grid = document.getElementById("categoryProducts");

    if (!grid) {
        return;
    }

    const explorePath = CATEGORY_CONFIG[currentSlug]?.favoritesOnly ? "/produtos" : "/#products";
    grid.innerHTML = `
        <div class="empty-card">
            <span class="empty-icon" aria-hidden="true"><i class="fa-solid fa-paw"></i></span>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(message)}</p>
            <a class="empty-link" href="${explorePath}">Explorar a loja <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
        </div>
    `;
}

function bindCartButtons() {
    document.querySelectorAll("[data-add-cart]").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.addCart;
            const product = allProducts.find(item => String(item.id || item.sku || item.nome) === id);
            if (!product || stockAvailable(product) <= 0 || !hasValidPrice(product)) return;
            const cart = readCart();

            cart[id] = Math.max(1, Number(cart[id]) || 0);
            sessionStorage.setItem("petflow_public_cart", JSON.stringify(cart));

            button.classList.add("is-active");
            button.setAttribute("aria-pressed", "true");
            button.setAttribute("aria-label", `${product.nome}: na sacola`);
            button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
            window.PetFlowPublicHeader?.update();
        });
    });

    document.querySelectorAll("[data-favorite-product]").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.favoriteProduct;

            if (publicFavorites.has(id)) {
                publicFavorites.delete(id);
            } else {
                publicFavorites.add(id);
            }

            sessionStorage.setItem("petflow_public_favorites", JSON.stringify([...publicFavorites]));
            window.PetFlowPublicHeader?.update();
            if (CATEGORY_CONFIG[currentSlug]?.favoritesOnly) {
                applyFilters();
                return;
            }
            const active = publicFavorites.has(id);
            const product = allProducts.find(item => String(item.id || item.sku || item.nome) === id);
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
            button.setAttribute("aria-label", `${active ? "Remover" : "Salvar"} ${product?.nome || "produto"} ${active ? "dos" : "nos"} favoritos`);
            button.innerHTML = `<i class="fa-${active ? "solid" : "regular"} fa-heart" aria-hidden="true"></i>`;
        });
    });
}

function productSlug(product) {
    return slugify(product.sku || product.nome || product.id);
}

function updateUrl(slug) {
    const type = CATEGORY_CONFIG[slug]?.subcategories?.some(item => item.slug === currentType) ? currentType : "";
    const nextPath = slug === "favoritos" ? "/favoritos" : slug === "todas" ? "/produtos" : `/categorias/${slug}${type ? `?tipo=${type}` : ""}`;

    if (`${window.location.pathname}${window.location.search || ""}` !== nextPath) {
        window.history.pushState({}, "", nextPath);
    }
}

function readCart() {
    try {
        const stored = JSON.parse(sessionStorage.getItem("petflow_public_cart") || "{}");
        if (Array.isArray(stored)) return Object.fromEntries(stored.map(id => [String(id), 1]));
        return stored && typeof stored === "object" ? stored : {};
    } catch {
        return {};
    }
}

function readFavorites() {
    try {
        const stored = JSON.parse(sessionStorage.getItem("petflow_public_favorites") || "[]");
        return new Set(Array.isArray(stored) ? stored.map(String) : []);
    } catch {
        return new Set();
    }
}

function getCurrentSlug() {
    const pathname = window.location.pathname.replace(/\/+$/, "");
    if (pathname === "/produtos") return "todas";
    if (pathname === "/favoritos") return "favoritos";
    const slug = window.location.pathname.split("/").filter(Boolean).pop() || "caes";
    return TAXONOMY.getCategory(slug)?.slug || slug;
}

function getCurrentType() {
    const type = TAXONOMY.normalizeSubcategory(new URLSearchParams(window.location.search || "").get("tipo"));
    return CATEGORY_CONFIG[currentSlug]?.subcategories?.some(item => item.slug === type) ? type : "";
}

function slugify(value) {
    return normalize(value)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function currency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
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

document.addEventListener("petflow:cart-changed", applyFilters);
