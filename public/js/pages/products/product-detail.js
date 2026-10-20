"use strict";

const PRODUCT_API = "/api/public";
let currentProduct = null;
let unavailableImageSource = "";

document.addEventListener("DOMContentLoaded", setupProductPage);

async function setupProductPage() {
    currentProduct = null;
    setProductBusy(true);
    setPurchaseVisible(false);
    const button = document.getElementById("addProductToCart");
    if (button) button.disabled = true;

    try {
        const response = await fetch(`${PRODUCT_API}/produtos`);
        const payload = await response.json();
        if (!response.ok || payload.success === false) {
            throw new Error("Não foi possível consultar o produto. Tente novamente em alguns instantes.");
        }

        const slug = getCurrentSlug();
        const products = Array.isArray(payload.data) ? payload.data : [];
        currentProduct = products.find(product => productSlug(product) === slug) || null;
        if (!currentProduct) {
            showUnavailableProduct("Produto não encontrado", "Este produto não está disponível no catálogo no momento. Que tal conhecer as outras opções para o seu pet?");
            return;
        }

        renderProduct(currentProduct);
        setupCartButton();
    } catch {
        currentProduct = null;
        showUnavailableProduct("Não conseguimos carregar o produto", "Tente atualizar a página em alguns instantes ou volte ao nosso catálogo.");
    } finally {
        setProductBusy(false);
    }
}

function renderProduct(product) {
    const id = getProductId(product);
    const inCart = Number(readCart()[id] || 0) > 0;
    const available = stockAvailable(product);
    const hasPrice = (typeof product.preco === "number" || typeof product.preco === "string")
        && String(product.preco).trim() !== ""
        && Number.isFinite(Number(product.preco)) && Number(product.preco) >= 0;
    const button = document.getElementById("addProductToCart");
    const detail = document.getElementById("productDetail");

    document.title = `Nação Animal | ${product.nome}`;
    setText("productCategory", product.categoria || "Um carinho para o seu pet");
    setText("productTitle", product.nome);
    setText("productBreadcrumb", product.nome);
    setText("productDescription", product.descricao || "Consulte os detalhes deste produto com a nossa equipe.");
    setText("productPrice", hasPrice ? currency(product.preco) : "Preço indisponível");
    setText("productSku", product.sku || "Não informado");
    setText("productAvailability", Number.isFinite(available) && available > 0
        ? `${available} ${available === 1 ? "unidade disponível" : "unidades disponíveis"}`
        : available <= 0 ? "Produto esgotado" : "Disponível");
    document.getElementById("productAvailability")?.classList.toggle("is-unavailable", available <= 0);
    detail?.classList.remove("is-unavailable");
    setHidden("productSpecs", false);
    setHidden("productFallback", true);
    setPurchaseVisible(true);
    renderProductImage(product);

    if (button) {
        button.disabled = available <= 0 || !hasPrice;
        button.classList.toggle("is-active", inCart && available > 0 && hasPrice);
        button.setAttribute("aria-label", available <= 0 ? "Produto esgotado" : !hasPrice ? "Preço indisponível" : inCart ? `${product.nome} já está na sacola` : `Adicionar ${product.nome} à sacola`);
        button.innerHTML = available <= 0
            ? '<i class="fa-solid fa-ban" aria-hidden="true"></i>Produto esgotado'
            : !hasPrice
                ? '<i class="fa-solid fa-clock" aria-hidden="true"></i>Preço indisponível'
                : inCart
                    ? '<i class="fa-solid fa-check" aria-hidden="true"></i>Na sua sacola'
                    : '<i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>Adicionar à sacola';
    }
}

function renderProductImage(product) {
    const image = document.getElementById("productImage");
    const source = typeof product.foto === "string" ? product.foto.trim() : "";
    if (!image) return;
    if (!source || source === unavailableImageSource) {
        image.hidden = true;
        if (!source) image.removeAttribute("src");
        setText("productImageMessage", "Imagem indisponível");
        setHidden("productImagePlaceholder", false);
        return;
    }
    image.onerror = () => {
        unavailableImageSource = source;
        image.onerror = null;
        image.hidden = true;
        setText("productImageMessage", "Imagem indisponível");
        setHidden("productImagePlaceholder", false);
    };
    image.alt = product.nome;
    if (image.getAttribute("src") !== source) image.src = source;
    image.hidden = false;
    setHidden("productImagePlaceholder", true);
}

function showUnavailableProduct(title, description) {
    document.title = `Nação Animal | ${title}`;
    setText("productTitle", title);
    setText("productBreadcrumb", "Produto indisponível");
    setText("productCategory", "Vamos encontrar outro carinho?");
    setText("productDescription", description);
    setText("productPrice", "");
    setText("productImageMessage", "Produto indisponível");
    setHidden("productImage", true);
    setHidden("productImagePlaceholder", false);
    setHidden("productSpecs", true);
    setHidden("productFallback", false);
    setPurchaseVisible(false);
    document.getElementById("productDetail")?.classList.add("is-unavailable");
    const button = document.getElementById("addProductToCart");
    if (button) button.disabled = true;
    setStatus(document.getElementById("productStatus"), "");
}

function setupCartButton() {
    const button = document.getElementById("addProductToCart");
    if (!button || button.dataset.productCartBound === "true") return;
    button.dataset.productCartBound = "true";
    button.addEventListener("click", () => {
        if (!currentProduct || button.disabled || stockAvailable(currentProduct) <= 0) return;
        const id = getProductId(currentProduct);
        const cart = readCart();
        const previousQuantity = Number(cart[id]) || 0;
        cart[id] = Math.max(1, previousQuantity);
        sessionStorage.setItem("petflow_public_cart", JSON.stringify(cart));
        renderProduct(currentProduct);
        window.PetFlowPublicHeader?.update();
        document.dispatchEvent(new CustomEvent("petflow:cart-changed"));
        setStatus(document.getElementById("productStatus"), previousQuantity > 0
            ? "Este produto já está na sua sacola. Você pode ajustar a quantidade por lá."
            : "Produto adicionado à sua sacola com carinho!");
    });
}

function setPurchaseVisible(visible) {
    setHidden("purchasePanel", !visible);
}

function setProductBusy(busy) {
    document.getElementById("productDetail")?.setAttribute("aria-busy", String(busy));
}

function stockAvailable(product) {
    if (!product || product.estoque_disponivel == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, Number(product.estoque_disponivel) || 0);
}

function productSlug(product) {
    return slugify(product.sku || product.nome || product.id);
}

function getProductId(product) {
    return String(product.id || product.sku || product.nome);
}

function getCurrentSlug() {
    return window.location.pathname.split("/").filter(Boolean).pop() || "";
}

function slugify(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function readCart() {
    try {
        const cart = JSON.parse(sessionStorage.getItem("petflow_public_cart") || "{}");
        if (Array.isArray(cart)) return Object.fromEntries(cart.map(id => [String(id), 1]));
        return cart && typeof cart === "object" ? cart : {};
    } catch {
        return {};
    }
}

function currency(value) {
    return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setHidden(id, hidden) {
    const element = document.getElementById(id);
    if (element) element.hidden = hidden;
}

function setStatus(element, message) {
    if (element) element.textContent = message || "";
}

document.addEventListener("petflow:cart-changed", () => {
    if (currentProduct) renderProduct(currentProduct);
});
