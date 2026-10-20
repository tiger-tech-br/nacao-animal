"use strict";

const CATEGORY_API = "/api/public";

const CATEGORY_CONFIG = {
    caes: {
        title: "Produtos para cães",
        description: "Rações, petiscos, acessórios e cuidados selecionados para cachorros.",
        image: "/images/categories/dogs.jpg",
        keywords: ["cao", "caes", "cachorro", "canis", "bifinho", "coleira"]
    },
    gatos: {
        title: "Produtos para gatos",
        description: "Itens escolhidos para gatos, com foco em alimentação, conforto e rotina.",
        image: "/images/categories/cats.jpg",
        keywords: ["gato", "gatos", "felis", "castrados"]
    },
    aves: {
        title: "Produtos para aves",
        description: "Alimentos, acessórios e cuidados para aves de estimação.",
        image: "/images/categories/birds.jpg",
        keywords: ["ave", "aves", "passaro", "passaros", "calopsita", "periquito"]
    },
    peixes: {
        title: "Produtos para peixes",
        description: "Itens para aquários, alimentação, limpeza e bem-estar dos peixes.",
        image: "/images/categories/fish.jpg",
        keywords: ["peixe", "peixes", "aquario", "aquarios"]
    },
    roedores: {
        title: "Produtos para roedores",
        description: "Produtos para hamster, porquinho-da-índia, coelhos e pequenos pets.",
        image: "/images/categories/rodents.jpg",
        keywords: ["roedor", "roedores", "hamster", "coelho", "porquinho"]
    },
    acessorios: {
        title: "Acessórios para pets",
        description: "Coleiras, brinquedos, camas, transporte e acessórios para a rotina do pet.",
        image: "/images/categories/accessories.jpg",
        keywords: ["acessorio", "acessorios", "coleira", "brinquedo", "cama", "mordedor"],
        fallbackCategories: ["Acessórios"]
    }
};

let allProducts = [];
let publicFavorites = readFavorites();
let currentSlug = "caes";
let catalogFailed = false;

document.addEventListener("DOMContentLoaded", () => {
    setupCategoryPage();
});

document.addEventListener("petflow:customer-logout", () => {
    publicFavorites = new Set();
    applyFilters();
});

window.addEventListener("popstate", () => {
    currentSlug = getCurrentSlug();
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
    currentSlug = getCurrentSlug();
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

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "Produtos indisponíveis.");
        }

        allProducts = Array.isArray(payload.data) ? payload.data : [];
        applyFilters();
    } catch (error) {
        catalogFailed = true;
        renderEmpty(error.message || "Não foi possível carregar os produtos.", "Não foi possível carregar a seleção");
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
        return;
    }
    const query = normalize(document.getElementById("categorySearch")?.value || "");
    const categoryProducts = filterByPetCategory(allProducts, config);
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

function renderCategoryHeader(config) {
    document.title = `Nação Animal | ${config.title}`;
    setText("categoryTitle", config.title);
    setText("categoryDescription", config.description);
    setText("categoryBreadcrumb", config.title);
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
    renderEmpty("Essa categoria não está disponível. Você pode explorar as categorias da nossa loja.", "Vamos encontrar o que seu pet precisa?");
    document.getElementById("categoryProducts")?.setAttribute("aria-busy", "false");
}

function filterByPetCategory(products, config) {
    const matches = products.filter(product => {
        const words = productHaystack(product).split(/[^a-z0-9]+/);
        return config.keywords.some(keyword => words.includes(keyword) || words.includes(`${keyword}s`));
    });

    if (matches.length || !config.fallbackCategories?.length) {
        return matches;
    }

    const allowed = config.fallbackCategories.map(normalize);
    return products.filter(product => allowed.includes(normalize(product.categoria)));
}

function filterBySearch(products, query) {
    return products.filter(product => productHaystack(product).includes(query));
}

function productHaystack(product) {
    return normalize([
        product.nome,
        product.descricao,
        product.categoria,
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

    setText("categoryResults", `${products.length} ${products.length === 1 ? "produto encontrado" : "produtos encontrados"}${query ? " nesta busca" : " na categoria"}.`);

    if (!products.length) {
        const message = query
            ? `Nenhum produto encontrado para "${query}" em ${config.title.toLowerCase()}.`
            : `Ainda não há produtos cadastrados para ${config.title.toLowerCase()}.`;

        renderEmpty(message, query ? "Vamos tentar outra busca?" : "Novidades chegando por aqui");
        return;
    }

    grid.innerHTML = products.map(product => {
        const id = String(product.id || product.sku || product.nome);
        const href = `/produtos/${productSlug(product)}`;
        const inCart = Boolean(readCart()[id]);
        const favorite = publicFavorites.has(id);
        const available = stockAvailable(product);

        return `
            <article class="product-card" data-product-id="${escapeHtml(id)}">
                <a class="product-link" href="${escapeHtml(href)}" aria-label="Ver produto ${escapeHtml(product.nome)}">
                    ${product.foto ? `<img src="${escapeHtml(product.foto)}" alt="${escapeHtml(product.nome)}" loading="lazy" decoding="async">` : '<span class="product-image-placeholder">Imagem indisponível</span>'}
                </a>
                <button class="cart-action favorite ${favorite ? "is-active" : ""}" type="button" data-favorite-product="${escapeHtml(id)}" aria-label="${favorite ? "Remover" : "Salvar"} ${escapeHtml(product.nome)} ${favorite ? "dos" : "nos"} favoritos" aria-pressed="${favorite}">
                    <i class="fa-${favorite ? "solid" : "regular"} fa-heart" aria-hidden="true"></i>
                </button>
                <div class="product-content">
                    <span class="product-category">${escapeHtml(product.categoria || "Nação Animal")}</span>
                    <h3 class="product-title"><a href="${escapeHtml(href)}">${escapeHtml(product.nome)}</a></h3>
                    <div class="product-footer">
                        <strong class="product-price">${currency(product.preco)}</strong>
                        <button class="cart-action ${inCart ? "is-active" : ""}" type="button" data-add-cart="${escapeHtml(id)}" aria-label="${escapeHtml(product.nome)}: ${available <= 0 ? "esgotado" : inCart ? "na sacola" : "adicionar à sacola"}" aria-pressed="${inCart}" ${available <= 0 ? "disabled" : ""}>
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

function renderEmpty(message, title = "Categoria em atualização") {
    const grid = document.getElementById("categoryProducts");

    if (!grid) {
        return;
    }

    grid.innerHTML = `
        <div class="empty-card">
            <span class="empty-icon" aria-hidden="true"><i class="fa-solid fa-paw"></i></span>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(message)}</p>
            <a class="empty-link" href="/#products">Explorar a loja <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
        </div>
    `;
}

function bindCartButtons() {
    document.querySelectorAll("[data-add-cart]").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.addCart;
            const product = allProducts.find(item => String(item.id || item.sku || item.nome) === id);
            if (!product || stockAvailable(product) <= 0) return;
            const cart = readCart();

            cart[id] = 1;
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
    const nextPath = `/categorias/${slug}`;

    if (window.location.pathname !== nextPath) {
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
    return window.location.pathname.split("/").filter(Boolean).pop() || "caes";
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
