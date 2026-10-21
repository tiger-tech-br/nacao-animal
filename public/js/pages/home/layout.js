"use strict";

document.addEventListener("DOMContentLoaded", () => {
    setupHomeSearch();
    setupProductScroller();
});

function setupHomeSearch() {
    const toggle = document.querySelector("[data-search-toggle]");
    const close = document.querySelector("[data-search-close]");
    const form = document.querySelector(".search-form");
    const input = document.getElementById("search");
    const menu = document.getElementById("menu");
    const menuToggle = document.querySelector(".menu-toggle");
    if (!toggle || !form || !input) return;

    function closeSearch(returnFocus = true) {
        form.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        if (returnFocus) toggle.focus();
    }

    toggle.addEventListener("click", () => {
        if (form.classList.contains("is-open")) {
            closeSearch();
            return;
        }
        menu?.classList.remove("active");
        menuToggle?.setAttribute("aria-expanded", "false");
        menuToggle?.setAttribute("aria-label", "Abrir menu");
        form.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        input.focus();
    });
    close?.addEventListener("click", () => closeSearch());
    menuToggle?.addEventListener("click", () => {
        if (menu?.classList.contains("active")) closeSearch(false);
    });
    form.addEventListener("submit", () => closeSearch(false));
    form.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeSearch();
        }
    });
}

function setupProductScroller() {
    const grid = document.querySelector(".products-grid");
    const previous = document.getElementById("productsPrev");
    const next = document.getElementById("productsNext");
    if (!grid || !previous || !next) return;

    function updateControls() {
        const maximum = Math.max(0, grid.scrollWidth - grid.clientWidth);
        previous.disabled = grid.scrollLeft <= 2;
        next.disabled = grid.scrollLeft >= maximum - 2;
    }

    function moveProducts(direction) {
        const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        grid.scrollBy({
            left: direction * (grid.clientWidth + gap),
            behavior: reduceMotion ? "instant" : "smooth"
        });
    }

    previous.addEventListener("click", () => moveProducts(-1));
    next.addEventListener("click", () => moveProducts(1));
    grid.addEventListener("scroll", updateControls, { passive: true });
    window.addEventListener("resize", updateControls);

    const observer = new MutationObserver(() => {
        grid.scrollLeft = 0;
        updateControls();
    });
    observer.observe(grid, { childList: true });
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(updateControls).observe(grid);
    updateControls();
}
