"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector(".menu-toggle");
    const panel = document.querySelector(".sidebar, .menu");

    if (!menuToggle || !panel) {
        return;
    }

    if (menuToggle.dataset.sidebarReady === "true") {
        return;
    }

    const isPublicMenu = panel.classList.contains("menu");
    let overlay = document.querySelector(".menu-overlay");

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "menu-overlay";
        document.body.appendChild(overlay);
    }

    function closePanel() {
        panel.classList.remove("active");
        if (!isPublicMenu) {
            overlay.classList.remove("active");
        }
        document.body.classList.remove("menu-open");
        document.body.style.overflow = "";
        menuToggle.setAttribute("aria-expanded", "false");
    }

    function openPanel() {
        panel.classList.add("active");
        if (!isPublicMenu) {
            overlay.classList.add("active");
            document.body.classList.add("menu-open");
            document.body.style.overflow = "hidden";
        }
        menuToggle.setAttribute("aria-expanded", "true");
    }

    function togglePanel() {
        if (panel.classList.contains("active")) {
            closePanel();
            return;
        }

        openPanel();
    }

    menuToggle.addEventListener("click", togglePanel);
    overlay.addEventListener("click", closePanel);

    panel.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            if (window.innerWidth <= 992) {
                closePanel();
            }
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closePanel();
        }
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 992) {
            closePanel();
        }
    });
});
