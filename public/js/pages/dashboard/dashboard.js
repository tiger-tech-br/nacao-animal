"use strict";

document.addEventListener("DOMContentLoaded", () => {
    requireDashboardAuth();
    setupDashboardDate();
    setupDashboardNavigation();
    bindDashboardActions();
    loadDashboard();
    window.setInterval(loadDashboard, 30000);
});

const DASHBOARD_API = "/api";


function requireDashboardAuth() {
    if (!sessionStorage.getItem("token")) {
        window.location.href = "/admin/index.html";
    }
}

function setupDashboardDate() {
    const date = document.getElementById("dashboardDate");

    if (!date) {
        return;
    }

    date.textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long"
    }).format(new Date());
}

function setupDashboardNavigation() {
    const sidebar = document.querySelector(".sidebar");
    const toggle = document.querySelector(".admin-menu-toggle");

    if (!sidebar || !toggle) {
        return;
    }

    let overlay = document.querySelector(".admin-menu-overlay");

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "admin-menu-overlay";
        document.body.appendChild(overlay);
    }

    function closeSidebar() {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
        document.body.classList.remove("admin-menu-open");
        toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", () => {
        const willOpen = !sidebar.classList.contains("active");
        sidebar.classList.toggle("active", willOpen);
        overlay.classList.toggle("active", willOpen);
        document.body.classList.toggle("admin-menu-open", willOpen);
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

function bindDashboardActions() {
    const refresh = document.getElementById("btnAtualizar");
    const logout = document.querySelector(".admin-profile a");

    refresh?.addEventListener("click", async () => {
        refresh.classList.add("is-loading");
        await loadDashboard();
        window.setTimeout(() => refresh.classList.remove("is-loading"), 350);
    });

    logout?.addEventListener("click", () => {
        const token = sessionStorage.getItem("token") || localStorage.getItem("token");
        if (token) fetch("/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true
        }).catch(() => {});
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
    });
}

async function loadDashboard() {
    try {
        const data = await apiGet("/dashboard");
        const dashboard = data?.data || data || {};

        renderSummary(dashboard.resumo || {});
        renderSales(dashboard.ultimasVendas || []);
        renderSuppliers(dashboard.estoqueBaixo || [], dashboard.ultimasCompras || []);
        renderBestSellers(dashboard.produtosMaisVendidos || []);
        updateProfileName();
    } catch (error) {
        if (String(error.message).includes("401")) {
            window.location.href = "/admin/index.html";
            return;
        }

        renderDashboardError(error.message || "Não foi possível carregar o painel.");
    }
}

function renderSummary(summary) {
    const cards = document.querySelectorAll(".metric-card");
    const values = [
        {
            label: "Faturamento hoje",
            value: currency(summary.vendas_hoje),
            note: `${currency(summary.vendas_mes)} no mês`
        },
        {
            label: "Pedidos recebidos",
            value: number(summary.total_pedidos || summary.total_vendas || 0),
            note: `${currency(summary.contas_receber)} a receber`
        },
        {
            label: "Produtos cadastrados",
            value: number(summary.total_produtos),
            note: `${number(summary.total_clientes)} clientes cadastrados`
        },
        {
            label: "Reposição pendente",
            value: number(summary.estoque_baixo || 0),
            note: `${currency(summary.compras_mes)} em compras no mês`
        }
    ];

    cards.forEach((card, index) => {
        const item = values[index];

        if (!item) {
            return;
        }

        const label = card.querySelector("span");
        const strong = card.querySelector("strong");
        const small = card.querySelector("small");

        if (label) label.textContent = item.label;
        if (strong) strong.textContent = item.value;
        if (small) small.textContent = item.note;
    });
}

function renderSales(items) {
    const list = document.querySelector(".sales-list");

    if (!list) {
        return;
    }

    if (!items.length) {
        list.innerHTML = emptyState("Nenhum pedido registrado ainda.");
        return;
    }

    list.innerHTML = items.slice(0, 5).map(item => {
        const status = dashboardSaleStatus(item.status);
        return `
            <article class="dashboard-sale-item">
                <i class="fa-solid fa-box-open dashboard-sale-icon" aria-hidden="true"></i>
                <div class="dashboard-sale-copy">
                    <strong>Pedido #${escapeHtml(shortId(item.id))}</strong>
                    <span>${escapeHtml(item.cliente || "Cliente avulso")}</span>
                    <small>${escapeHtml(dashboardSaleDate(item.data_venda))}</small>
                </div>
                <div class="dashboard-sale-value">
                    <strong>${currency(item.valor_total)}</strong>
                    <span class="dashboard-order-status dashboard-status-${status.tone}">${status.label}</span>
                </div>
            </article>
        `;
    }).join("");
}

