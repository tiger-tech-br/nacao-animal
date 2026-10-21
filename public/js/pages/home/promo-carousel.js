"use strict";

(function setupHomePromoCarousel() {
    function init() {
        const carousel = document.querySelector(".home-promo");
        if (!carousel || carousel.dataset.promoReady === "true") return;
        const slides = Array.from(carousel.querySelectorAll("[data-promo-slide]"));
        const controls = carousel.querySelector("[data-promo-controls]");
        const previous = carousel.querySelector("[data-promo-prev]");
        const next = carousel.querySelector("[data-promo-next]");
        const dots = Array.from(carousel.querySelectorAll("[data-promo-go]"));
        const status = carousel.querySelector("[data-promo-status]");
        const track = carousel.querySelector("[data-promo-track]");
        if (slides.length < 2 || !controls || !previous || !next) return;
        carousel.dataset.promoReady = "true";
        controls.hidden = false;
        track?.setAttribute("aria-live", "off");
        status?.setAttribute("aria-live", "polite");
        status?.setAttribute("aria-atomic", "true");

        let active = 0;
        let timer = null;
        const hasSlideFocus = target => slides.some(slide => slide.contains(target));
        let slideHasFocus = hasSlideFocus(document.activeElement);

        function syncTimer(reset = false) {
            const canRotate = !slideHasFocus && !document.hidden;
            carousel.dataset.promoState = canRotate ? "playing" : "paused";
            if ((!canRotate || reset) && timer !== null) {
                window.clearInterval(timer);
                timer = null;
            }
            if (canRotate && timer === null) timer = window.setInterval(() => show(active + 1), 7000);
        }

        function show(index, manual = false) {
            active = (index + slides.length) % slides.length;
            slides.forEach((slide, current) => {
                slide.hidden = current !== active;
                slide.setAttribute("aria-hidden", String(current !== active));
                slide.setAttribute("role", "group");
                slide.setAttribute("aria-roledescription", "slide");
                slide.setAttribute("aria-label", `${current + 1} de ${slides.length}`);
            });
            dots.forEach(dot => dot.setAttribute("aria-current", String(Number(dot.dataset.promoGo) === active)));
            if (manual) {
                if (status) status.textContent = `Aviso ${active + 1} de ${slides.length}.`;
                syncTimer(true);
            }
        }

        previous.addEventListener("click", () => show(active - 1, true));
        next.addEventListener("click", () => show(active + 1, true));
        dots.forEach(dot => dot.addEventListener("click", () => {
            const index = Number(dot.dataset.promoGo);
            if (Number.isInteger(index) && index >= 0 && index < slides.length) show(index, true);
        }));
        carousel.addEventListener("focusin", event => {
            slideHasFocus = hasSlideFocus(event.target);
            syncTimer();
        });
        carousel.addEventListener("focusout", event => {
            slideHasFocus = hasSlideFocus(event.relatedTarget);
            syncTimer();
        });
        carousel.addEventListener("keydown", event => {
            if (!["ArrowLeft", "ArrowRight"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target;
            if (target !== carousel && !controls.contains(target)) return;
            if (target?.closest?.("a, input, select, textarea, [contenteditable]")) return;
            event.preventDefault();
            show(active + (event.key === "ArrowRight" ? 1 : -1), true);
        });
        document.addEventListener("visibilitychange", () => syncTimer());
        show(0);
        syncTimer();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
}());
