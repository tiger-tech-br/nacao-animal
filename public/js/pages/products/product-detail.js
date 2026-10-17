"use strict";

const PRODUCT_API = "/api/public";

let currentProduct = null;

document.addEventListener("DOMContentLoaded", () => {
    setupProductPage();
});

async function setupProductPage() {
    const status = document.getElementById("productStatus");

    try {
        const response = await fetch(`${PRODUCT_API}/produtos`);
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.message || "Produtos indisponíveis.");
        }

        const slug = getCurrentSlug();
        const products = Array.isArray(payload.data) ? payload.data : [];
        currentProduct = products.find(product => productSlug(product) === slug);

        if (!currentProduct) {
            throw new Error("Produto não encontrado.");
        }

        renderProduct(currentProduct);
        setupCartButton();
    } catch (error) {
        setText("productTitle", "Produto não encontrado");
        setText("productDescription", error.message || "Não foi possível carregar o produto.");
        setStatus(status, "");
    }
}

function renderProduct(product) {
    const id = getProductId(product);
    const inCart = Boolean(readCart()[id]);

    document.title = `PetFlow | ${product.nome}`;
    setText("productCategory", product.categoria || "PetFlow");
    setText("productTitle", product.nome);
    setText("productDescription", product.descricao || "Produto selecionado para cuidar melhor do seu pet.");
    setText("productPrice", currency(product.preco));
    setText("productSku", product.sku || "-");
    const available = stockAvailable(product);
    setText("productAvailability", Number.isFinite(available) && available > 0
        ? `${available} unidade(s) disponível(is)`
        : available <= 0 ? "Produto esgotado" : "Disponível");

    const image = document.getElementById("productImage");
    const button = document.getElementById("addProductToCart");

    if (image) {
        image.src = product.foto || "/images/products/petflow-prime-racao.jpg";
        image.alt = product.nome;
    }

    if (button) {
        button.disabled = available <= 0;
        button.classList.toggle("is-active", inCart);
        button.innerHTML = available <= 0
            ? `<i class="fa-solid fa-ban"></i>Produto esgotado`
            : inCart
            ? `<i class="fa-solid fa-check"></i>Na sacola`
            : `<i class="fa-solid fa-plus"></i>Adicionar à sacola`;
    }
}

function setupCartButton() {
    const button = document.getElementById("addProductToCart");

    button?.addEventListener("click", () => {
        if (!currentProduct || stockAvailable(currentProduct) <= 0) {
            return;
        }

        const id = getProductId(currentProduct);
        const cart = readCart();

        cart[id] = 1;
        sessionStorage.setItem("petflow_public_cart", JSON.stringify(cart));

        button.classList.add("is-active");
        button.innerHTML = `<i class="fa-solid fa-check"></i>Na sacola`;
        window.PetFlowPublicHeader?.update();
        setStatus(document.getElementById("productStatus"), "Produto adicionado à sacola.");
    });
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

function readCart() {
    try {
        return JSON.parse(sessionStorage.getItem("petflow_public_cart") || "{}") || {};
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

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function setStatus(element, message) {
    if (element) {
        element.textContent = message || "";
    }
}

document.addEventListener("petflow:cart-changed", () => { if (currentProduct) renderProduct(currentProduct); });