function dashboardSaleStatus(value) {
    const statuses = {
        AGUARDANDO_PAGAMENTO: { label: "Aguardando pagamento", tone: "waiting" },
        PAGAMENTO_APROVADO: { label: "Pedido recebido", tone: "received" },
        EM_SEPARACAO: { label: "Preparando", tone: "preparing" },
        SAIU_PARA_ENTREGA: { label: "Saiu para entrega", tone: "delivery" },
        ENTREGUE: { label: "Entregue", tone: "delivered" },
        FINALIZADA: { label: "Finalizado", tone: "delivered" },
        CANCELADA: { label: "Cancelado", tone: "cancelled" }
    };
    return statuses[String(value || "").trim().toUpperCase()]
        || { label: "Status não informado", tone: "neutral" };
}

function dashboardSaleDate(value) {
    if (!value) return "Data não informada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data não informada";
    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(date);
}

function renderBestSellers(items) {
    const list = document.querySelector(".best-sellers-list");
    if (!list) return;

    if (!items.length) {
        list.innerHTML = emptyState("Os produtos aparecem aqui quando houver vendas confirmadas.");
        return;
    }

    const ranking = items.slice(0, 5);
    const quantity = item => {
        const value = Number(item.quantidade);
        return Number.isFinite(value) ? Math.max(0, value) : 0;
    };
    const highest = Math.max(1, ...ranking.map(quantity));
    list.innerHTML = ranking.map((item, index) => {
        const count = quantity(item);
        const barSize = Math.min(100, Math.max(0, Math.round(count / highest * 100)));
        return `
            <article class="dashboard-ranking-item">
                <span class="dashboard-rank" aria-label="${index + 1}º lugar">${index + 1}</span>
                <div class="dashboard-ranking-copy">
                    <div class="dashboard-ranking-heading">
                        <strong>${escapeHtml(item.nome || "Produto")}</strong>
                        <span>${number(count)} ${count === 1 ? "unidade vendida" : "unidades vendidas"}</span>
                    </div>
                    <div class="dashboard-ranking-meter" style="--dashboard-bar-size: ${barSize}%" aria-hidden="true"><span></span></div>
                </div>
            </article>
        `;
    }).join("");
}

function renderSuppliers(lowStock, purchases) {
    const list = document.querySelector(".supplier-list");

    if (!list) {
        return;
    }

    const cards = [];

    lowStock.slice(0, 2).forEach(item => {
        cards.push({
            icon: "fa-box-open",
            title: item.nome,
            text: `${number(item.quantidade)} unidade(s) em estoque.`,
            link: "/admin/pages/compras/compras.html",
            linkText: "Criar compra"
        });
    });

    purchases.slice(0, 2).forEach(item => {
        cards.push({
            icon: "fa-truck-field",
            title: item.fornecedor || "Fornecedor",
            text: `Última compra: ${currency(item.valor_total)}.`,
            link: "/admin/pages/fornecedores/fornecedores.html",
            linkText: "Ver fornecedor"
        });
    });

    if (!cards.length) {
        list.innerHTML = emptyState("Sem alertas de fornecedor ou estoque.");
        return;
    }

    list.innerHTML = cards.map(card => `
        <article>
            <i class="fa-solid ${card.icon}" aria-hidden="true"></i>
            <div>
                <strong>${escapeHtml(card.title || "Item")}</strong>
                <span>${escapeHtml(card.text)}</span>
            </div>
            <a href="${card.link}">${escapeHtml(card.linkText)}</a>
        </article>
    `).join("");
}

function updateProfileName() {
    const profile = document.querySelector(".admin-profile span");
    if (profile) profile.textContent = "Olá, Admin!";
}

async function apiGet(endpoint) {
    const token = sessionStorage.getItem("token");
    const response = await fetch(`${DASHBOARD_API}${endpoint}`, {
        headers: {
            ...(token ?{ Authorization: `Bearer ${token}` } : {})
        }
    });

    if (!response.ok) {
        throw new Error(`Erro ${response.status}`);
    }

    return response.json();
}

function renderDashboardError(message) {
    document.querySelectorAll(".metric-card strong").forEach(item => {
        item.textContent = "-";
    });

    const lists = document.querySelectorAll(".sales-list, .supplier-list, .best-sellers-list");
    lists.forEach(list => {
        list.innerHTML = emptyState(message);
    });
}


function emptyState(message) {
    return `<div class="dashboard-empty">${escapeHtml(message)}</div>`;
}

function currency(value) {
    const numberValue = Number(value || 0);

    return numberValue.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function number(value) {
    return Number(value || 0).toLocaleString("pt-BR");
}

function shortId(value) {
    return String(value || "").slice(0, 6).toUpperCase() || "NOVO";
}

function formatTime(value) {
    return String(value || "").slice(0, 5) || "--:--";
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
