"use strict";

(function () {
    const links = [
        ["dashboard", "/admin/pages/dashboard/dashboard.html", "fa-house", "Painel da Loja"],
        ["clientes", "/admin/pages/clientes/clientes.html", "fa-users", "Clientes"],
        ["produtos", "/admin/pages/produtos/produtos.html", "fa-box", "Produtos"],
        ["estoque", "/admin/pages/estoque/estoque.html", "fa-boxes-stacked", "Estoque"],
        ["vendas", "/admin/pages/vendas/vendas.html", "fa-box-open", "Pedidos"],
        ["financeiro", "/admin/pages/financeiro/financeiro.html", "fa-wallet", "Financeiro"],
        ["configuracoes", "/admin/pages/configuracoes/configuracoes.html", "fa-gear", "Configurações"]
    ];

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    function init() {
        mountSidebar();
        mountTopbar();
        setupSidebarToggle();
    }

    function mountSidebar() {
        const sidebar = document.getElementById("sidebar");

        if (!sidebar || sidebar.children.length) {
            return;
        }

        const currentPath = window.location.pathname.toLowerCase();
        sidebar.className = "sidebar";
        sidebar.innerHTML = `
            <a class="sidebar-brand" href="/admin/pages/dashboard/dashboard.html">
                <i class="fa-solid fa-paw"></i>
                <div><strong>PetFlow</strong><span>Painel administrativo</span></div>
            </a>
            <nav class="sidebar-nav">
                ${links.map(([key, href, icon, label]) => `
                    <a href="${href}" class="${currentPath.includes(`/${key}/`) ?"active" : ""}">
                        <i class="fa-solid ${icon}"></i>${label}
                    </a>
                `).join("")}
            </nav>
        `;
    }

    function mountTopbar() {
        let topbar = document.getElementById("topbar") || document.getElementById("header");
        const main = document.querySelector(".main-content");

        if (!topbar && main) {
            topbar = document.createElement("header");
            main.prepend(topbar);
        }

        if (!topbar || topbar.children.length) {
            return;
        }

        topbar.className = "topbar";
        topbar.innerHTML = `
            <div class="topbar-left">
                <button class="menu-toggle admin-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false">
                    <i class="fa-solid fa-bars"></i>
                </button>
                <div class="topbar-title">
                    <span>Gestão da loja</span>
                    <h1>PetFlow</h1>
                </div>
            </div>
            <a class="btn" href="/admin/index.html">Sair</a>
        `;
    }

    function setupSidebarToggle() {
        const toggle = document.querySelector(".menu-toggle, .admin-menu-toggle");
        const sidebar = document.querySelector(".sidebar");

        if (!toggle || !sidebar || toggle.dataset.sidebarReady === "true") {
            return;
        }

        toggle.dataset.sidebarReady = "true";

        let overlay = document.querySelector(".menu-overlay, .admin-menu-overlay");

        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "admin-menu-overlay menu-overlay";
            document.body.appendChild(overlay);
        }

        function closeSidebar() {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            document.body.classList.remove("admin-menu-open", "menu-open");
            document.body.style.overflow = "";
            toggle.setAttribute("aria-expanded", "false");
        }

        toggle.addEventListener("click", () => {
            const willOpen = !sidebar.classList.contains("active");
            sidebar.classList.toggle("active", willOpen);
            overlay.classList.toggle("active", willOpen);
            document.body.classList.toggle("admin-menu-open", willOpen);
            document.body.style.overflow = willOpen ?"hidden" : "";
            toggle.setAttribute("aria-expanded", String(willOpen));
        });

        overlay.addEventListener("click", closeSidebar);

        sidebar.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                if (window.innerWidth <= 1024) {
                    closeSidebar();
                }
            });
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                closeSidebar();
            }
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > 1024) {
                closeSidebar();
            }
        });
    }
})();
