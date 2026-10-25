"use strict";

(function () {
    const config = window.PetFlowAdminPage;

    if (!config) {
        return;
    }

    const isSalesPage = config.key === "vendas";

    const isReadOnlyPage = config.readOnly === true;

    let records = [];
    let editingId = null;
    let savingRecord = false;
    const disabledRecordControls = new Map();
    let selectedSaleId = null;
    let saleDetailsRevision = 0;
    let currentPage = 1;
    const pageSize = 25;
    let productCategoryOptions = [];
    let productCategoryValue = "";
    let productSubcategoryValue = "";


    document.addEventListener("DOMContentLoaded", () => {
        if (typeof requireAuth === "function") {
            requireAuth();
        }

        setupAdminNavigation();
        setupAdminTools();
        bindPageText();
        setupAdminLogout();
        buildInsights();
        buildPipeline();

        buildForm();
        applyReadOnlyLayout();
        applySalesLayout();
        setupRecordFormNavigation();
        setupSalesFilters();

        if (!isSalesPage) {
            populateRemoteSelects();
        }

        bindEvents();
        loadData().then(() => {
            const order = new URLSearchParams(location.search).get("pedido");
            if (isSalesPage && /^[0-9a-f-]{36}$/i.test(order || "")) showSaleDetails(order);
        });
    });

    function setupAdminNavigation() {
        const sidebar = document.querySelector(".sidebar");
        const topbar = document.querySelector(".topbar");

        ensureAdminMenuLinks(sidebar);

        if (!sidebar || !topbar || topbar.querySelector(".admin-menu-toggle")) {
            return;
        }

        const title = topbar.querySelector(".topbar-title");
        const left = document.createElement("div");
        left.className = "topbar-left";

        const toggle = document.createElement("button");
        toggle.className = "admin-menu-toggle";
        toggle.type = "button";
        toggle.setAttribute("aria-label", "Abrir menu administrativo");
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = `<i class="fa-solid fa-bars"></i>`;

        left.appendChild(toggle);

        if (title) {
            left.appendChild(title);
        }

        topbar.prepend(left);

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

        function openSidebar() {
            sidebar.classList.add("active");
            overlay.classList.add("active");
            document.body.classList.add("admin-menu-open");
            toggle.setAttribute("aria-expanded", "true");
        }

        toggle.addEventListener("click", () => {
            if (sidebar.classList.contains("active")) {
                closeSidebar();
                return;
            }

            openSidebar();
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

    function ensureAdminMenuLinks(sidebar) {
        const nav = sidebar?.querySelector(".sidebar-nav");
        if (!nav) return;
        const links = [
            ["cupons", "/admin/pages/cupons/cupons.html", "fa-ticket", "Cupons"],
            ["usuarios", "/admin/pages/usuarios/usuarios.html", "fa-user-shield", "Usuários"],
            ["auditoria", "/admin/pages/auditoria/auditoria.html", "fa-clock-rotate-left", "Auditoria"]
            ,["atendimento", "/admin/pages/atendimento/atendimento.html", "fa-headset", "Atendimento"]
            ,["lgpd", "/admin/pages/lgpd/lgpd.html", "fa-shield-halved", "LGPD"]
        ];
        for (const [key, href, icon, label] of links) {
            if (nav.querySelector(`[data-active-page="${key}"]`)) continue;
            const link = document.createElement("a");
            link.href = href;
            link.dataset.activePage = key;
            link.innerHTML = `<i class="fa-solid ${icon}"></i>${label}`;
            nav.appendChild(link);
        }
    }

    function setupAdminTools() {
        const toolbar = document.querySelector(".toolbar");
        if (!toolbar || toolbar.querySelector("[data-export-csv]")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn";
        button.dataset.exportCsv = "";
        button.innerHTML = '<i class="fa-solid fa-file-csv"></i>Exportar CSV';
        button.addEventListener("click", exportCsv);
        toolbar.appendChild(button);
    }

    function setupAdminLogout() {
        document.querySelectorAll('a[href="/admin/index.html"]').forEach(link => {
            link.addEventListener("click", () => {
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
        });
    }

    function setupRecordFormNavigation() {
        if (isReadOnlyPage || isSalesPage) return;
        const form = document.getElementById("recordForm");
        const toolbar = document.querySelector(".toolbar");
        const header = form?.closest(".panel")?.querySelector(".panel-header");
        if (!form || !toolbar || !header || document.getElementById("openRecordForm")) return;

        const open = document.createElement("button");
        open.type = "button";
        open.className = "btn btn-primary";
        open.id = "openRecordForm";
        open.setAttribute("aria-controls", "recordForm");
        open.addEventListener("click", () => {
            if (!savingRecord) revealRecordForm();
        });
        toolbar.appendChild(open);

        const back = document.createElement("button");
        back.type = "button";
        back.className = "btn btn-small";
        back.textContent = config.mode === "single" ? "Ver dados atuais" : "Voltar à lista";
        back.addEventListener("click", () => revealRecordSection("tableTitle"));
        header.appendChild(back);
        syncRecordFormActions();
    }

    function revealRecordSection(titleId) {
        const title = document.getElementById(titleId);
        if (!title) return;
        title.setAttribute("tabindex", "-1");
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        title.closest(".panel")?.scrollIntoView({
            block: "start", behavior: reducedMotion ? "auto" : "smooth"
        });
        title.focus({ preventScroll: true });
    }

    function revealRecordForm() {
        revealRecordSection("formTitle");
    }

    function syncRecordFormActions() {
        setText("openRecordForm", editingId ? "Continuar edição" : (config.formTitle || "Novo registro"));
        setText("cancelEdit", editingId ? "Cancelar edição" : "Limpar campos");
        setText("saveRecord", savingRecord ? "Salvando..." :
            (editingId || config.mode === "single" ? "Salvar alterações" : "Salvar"));
    }

    function setRecordFormFeedback(message, state = "info") {
        const feedback = document.getElementById("recordFormStatus");
        if (!feedback) return;
        feedback.textContent = message;
        feedback.dataset.state = state;
        feedback.hidden = !message;
    }

    function setRecordFormBusy(busy) {
        const form = document.getElementById("recordForm");
        form?.setAttribute("aria-busy", String(busy));
        const open = document.getElementById("openRecordForm");
        if (open) open.disabled = busy;
        if (busy) {
            form?.querySelectorAll("input, select, textarea, button").forEach(control => {
                if (!disabledRecordControls.has(control)) disabledRecordControls.set(control, control.disabled);
                control.disabled = true;
            });
        } else {
            disabledRecordControls.forEach((disabled, control) => { control.disabled = disabled; });
            disabledRecordControls.clear();
        }
        syncRecordFormActions();
    }

    function bindPageText() {
        setText("moduleTitle", config.title);
        setText("moduleSubtitle", config.subtitle);
        setText("tableTitle", config.tableTitle || config.title);
        setText("formTitle", config.formTitle || "Novo registro");

        const icon = document.getElementById("moduleIcon");

        if (icon) {
            icon.className = `fa-solid ${config.icon || "fa-table"}`;
        }

        document.querySelectorAll("[data-active-page]").forEach(link => {
            if (link.dataset.activePage === config.key) {
                link.classList.add("active");
            }
        });
    }

    function buildInsights() {
        const pageHeader = document.querySelector(".page-header");

        if (
            !pageHeader ||
            !Array.isArray(config.insights) ||
            document.querySelector(".admin-insights")
        ) {
            return;
        }

        const insights = document.createElement("section");
        insights.className = "admin-insights";
        insights.setAttribute("aria-label", "Resumo da página");
        insights.innerHTML = config.insights.map((item, index) => `
            <article
                class="insight-card"
                data-insight-index="${index}"
                data-insight-key="${escapeHtml(item.key || "")}">
                <i class="fa-solid ${escapeHtml(item.icon || "fa-circle-info")}"></i>

                <div>
                    <span>${escapeHtml(item.label || "")}</span>
                    <strong data-insight-value>${escapeHtml(item.value || "0")}</strong>
                    <small data-insight-note>${escapeHtml(item.note || "")}</small>
                </div>
            </article>
        `).join("");

        pageHeader.insertAdjacentElement("afterend", insights);
    }

    function buildPipeline() {
        const insights = document.querySelector(".admin-insights");
        const pageHeader = document.querySelector(".page-header");
        const anchor = insights || pageHeader;

        if (
            !anchor ||
            !Array.isArray(config.pipeline) ||
            document.querySelector(".order-pipeline")
        ) {
            return;
        }

        const pipeline = document.createElement("section");
        pipeline.className = "order-pipeline";
        pipeline.setAttribute("aria-label", isSalesPage ? "Filtrar pedidos por etapa" : "Etapas dos pedidos");
        pipeline.innerHTML = config.pipeline.map((step, index) => `
            <${isSalesPage ? 'button type="button" aria-pressed="false"' : "article"}
                class="pipeline-step"
                data-pipeline-index="${index}"
                data-pipeline-status="${escapeHtml(step.status || "")}">
                <div class="pipeline-icon">
                    <i class="fa-solid ${escapeHtml(step.icon || "fa-circle")}"></i>
                </div>

                <div>
                    <span>${isSalesPage ? "Filtrar por" : `Etapa ${index + 1}`}</span>
                    <strong>${escapeHtml(step.label || "")}</strong>
                    <small>${escapeHtml(step.note || "")}</small>
                </div>

                <b data-pipeline-value>${escapeHtml(step.value || "0")}</b>
            </${isSalesPage ? "button" : "article"}>
        `).join("");

        anchor.insertAdjacentElement("afterend", pipeline);
    }

    function readSalesFilters() {
        return {
            query: document.getElementById("pageSearch")?.value || "",
            status: document.getElementById("orderStatusFilter")?.value || "",
            from: document.getElementById("orderDateFrom")?.value || "",
            to: document.getElementById("orderDateTo")?.value || ""
        };
    }

    function getFilteredRecords() {
        if (isSalesPage && window.NacaoAnimalOrderFilters) {
            return window.NacaoAnimalOrderFilters.filter(records, readSalesFilters());
        }
        const search = normalizeSearch(document.getElementById("pageSearch")?.value || "");
        return records.filter(record => normalizeSearch(JSON.stringify(record)).includes(search));
    }

    function setupSalesFilters() {
        const form = document.getElementById("orderFilters");
        if (!isSalesPage || !form) return;
        const apply = () => { currentPage = 1; renderTable(); };
        form.addEventListener("submit", event => { event.preventDefault(); apply(); });
        for (const id of ["orderStatusFilter", "orderDateFrom", "orderDateTo"]) {
            document.getElementById(id)?.addEventListener("change", apply);
        }
        document.getElementById("clearOrderFilters")?.addEventListener("click", () => {
            form.reset();
            const search = document.getElementById("pageSearch");
            if (search) search.value = "";
            apply();
        });
        document.querySelectorAll("button[data-pipeline-status]").forEach(button => {
            button.addEventListener("click", () => {
                const select = document.getElementById("orderStatusFilter");
                if (!select) return;
                select.value = select.value === button.dataset.pipelineStatus ? "" : button.dataset.pipelineStatus;
                apply();
            });
        });
    }

    function syncSalesFilterState(count) {
        if (!isSalesPage) return;
        const filters = readSalesFilters();
        const error = window.NacaoAnimalOrderFilters?.validateRange(filters.from, filters.to) || "";
        const status = document.getElementById("orderFilterError");
        if (status) { status.textContent = error; status.hidden = !error; }
        document.getElementById("orderDateTo")?.setCustomValidity(error);
        const exportButton = document.querySelector("[data-export-csv]");
        if (exportButton) exportButton.disabled = Boolean(error);
        setText("orderFilterSummary", error ? "Ajuste o período para consultar os pedidos." :
            `${count} de ${records.length} ${records.length === 1 ? "pedido exibido" : "pedidos exibidos"}.`);
        document.querySelectorAll("button[data-pipeline-status]").forEach(button => {
            button.setAttribute("aria-pressed", String(filters.status === button.dataset.pipelineStatus));
        });
    }


    function buildForm() {
        const form = document.getElementById("recordForm");

        if (!form) {
            return;
        }

        if (isReadOnlyPage) {
            form.innerHTML = "";
            return;
        }

        if (isSalesPage) {
            renderSaleEmptyState(form);
            return;
        }

        const fields = config.fields || [];

        form.innerHTML = fields.map(field => buildFormField(field)).join("") + `
            <div class="form-actions">
                <button
                    type="button"
                    class="btn"
                    id="cancelEdit">
                    Limpar
                </button>

                <button
                    type="submit"
                    class="btn btn-primary"
                    id="saveRecord">
                    Salvar
                </button>
            </div>
            <p id="recordFormStatus" class="record-form-status" role="status" aria-live="polite" aria-atomic="true" hidden></p>
        `;
        if (config.key === "produtos") {
            productCategoryValue = "";
            productSubcategoryValue = "";
            syncProductSubcategory();
        }
        syncRecordFormActions();
        if (savingRecord) setRecordFormBusy(true);
    }

    function applyReadOnlyLayout() {
        if (!isReadOnlyPage) {
            return;
        }

        const formPanel = document.getElementById("recordForm")?.closest(".panel");
        const contentGrid = document.querySelector(".content-grid");

        formPanel?.remove();
        contentGrid?.classList.add("content-grid-list");
    }

    function applySalesLayout() {
        if (!isSalesPage) {
            return;
        }

        document.querySelector(".content-grid")?.classList.add("sales-layout");
        document.querySelector(".data-table")?.classList.add("sales-list-table");
    }

    function buildFormField(field) {
        const required = field.required ? "required" : "";
        const value = field.value || "";

        if (field.type === "items-builder") {
            return buildItemsBuilderField(field);
        }

        if (field.type === "file") {
            return `
                <div class="form-group form-group-wide product-photo-field">
                    <label for="${escapeHtml(field.name)}">
                        ${escapeHtml(field.label)}
                    </label>

                    <div class="product-photo-preview" data-file-preview="${escapeHtml(field.name)}">
                        <img alt="Prévia da foto do produto" hidden>
                        <span><i class="fa-regular fa-image"></i>Prévia da foto</span>
                    </div>

                    <input
                        id="${escapeHtml(field.name)}"
                        name="${escapeHtml(field.name)}"
                        type="file"
                        class="form-control product-photo-input"
                        accept="${escapeHtml(field.accept || "image/jpeg,image/png,image/webp")}"
                        ${required}>
                    <small>${escapeHtml(field.help || "Envie uma imagem JPG, PNG ou WebP de até 5 MB.")}</small>
                </div>
            `;
        }

        if (field.type === "textarea" || field.type === "json") {
            return `
                <div class="form-group form-group-wide">
                    <label for="${escapeHtml(field.name)}">
                        ${escapeHtml(field.label)}
                    </label>

                    <textarea
                        id="${escapeHtml(field.name)}"
                        name="${escapeHtml(field.name)}"
                        class="form-control"
                        ${buildFieldAttributes(field)}
                        ${required}>${escapeHtml(value)}</textarea>
                </div>
            `;
        }

        if (field.type === "checkbox") {
            return `<label class="form-check">
                <input id="${escapeHtml(field.name)}" name="${escapeHtml(field.name)}"
                    type="checkbox" ${value === true ? "checked" : ""}>
                <span>${escapeHtml(field.label)}</span>
            </label>`;
        }

        if (field.type === "select" || field.type === "remote-select") {
            const options = (field.options || [])
                .map(option => {
                    const selected =
                        String(option.value) === String(value)
                            ? "selected"
                            : "";

                    return `
                        <option
                            value="${escapeHtml(option.value)}"
                            ${selected}>
                            ${escapeHtml(option.label)}
                        </option>
                    `;
                })
                .join("");

            const placeholder = field.placeholder || "Selecione";
            const remoteOption =
                field.type === "remote-select" && !options
                    ? `<option value="">Carregando...</option>`
                    : `<option value="">${escapeHtml(placeholder)}</option>`;

            return `
                <div class="form-group">
                    <label for="${escapeHtml(field.name)}">
                        ${escapeHtml(field.label)}
                    </label>

                    <select
                        id="${escapeHtml(field.name)}"
                        name="${escapeHtml(field.name)}"
                        class="form-control"
                        ${required}>
                        ${remoteOption}
                        ${options}
                    </select>
                </div>
            `;
        }

        return `
            <div class="form-group">
                <label for="${escapeHtml(field.name)}">
                    ${escapeHtml(field.label)}
                </label>

                <input
                    id="${escapeHtml(field.name)}"
                    name="${escapeHtml(field.name)}"
                    type="${escapeHtml(field.type || "text")}"
                    class="form-control"
                    value="${escapeHtml(value)}"
                    ${buildFieldAttributes(field)}
                    ${required}>
            </div>
        `;
    }

    async function populateRemoteSelects() {
        const fields = (config.fields || [])
            .filter(field => field.type === "remote-select" && field.endpoint);

        await Promise.all(fields.map(async field => {
            const select = document.getElementById(field.name);

            if (!select) {
                return;
            }

            try {
                const response = await apiGet(field.endpoint);
                const rows = normalizeResponse(response);
                const labelKey = field.labelKey || "nome";
                const valueKey = field.valueKey || "id";
                const placeholder = field.placeholder || "Selecione";

                const selectedValue = select.value || (config.key === "produtos" && field.name === "categoriaId" ? productCategoryValue : "");

                select.innerHTML =
                    `<option value="">${escapeHtml(placeholder)}</option>` +
                    rows.map(row => {
                        const value = row[valueKey] || "";
                        const label =
                            row[labelKey] ||
                            row.nome ||
                            row.email ||
                            value;

                        return `
                            <option value="${escapeHtml(value)}">
                                ${escapeHtml(label)}
                            </option>
                        `;
                    }).join("");
                select.value = selectedValue;
                if (config.key === "produtos" && field.name === "categoriaId") {
                    productCategoryOptions = rows;
                    productCategoryValue = selectedValue;
                    syncProductSubcategory();
                }
            } catch {
                select.innerHTML =
                    `<option value="">Não foi possível carregar</option>`;
            }
        }));

        await populateItemsBuilders();
    }

    function syncProductSubcategory(value = productSubcategoryValue) {
        if (config.key !== "produtos") return;
        const select = document.getElementById("subcategoria");
        const categorySelect = document.getElementById("categoriaId");
        const taxonomy = window.NacaoCatalogTaxonomy;
        if (!select || !categorySelect || !taxonomy) return;
        productSubcategoryValue = value || "";
        const categoryId = categorySelect.value || productCategoryValue;
        const category = productCategoryOptions.find(item => String(item.id) === String(categoryId));
        const group = taxonomy.getCategory(category?.nome);
        const options = group?.subcategories || [];
        select.innerHTML = `<option value="">${options.length ? "Selecione a subcategoria (opcional)" : "Escolha uma categoria com subcategorias"}</option>` + options
            .map(item => `<option value="${escapeHtml(item.slug)}">${escapeHtml(item.label)}</option>`).join("");
        const normalized = taxonomy.normalizeSubcategory(productSubcategoryValue);
        select.value = options.some(item => item.slug === normalized) ? normalized : "";
        select.disabled = options.length === 0;
    }

    async function populateItemsBuilders() {
        const fields = (config.fields || [])
            .filter(field => field.type === "items-builder" && field.endpoint);

        await Promise.all(fields.map(async field => {
            try {
                const response = await apiGet(field.endpoint);
                const rows = normalizeResponse(response);
                const builder =
                    document.querySelector(`[data-items-builder="${field.name}"]`);

                if (!builder) {
                    return;
                }

                builder.dataset.options = JSON.stringify(rows.map(row => ({
                    value: row[field.valueKey || "id"],
                    label: row[field.labelKey || "nome"],
                    price: row[field.priceKey || "preco"] || 0
                })));

                const list = builder.querySelector("[data-items-list]");

                if (list && !list.children.length) {
                    addItemRow(field.name);
                }
            } catch {
                const builder =
                    document.querySelector(`[data-items-builder="${field.name}"]`);

                if (builder) {
                    builder.querySelector("[data-items-list]").innerHTML = `
                        <div class="items-builder-empty">
                            Não foi possível carregar os produtos.
                        </div>
                    `;
                }
            }
        }));
    }

    function bindEvents() {
        const search = document.getElementById("pageSearch");
        const refresh = document.getElementById("refreshPage");
        const form = document.getElementById("recordForm");

        if (search) {
            search.addEventListener("input", () => {
                currentPage = 1;
                renderTable();
            });
        }

        if (refresh) {
            refresh.addEventListener("click", loadData);
        }

        if (form && !isSalesPage) {
            form.addEventListener("submit", saveRecord);
            form.addEventListener("change", event => {
                if (config.key === "produtos" && event.target?.name === "categoriaId") {
                    productCategoryValue = event.target.value;
                    syncProductSubcategory("");
                }
                if (event.target?.type === "file") {
                    renderFilePreview(
                        event.target,
                        event.target.dataset.currentUrl || ""
                    );
                }
            });
        }

        document.addEventListener("click", event => {
            const detailsButton =
                event.target.closest("[data-action='details']");
            const editButton =
                event.target.closest("[data-action='edit']");
            const deleteButton =
                event.target.closest("[data-action='delete']");
            const cancelButton =
                event.target.closest("#cancelEdit");
            const addItemButton =
                event.target.closest("[data-action='add-item']");
            const removeItemButton =
                event.target.closest("[data-action='remove-item']");
            const clearDetailsButton =
                event.target.closest("[data-action='clear-details']");
            const updateStatusButton =
                event.target.closest("[data-action='update-sale-status']");
            const cancelPurchaseButton =
                event.target.closest("[data-action='cancel-purchase']");

            if (cancelPurchaseButton) {
                cancelPurchase(cancelPurchaseButton.dataset.id);
                return;
            }

            if (detailsButton && isSalesPage) {
                showSaleDetails(detailsButton.dataset.id);
                return;
            }

            if (updateStatusButton && isSalesPage) {
                updateSaleStatus(
                    updateStatusButton.closest("[data-sale-status-form]")
                );
                return;
            }

            if (clearDetailsButton && isSalesPage) {
                selectedSaleId = null;
                renderSaleEmptyState(form);
                return;
            }

            if (editButton && !isSalesPage) {
                editRecord(editButton.dataset.id);
            }

            if (deleteButton && !isSalesPage) {
                deleteRecord(deleteButton.dataset.id);
            }

            if (cancelButton && !isSalesPage) {
                if (!savingRecord) resetForm();
            }

            if (addItemButton && !isSalesPage) {
                if (!savingRecord) addItemRow(addItemButton.dataset.field);
            }

            if (removeItemButton && !isSalesPage) {
                if (savingRecord) return;
                const row =
                    removeItemButton.closest(".items-builder-row");
                const builder =
                    removeItemButton.closest("[data-items-builder]");

                row?.remove();
                refreshItemsBuilderTotal(builder);
            }
        });

        document.addEventListener("change", event => {
            if (isSalesPage) {
                return;
            }

            const productSelect =
                event.target.closest("[data-item-product]");

            if (!productSelect) {
                return;
            }

            const selected = productSelect.selectedOptions[0];
            const row = productSelect.closest(".items-builder-row");
            const price = row?.querySelector("[data-item-price]");

            if (price && selected?.dataset.price) {
                price.value = Number(selected.dataset.price).toFixed(2);
            }

            refreshItemsBuilderTotal(
                productSelect.closest("[data-items-builder]")
            );
        });

        document.addEventListener("input", event => {
            if (isSalesPage) {
                return;
            }

            if (
                event.target.closest("[data-item-quantity]") ||
                event.target.closest("[data-item-price]")
            ) {
                refreshItemsBuilderTotal(
                    event.target.closest("[data-items-builder]")
                );
            }
        });
    }

    async function loadData() {
        setStatus("Carregando dados...");

        try {
            if (config.mode === "single") {
                const response = await apiGet(config.endpoint);
                records = normalizeResponse(response).filter(Boolean);
                fillForm(records[0] || {});
            } else {
                const response = await apiGet(config.endpoint);
                records = normalizeResponse(response);
            }

            renderTable();

            updateGenericInsights();

            updateSalesSummary();
            setStatus(`${records.length} registro(s) carregado(s).`);
            return true;
        } catch (error) {
            records = [];
            renderTable();

            updateGenericInsights();

            updateSalesSummary();
            setStatus(error.message || "Não foi possível carregar os dados.");
            return false;
        }
    }

    async function saveRecord(event) {
        event.preventDefault();
        if (savingRecord || isReadOnlyPage || isSalesPage) return;
        savingRecord = true;
        setStatus("Salvando...");
        setRecordFormFeedback("Salvando o registro...");

        try {
            const payload = readForm();
            const requestPayload = hasFileFields()
                ? buildMultipartPayload(payload)
                : payload;
            setRecordFormBusy(true);
            if (config.mode === "single") {
                await apiPut(config.endpoint, requestPayload);
            } else if (editingId) {
                await apiPut(`${config.endpoint}/${editingId}`, requestPayload);
            } else {
                await apiPost(config.endpoint, requestPayload);
            }

            resetForm();
            setRecordFormFeedback("Registro salvo. Atualizando a lista...");
            const refreshed = await loadData();
            const message = refreshed ? "Registro salvo com sucesso." :
                "Registro salvo. Não foi possível atualizar a lista; use Atualizar para conferir os dados.";
            setStatus(message);
            setRecordFormFeedback(message, refreshed ? "success" : "info");
        } catch (error) {
            setStatus(error.message || "Não foi possível salvar.");
            setRecordFormFeedback(error.message || "Não foi possível salvar. Confira os dados e tente novamente.", "error");
        } finally {
            savingRecord = false;
            setRecordFormBusy(false);
        }
    }

    async function deleteRecord(id) {
        const confirmation = config.deleteConfirmation || "Deseja remover este registro?";
        if (!id || !confirm(confirmation)) {
            return;
        }

        setStatus("Removendo...");

        try {
            await apiDelete(`${config.endpoint}/${id}`);
            await loadData();
            setStatus("Registro removido com sucesso.");
        } catch (error) {
            setStatus(error.message || "Não foi possível remover.");
        }
    }

    function editRecord(id) {
        if (savingRecord || isReadOnlyPage || isSalesPage) return;
        const record = records.find(item =>
            String(getRecordValue(item, config.idKey || "id")) === String(id)
        );

        if (!record) {
            return;
        }

        editingId = id;
        fillForm(record);
        setText("formTitle", "Editar registro");
        setRecordFormFeedback("");
        syncRecordFormActions();
        revealRecordForm();
    }

    function fillForm(record) {
        (config.fields || []).forEach(field => {
            const input = document.querySelector(`[name="${field.name}"]`);

            if (field.type === "items-builder") {
                fillItemsBuilder(
                    field.name,
                    getRecordValue(record, field.name, [])
                );
                return;
            }

            if (!input) {
                return;
            }

            const value = getRecordValue(record, field.name, "");

            if (config.key === "produtos" && field.name === "categoriaId") productCategoryValue = value;
            if (config.key === "produtos" && field.name === "subcategoria") {
                syncProductSubcategory(value);
                return;
            }

            if (field.type === "file") {
                input.required = Boolean(field.required && !value);
                input.dataset.currentUrl = value;
                renderFilePreview(input, value);
                return;
            }

            if (field.type === "checkbox") {
                input.checked = value === true || value === "true";
                return;
            }

            if (field.type === "date" && value) {
                input.value = String(value).slice(0, 10);
                return;
            }

            if (field.type === "datetime-local" && value) {
                const date = new Date(value);
                input.value = Number.isNaN(date.getTime())
                    ? String(value).slice(0, 16)
                    : new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                        .toISOString().slice(0, 16);
                return;
            }

            input.value =
                field.type === "json" && typeof value !== "string"
                    ? JSON.stringify(value || {}, null, 2)
                    : value;
        });
    }

    function resetForm() {
        editingId = null;
        buildForm();
        populateRemoteSelects();
        setText("formTitle", config.formTitle || "Novo registro");
        syncRecordFormActions();
    }

    function readForm() {
        const data = {};
        const form = document.getElementById("recordForm");

        if (!form) {
            return data;
        }

        (config.fields || []).forEach(field => {
            if (field.type === "items-builder") {
                data[field.name] = readItemsBuilder(field.name);
                return;
            }

            const input = form.elements[field.name];

            if (!input) {
                return;
            }

            if (field.type === "file") {
                data[field.name] = input.files?.[0] || null;
                return;
            }

            let value = input.value.trim();

            if (field.type === "number") {
                value = value === "" ? null : Number(value);
            }

            if (field.type === "checkbox") {
                value = input.checked;
            }

            if (field.type === "json") {
                try {
                    value = value ? JSON.parse(value) : null;
                } catch {
                    value = null;
                }
            }

            data[field.name] = value;
        });

        return data;
    }

    function hasFileFields() {
        return (config.fields || []).some(field => field.type === "file");
    }

    function buildMultipartPayload(payload) {
        const formData = new FormData();

        (config.fields || []).forEach(field => {
            const value = payload[field.name];

            if (value === null || value === undefined || value === "") {
                return;
            }

            if (field.type === "file") {
                formData.append(field.name, value);
                return;
            }

            formData.append(
                field.name,
                typeof value === "object" ? JSON.stringify(value) : String(value)
            );
        });

        return formData;
    }

    function renderFilePreview(input, currentUrl = "") {
        const preview = input.closest(".form-group")?.querySelector("[data-file-preview]");
        const image = preview?.querySelector("img");
        const placeholder = preview?.querySelector("span");

        if (!preview || !image || !placeholder) {
            return;
        }

        if (input.dataset.previewUrl) {
            URL.revokeObjectURL(input.dataset.previewUrl);
            delete input.dataset.previewUrl;
        }

        const file = input.files?.[0];
        const source = file ? URL.createObjectURL(file) : currentUrl;

        if (!source) {
            image.hidden = true;
            image.removeAttribute("src");
            placeholder.hidden = false;
            return;
        }

        if (file) {
            input.dataset.previewUrl = source;
        }

        image.src = source;
        image.hidden = false;
        placeholder.hidden = true;
    }

    function renderTable() {
        const head = document.getElementById("tableHead");
        const body = document.getElementById("tableBody");

        if (!head || !body) {
            return;
        }

        const columns = config.columns || [];
        const showActions = config.mode !== "single" && (!isReadOnlyPage || config.allowDelete === true) &&
            (config.allowEdit !== false || config.allowDelete !== false || config.key === "compras");
        const filtered = getFilteredRecords();
        syncSalesFilterState(filtered.length);
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        currentPage = Math.min(currentPage, totalPages);
        const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        renderPagination(filtered.length, totalPages);

        if (isSalesPage) {
            renderSalesList(head, body, paged);
            return;
        }

        head.innerHTML = `
            <tr>
                ${columns.map(column => `
                    <th>${escapeHtml(column.label)}</th>
                `).join("")}

                ${showActions ? "<th>Ações</th>" : ""}
            </tr>
        `;

        if (!filtered.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="${columns.length + (showActions ? 1 : 0)}">
                        <div class="empty-state">
                            <i class="fa-regular fa-folder-open"></i>

                            <strong>Nenhum registro encontrado</strong>

                            <span>
                                Não existem registros para exibir.
                            </span>
                        </div>
                    </td>
                </tr>
            `;

            return;
        }

        body.innerHTML = paged.map(record => `
            <tr>
                ${columns.map(column => `
                    <td data-label="${escapeHtml(column.label)}">
                        ${formatValue(
                            getRecordValue(record, column.key),
                            column
                        )}
                    </td>
                `).join("")}

                ${showActions ? `
                    <td data-label="Ações">
                        <div class="row-actions">
                            ${buildRowActions(record)}
                        </div>
                    </td>
                ` : ""}
            </tr>
        `).join("");
    }

    function renderPagination(total, totalPages) {
        const wrap = document.querySelector(".table-wrap");
        if (!wrap) return;
        let controls = wrap.parentElement.querySelector(".admin-pagination");
        if (!controls) {
            controls = document.createElement("div");
            controls.className = "admin-pagination";
            wrap.insertAdjacentElement("afterend", controls);
            controls.addEventListener("click", event => {
                const button = event.target.closest("button[data-page]");
                if (!button) return;
                currentPage = Math.max(1, Math.min(Number(button.dataset.page), Number(button.dataset.pages)));
                renderTable();
            });
        }
        controls.innerHTML = `<span>${total} registro(s) · página ${currentPage} de ${totalPages}</span>
            <div><button class="btn btn-small" type="button" data-page="${currentPage - 1}" data-pages="${totalPages}"
                ${currentPage <= 1 ? "disabled" : ""}>Anterior</button>
            <button class="btn btn-small" type="button" data-page="${currentPage + 1}" data-pages="${totalPages}"
                ${currentPage >= totalPages ? "disabled" : ""}>Próxima</button></div>`;
    }

    function renderSalesList(head, body, filtered) {
        head.innerHTML = "";

        if (!filtered.length) {
            const filters = readSalesFilters();
            const invalidRange = window.NacaoAnimalOrderFilters?.validateRange(filters.from, filters.to);
            body.innerHTML = `
                <tr>
                    <td>
                        <div class="empty-state">
                            <i class="fa-regular fa-folder-open"></i>

                            <strong>${invalidRange ? "Confira o período selecionado" : "Nenhum pedido encontrado"}</strong>

                            <span>
                                ${invalidRange ? "Ajuste as datas acima para consultar os pedidos." : records.length ? "Nenhum pedido corresponde aos filtros. Você pode limpar a seleção para ver todos." : "Os pedidos recebidos pela loja aparecerão aqui."}
                            </span>
                        </div>
                    </td>
                </tr>
            `;

            return;
        }

        body.innerHTML = filtered.map(record => `
            <tr class="sale-card-row">
                <td>
                    <article class="sale-card-summary">
                        <header>
                            <div>
                                <span>Pedido #${escapeHtml(shortRecordId(record.id))}</span>
                                <strong>${escapeHtml(record.cliente_nome || "Cliente não informado")}</strong>
                            </div>

                            ${formatValue(record.status, { type: "status" })}
                        </header>

                        <dl>
                            <div>
                                <dt>Data</dt>
                                <dd>${escapeHtml(formatAdminDate(record.data_venda))}</dd>
                            </div>

                            <div>
                                <dt>Itens</dt>
                                <dd>${escapeHtml(record.quantidade_itens || 0)}</dd>
                            </div>

                            <div>
                                <dt>Pagamento</dt>
                                <dd>${escapeHtml(formatPaymentLabel(record.forma_pagamento))}</dd>
                            </div>

                            <div>
                                <dt>Total</dt>
                                <dd>${formatAdminCurrency(record.valor_final)}</dd>
                            </div>
                        </dl>

                        <footer>
                            <button
                                class="btn btn-small"
                                type="button"
                                data-action="details"
                                data-id="${escapeHtml(record.id)}">
                                <i class="fa-solid fa-receipt"></i>
                                Ver detalhes
                            </button>
                        </footer>
                    </article>
                </td>
            </tr>
        `).join("");
    }

    function buildRowActions(record) {
        if (isSalesPage) {
            return `
                <button
                    class="btn btn-small"
                    type="button"
                    data-action="details"
                    data-id="${escapeHtml(record.id)}"
                    title="Ver detalhes e atualizar status">
                    <i class="fa-solid fa-eye"></i>
                    Status
                </button>
            `;
        }

        const id = getRecordValue(record, config.idKey || "id");

        if (config.key === "compras") {
            return record.status === "CANCELADA"
                ? '<span class="status-badge">Cancelada</span>'
                : `<button class="btn btn-small btn-danger" type="button"
                    data-action="cancel-purchase" data-id="${escapeHtml(id)}">
                    <i class="fa-solid fa-ban"></i>Cancelar</button>`;
        }

        return `
            ${config.allowEdit === false ? "" : `<button
                class="icon-btn"
                type="button"
                data-action="edit"
                data-id="${escapeHtml(id)}"
                title="Editar">
                <i class="fa-solid fa-pen"></i>
            </button>`}

            ${config.allowDelete === false ? "" : `<button
                class="icon-btn"
                type="button"
                data-action="delete"
                data-id="${escapeHtml(id)}"
                title="${escapeHtml(config.deleteLabel || "Excluir")}">
                <i class="fa-solid fa-trash"></i>
            </button>`}
        `;
    }

    async function cancelPurchase(id) {
        const motivo = await askReason(
            "Cancelar compra",
            "Explique o cancelamento. O estoque e a conta a pagar serão revertidos."
        );
        if (!motivo) return;
        setStatus("Cancelando compra...");
        try {
            await apiPost(`${config.endpoint}/${id}/cancelar`, { motivo });
            await loadData();
            setStatus("Compra cancelada com sucesso.");
        } catch (error) {
            setStatus(error.message || "Não foi possível cancelar a compra.");
        }
    }

    function askReason(title, description) {
        return new Promise(resolve => {
            const dialog = document.createElement("dialog");
            dialog.className = "admin-dialog";
            dialog.innerHTML = `<form method="dialog">
                <h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>
                <textarea class="form-control" minlength="5" maxlength="500" required></textarea>
                <div class="form-actions"><button class="btn" value="cancel">Voltar</button>
                <button class="btn btn-danger" value="confirm">Confirmar</button></div></form>`;
            document.body.appendChild(dialog);
            dialog.addEventListener("close", () => {
                const text = dialog.returnValue === "confirm"
                    ? dialog.querySelector("textarea").value.trim() : "";
                dialog.remove();
                resolve(text.length >= 5 ? text : "");
            });
            dialog.showModal();
            dialog.querySelector("textarea").focus();
        });
    }

    function exportCsv() {
        if (isSalesPage) {
            const filters = readSalesFilters();
            if (window.NacaoAnimalOrderFilters?.validateRange(filters.from, filters.to)) return;
        }
        const list = getFilteredRecords();
        const columns = config.columns || [];
        const quote = value => {
            const text = String(value ?? "");
            const spreadsheetSafe = /^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)
                ? `'${text}`
                : text;
            return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
        };
        const rows = [columns.map(column => quote(column.label)).join(";")];
        for (const record of list) {
            rows.push(columns.map(column => quote(getRecordValue(record, column.key, ""))).join(";"));
        }
        const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${config.key}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function renderSaleEmptyState(container) {
        ++saleDetailsRevision;
        selectedSaleId = null;
        container.setAttribute("aria-busy", "false");
        setText("formTitle", "Detalhes do pedido");

        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-receipt"></i>

                <strong>Selecione um pedido</strong>

                <span>
                    Os detalhes completos do pedido aparecerão neste painel.
                </span>
            </div>
        `;
    }

    async function showSaleDetails(id) {
        const form = document.getElementById("recordForm");

        if (!form || !id) {
            return;
        }

        selectedSaleId = id;
        const revision = ++saleDetailsRevision;
        form.setAttribute("aria-busy", "true");
        setText("formTitle", "Detalhes do pedido");

        form.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>

                <strong>Carregando pedido...</strong>

                <span>
                    Aguarde enquanto buscamos os detalhes.
                </span>
            </div>
        `;

        try {
            const sale = await apiGet(`${config.endpoint}/${id}`);
            if (revision !== saleDetailsRevision || selectedSaleId !== id) return;
            renderSaleDetails(form, sale);
            form.closest(".panel")?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        } catch (error) {
            if (revision !== saleDetailsRevision || selectedSaleId !== id) return;
            form.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation"></i>

                    <strong>
                        Não foi possível carregar o pedido
                    </strong>

                    <span>
                        ${escapeHtml(error.message || "Tente novamente.")}
                    </span>
                </div>
            `;
        } finally {
            if (revision === saleDetailsRevision) form.setAttribute("aria-busy", "false");
        }
    }

    function renderSaleDetails(container, sale) {
        const customer = sale?.cliente || {};
        const items = Array.isArray(sale?.itens) ? sale.itens : [];
        const address = formatCustomerAddress(sale?.endereco_entrega || customer);
        const currentStatus = sale?.status || "";

        container.innerHTML = `
            <section class="sale-details">
                <div class="form-group">
                    <label>Pedido</label>

                    <strong>
                        #${escapeHtml(shortRecordId(sale?.id))}
                    </strong>
                </div>

                <div
                    class="form-group"
                    data-sale-status-form
                    data-id="${escapeHtml(sale?.id || selectedSaleId || "")}">
                    <label for="saleStatus">Status do pedido</label>

                    <select
                        id="saleStatus"
                        name="status"
                        class="form-control"
                        required>
                        ${buildSaleStatusOptions(currentStatus)}
                    </select>

                    <button
                        class="btn btn-primary"
                        type="button"
                        data-action="update-sale-status">
                        Atualizar status
                    </button>
                </div>

                <div class="form-group">
                    <label>Data</label>

                    <span>
                        ${escapeHtml(formatAdminDate(sale?.data_venda))}
                    </span>
                </div>

                ${currentStatus === "SAIU_PARA_ENTREGA" ? `<div class="form-group">
                    <label>GPS da entrega</label>
                    <a class="btn btn-primary" href="/admin/acompanhar-entrega?pedido=${encodeURIComponent(sale.id)}">Acompanhar entrega</a>
                    <button class="btn" type="button" id="createDriverLink">Gerar link para o entregador</button>
                    <p>O link vale por 12 horas. Gerar outro invalida o anterior. Envie apenas ao entregador deste pedido.</p>
                    <input class="form-control" id="driverLink" aria-label="Link do entregador" readonly hidden>
                    <div id="driverLinkActions" hidden>
                        <button class="btn" type="button" id="copyDriverLink">Copiar link</button>
                        <button class="btn" type="button" id="shareDriverLink">Compartilhar com entregador</button>
                        <a class="btn" id="openDriverLink" target="_blank" rel="noopener noreferrer">Abrir viagem neste aparelho</a>
                    </div>
                    <span id="driverLinkStatus" role="status"></span>
                </div>` : ""}

                <div class="form-group">
                    <label>Cliente</label>

                    <strong>
                        ${escapeHtml(customer.nome || "Cliente não informado")}
                    </strong>

                    <span>
                        ${escapeHtml(customer.email || "E-mail não informado")}
                    </span>

                    <span>
                        ${escapeHtml(
                            customer.whatsapp ||
                            customer.telefone ||
                            "Telefone não informado"
                        )}
                    </span>
                </div>

                <div class="form-group">
                    <label>Endereço de entrega</label>

                    <span>
                        ${escapeHtml(address)}
                    </span>

                    ${customer.cep ? `
                        <span>
                            CEP: ${escapeHtml(customer.cep)}
                        </span>
                    ` : ""}
                </div>

                <div class="form-group">
                    <label>Forma de pagamento</label>

                    <span>
                        ${escapeHtml(formatPaymentLabel(sale?.forma_pagamento))}
                    </span>
                </div>

                <div class="form-group">
                    <label>Itens do pedido</label>

                    <div class="sale-items">
                        ${items.length ? items.map(item => `
                            <article class="sale-item">
                                <div>
                                    <strong>
                                        ${escapeHtml(item.produto || "Produto")}
                                    </strong>

                                    <span>
                                        ${Number(item.quantidade || 0)}
                                        x
                                        ${formatAdminCurrency(item.preco_unitario)}
                                    </span>
                                </div>

                                <b>
                                    ${formatAdminCurrency(item.subtotal)}
                                </b>
                            </article>
                        `).join("") : `
                            <span>
                                Nenhum item encontrado.
                            </span>
                        `}
                    </div>
                </div>

                <div class="form-group">
                    <label>Valores</label>

                    <span>
                        Total dos produtos:
                        ${formatAdminCurrency(sale?.valor_total)}
                    </span>

                    <span>
                        Desconto:
                        ${formatAdminCurrency(sale?.desconto)}
                    </span>

                    <span>
                        Acréscimo:
                        ${formatAdminCurrency(sale?.acrescimo)}
                    </span>
                    <span>Frete: ${formatAdminCurrency(sale?.valor_frete || 0)}</span>

                    <strong>
                        Total final:
                        ${formatAdminCurrency(sale?.valor_final)}
                    </strong>
                </div>

                <div class="form-group">
                    <label>Observações</label>

                    <span>
                        ${escapeHtml(
                            sale?.observacoes ||
                            "Nenhuma observação."
                        )}
                    </span>
                </div>

                <div class="form-actions">
                    <button
                        class="btn"
                        type="button"
                        data-action="clear-details">
                        Fechar detalhes
                    </button>
                </div>
            </section>
        `;
        setupSaleDelivery(container, sale);
    }

    function setupSaleDelivery(container, sale) {
        const button = container.querySelector('#createDriverLink');
        if (!button) return;
        const input = container.querySelector('#driverLink'), actions = container.querySelector('#driverLinkActions');
        const open = container.querySelector('#openDriverLink'), status = container.querySelector('#driverLinkStatus');
        const revision = saleDetailsRevision;
        const isCurrent = () => revision === saleDetailsRevision && selectedSaleId === sale.id && container.querySelector('#createDriverLink') === button;
        let creating = false, linkVersion = 0;
        const clearLink = () => {
            linkVersion++; input.value = ''; input.hidden = true; actions.hidden = true; open.removeAttribute('href');
        };
        const hasCurrentLink = (url, version) => isCurrent() && !creating && input.value && input.value === url && linkVersion === version;
        button.addEventListener('click', async () => {
            if (!isCurrent() || creating) return;
            creating = true; button.disabled = true; clearLink(); status.textContent = 'Gerando link da entrega...';
            try {
                const payload = await apiPost(`/vendas/${sale.id}/rastreamento`, {});
                if (!isCurrent()) return;
                const url = payload?.data?.url;
                if (typeof url !== 'string' || !/^https?:\/\/[^\s]+\/entregador#[a-f0-9]{64}$/.test(url)) throw new Error('O servidor não retornou um link válido.');
                input.value = url; input.hidden = false; actions.hidden = false; open.href = url;
                button.textContent = 'Gerar novo link para o entregador';
                input.focus(); input.select();
                status.textContent = 'Link pronto. Compartilhe apenas com quem fará esta entrega. Abra no celular e toque em Iniciar viagem. O cliente pode usar Rastrear pedido.';
            } catch (error) {
                if (!isCurrent()) return;
                clearLink(); status.textContent = `${error.message || 'Não foi possível gerar o link.'} Tente novamente.`;
            } finally {
                creating = false;
                if (isCurrent()) button.disabled = false;
            }
        });
        const copyLink = async () => {
            const url = input.value, version = linkVersion;
            if (!hasCurrentLink(url, version)) return;
            try {
                await navigator.clipboard.writeText(url);
                if (hasCurrentLink(url, version)) status.textContent = 'Link copiado. Envie apenas a quem fará esta entrega.';
            } catch {
                if (hasCurrentLink(url, version)) { input.focus(); input.select(); status.textContent = 'Selecione e copie o link acima.'; }
            }
        };
        container.querySelector('#copyDriverLink')?.addEventListener('click', copyLink);
        container.querySelector('#shareDriverLink')?.addEventListener('click', async () => {
            const url = input.value, version = linkVersion;
            if (!hasCurrentLink(url, version)) return;
            if (!navigator.share) return copyLink();
            try { await navigator.share({ title: 'Nação Animal — iniciar viagem', text: 'Abra no celular da entrega e toque em Iniciar viagem. Link exclusivo do entregador.', url }); }
            catch (error) { if (error.name !== 'AbortError' && hasCurrentLink(url, version)) await copyLink(); }
        });
    }

    function buildSaleStatusOptions(currentStatus) {
        const allowed = {
            AGUARDANDO_PAGAMENTO: ["CANCELADA"],
            PAGAMENTO_APROVADO: ["EM_SEPARACAO","SAIU_PARA_ENTREGA","CANCELADA"],
            EM_SEPARACAO: ["SAIU_PARA_ENTREGA","CANCELADA"],
            SAIU_PARA_ENTREGA: ["ENTREGUE","CANCELADA"],
            ENTREGUE: ["FINALIZADA"], FINALIZADA: [], CANCELADA: []
        };
        return getSaleStatusOptions()
            .filter(option => option.value === currentStatus || allowed[currentStatus]?.includes(option.value))
            .map(option => {
                const selected =
                    String(option.value) === String(currentStatus)
                        ? "selected"
                        : "";

                return `
                    <option
                        value="${escapeHtml(option.value)}"
                        ${selected}>
                        ${escapeHtml(option.label)}
                    </option>
                `;
            })
            .join("");
    }

    function getSaleStatusOptions() {
        const statusField = (config.fields || [])
            .find(field => field.name === "status");

        if (Array.isArray(statusField?.options) && statusField.options.length) {
            return statusField.options;
        }

        return [
            {
                value: "AGUARDANDO_PAGAMENTO",
                label: "Aguardando pagamento"
            },
            {
                value: "PAGAMENTO_APROVADO",
                label: "Pedido recebido"
            },
            {
                value: "EM_SEPARACAO",
                label: "Preparando"
            },
            {
                value: "SAIU_PARA_ENTREGA",
                label: "Saiu para entrega"
            },
            {
                value: "ENTREGUE",
                label: "Entregue"
            },
            {
                value: "FINALIZADA",
                label: "Finalizado"
            },
            {
                value: "CANCELADA",
                label: "Cancelado"
            }
        ];
    }

    async function updateSaleStatus(statusForm) {
        if (!statusForm) {
            return;
        }

        const id = statusForm.dataset.id || selectedSaleId;
        const status =
            statusForm.querySelector("[name='status']")?.value;

        if (!id || !status) {
            setStatus("Selecione um status válido.");
            return;
        }

        const button =
            statusForm.querySelector("[data-action='update-sale-status']");
        const originalText = button?.textContent;

        if (button) {
            button.disabled = true;
            button.textContent = "Atualizando...";
        }

        setStatus("Atualizando status do pedido...");

        try {
            const motivoCancelamento = status === "CANCELADA"
                ? await askReason("Cancelar pedido", "Informe o motivo. Se o pedido estiver pago, o reembolso será solicitado ao provedor de pagamento.")
                : "";
            if (status === "CANCELADA" && !motivoCancelamento) {
                setStatus("Cancelamento não realizado.");
                return;
            }
            await patchRequest(`${config.endpoint}/${id}/status`, {
                status,
                motivoCancelamento
            });

            await loadData();
            if (selectedSaleId === id) await showSaleDetails(id);
            setStatus("Status do pedido atualizado com sucesso.");
        } catch (error) {
            setStatus(error.message || "Não foi possível atualizar o status.");
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || "Atualizar status";
            }
        }
    }

    async function patchRequest(endpoint, data) {
        if (typeof apiPatch === "function") {
            return apiPatch(endpoint, data);
        }

        if (typeof request === "function") {
            return request(endpoint, {
                method: "PATCH",
                body: JSON.stringify(data)
            });
        }

        throw new Error("Recurso de atualização não disponível.");
    }

    function formatCustomerAddress(customer) {
        const street = [
            customer.endereco,
            customer.numero
        ]
            .filter(Boolean)
            .join(", ");

        const city = [
            customer.bairro,
            customer.cidade,
            customer.estado
        ]
            .filter(Boolean)
            .join(", ");

        return [
            street,
            customer.complemento,
            city
        ]
            .filter(Boolean)
            .join(" - ") ||
            "Endereço não informado";
    }

    function formatAdminCurrency(value) {
        return Number(value || 0).toLocaleString(
            "pt-BR",
            {
                style: "currency",
                currency: "BRL"
            }
        );
    }

    function formatAdminDate(value) {
        if (!value) {
            return "Data não informada";
        }

        if (isSalesPage && window.NacaoAnimalOrderFilters) {
            const day = window.NacaoAnimalOrderFilters.dateKey(value);
            if (!day) return "Data inválida";
            if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
                return day.split("-").reverse().join("/");
            }
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Data inválida";
        }

        return date.toLocaleString("pt-BR", {
            ...(isSalesPage ? { timeZone: "America/Sao_Paulo" } : {}),
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatPaymentLabel(value) {
        const labels = {
            DINHEIRO: "Dinheiro",
            PIX: "PIX",
            CARTAO_DEBITO: "Cartão de débito",
            CARTAO_CREDITO: "Cartão de crédito",
            PAGBANK: "Aguardando pagamento"
        };

        return labels[value] ||
            String(value || "Não informado")
                .replaceAll("_", " ");
    }

    function shortRecordId(id) {
        return String(id || "")
            .slice(0, 8)
            .toUpperCase();
    }

    function normalizeResponse(response) {
        if (Array.isArray(response)) {
            return response;
        }

        if (Array.isArray(response?.data)) {
            return response.data;
        }

        if (response?.data) {
            return [response.data];
        }

        return [];
    }

    function getRecordValue(record, key, fallback = undefined) {
        if (!record || !key) {
            return fallback;
        }

        if (Object.prototype.hasOwnProperty.call(record, key)) {
            return record[key];
        }

        const snakeKey = toSnake(key);

        if (Object.prototype.hasOwnProperty.call(record, snakeKey)) {
            return record[snakeKey];
        }

        return fallback;
    }

    function formatValue(value, column = {}) {
        if (value === null || value === undefined || value === "") {
            return "-";
        }

        if (typeof value === "boolean") {
            return value ? "Sim" : "Não";
        }

        if (Array.isArray(value)) {
            return `${value.length} item(ns)`;
        }

        if (column.type === "image") {
            return `<img class="admin-product-thumbnail" src="${escapeHtml(String(value))}" alt="Foto do produto" loading="lazy">`;
        }

        if (
            column.type === "currency" ||
            ["preco", "custo", "valor_total", "valor_final", "total"]
                .includes(column.key)
        ) {
            const number = Number(value);

            if (!Number.isNaN(number)) {
                return formatAdminCurrency(number);
            }
        }

        if (column.type === "status" || column.key === "status") {
            return `
                <span class="status-badge">
                    ${escapeHtml(formatStatusLabel(value))}
                </span>
            `;
        }

        if (column.type === "date") {
            return escapeHtml(formatAdminDate(value));
        }

        if (column.type === "payment") {
            return escapeHtml(formatPaymentLabel(value));
        }

        return escapeHtml(String(value));
    }



    function updateSalesSummary() {
        if (!isSalesPage) {
            return;
        }

        const todayKey = formatDateKey(new Date());
        const deliveredRevenue = records
            .filter(record => isDeliveredStatus(record.status))
            .reduce((sum, record) => sum + Number(record.valor_final || 0), 0);
        const todayOrders = records.filter(record =>
            formatDateKey(record.data_venda) === todayKey
        );
        const pendingOrders = records.filter(record =>
            isPendingStatus(record.status)
        );
        const deliveryOrders = records.filter(record =>
            record.status === "SAIU_PARA_ENTREGA"
        );

        const summary = {
            today: {
                value: String(todayOrders.length),
                note: `${pendingOrders.length} pedido(s) pendente(s)`
            },
            delivery: {
                value: String(deliveryOrders.length),
                note: "Pedido(s) em rota"
            },
            paid: {
                value: formatAdminCurrency(deliveredRevenue),
                note: "Total concluído"
            },
            pending: {
                value: String(pendingOrders.length),
                note: "Precisam de atenção"
            }
        };

        document.querySelectorAll("[data-insight-key]").forEach(card => {
            const data = summary[card.dataset.insightKey];

            if (!data) {
                return;
            }

            const value = card.querySelector("[data-insight-value]");
            const note = card.querySelector("[data-insight-note]");

            if (value) {
                value.textContent = data.value;
            }

            if (note) {
                note.textContent = data.note;
            }
        });

        document.querySelectorAll("[data-pipeline-status]").forEach(step => {
            const status = step.dataset.pipelineStatus;
            const value = step.querySelector("[data-pipeline-value]");

            if (!value) {
                return;
            }

            value.textContent = String(
                records.filter(record => record.status === status).length
            );
        });
    }

    function updateGenericInsights() {
        if (isSalesPage) {
            return;
        }

        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        const summary = {
            total: String(records.length),
            active: String(records.filter(record => (record.ativo ?? record.status) !== false).length),
            inactive: String(records.filter(record => (record.ativo ?? record.status) === false).length),
            new_month: String(records.filter(record => {
                const date = new Date(record.created_at);

                return !Number.isNaN(date.getTime()) &&
                    date.getMonth() === currentMonth &&
                    date.getFullYear() === currentYear;
            }).length),
            missing_image: String(records.filter(record => !record.foto).length),
            low_stock: String(records.filter(record => Number(record.quantidade) <= Number(record.estoque_minimo || 0)).length),
            healthy_stock: String(records.filter(record => Number(record.quantidade) > Number(record.estoque_minimo || 0)).length),
            missing_location: String(records.filter(record => !String(record.localizacao || "").trim()).length),
            finance_receivable: formatAdminCurrency(records
                .filter(record => record.tipo === "RECEBER" && ["PENDENTE", "ATRASADO"].includes(record.status))
                .reduce((sum, record) => sum + Number(record.valor || 0) - Number(record.valor_pago || 0), 0)),
            finance_payable: formatAdminCurrency(records
                .filter(record => record.tipo === "PAGAR" && ["PENDENTE", "ATRASADO"].includes(record.status))
                .reduce((sum, record) => sum + Number(record.valor || 0) - Number(record.valor_pago || 0), 0)),
            finance_overdue: String(records.filter(record =>
                ["PENDENTE", "ATRASADO"].includes(record.status) &&
                record.data_vencimento && new Date(`${String(record.data_vencimento).slice(0, 10)}T23:59:59`) < today
            ).length),
            finance_paid: formatAdminCurrency(records
                .filter(record => record.status === "PAGO")
                .reduce((sum, record) => sum + Number(record.valor_pago || record.valor || 0), 0)),
            lgpd_open: String(records.filter(record => ["ABERTA", "EM_ANALISE"].includes(record.status)).length),
            lgpd_due: String(records.filter(record => ["ABERTA", "EM_ANALISE"].includes(record.status) &&
                record.prazo_em && new Date(record.prazo_em).getTime() <= Date.now() + 3 * 86400000).length),
            lgpd_done: String(records.filter(record => record.status === "ATENDIDA").length),
            support_open: String(records.filter(record => ["RECEBIDA", "EM_ANALISE"].includes(record.status)).length),
            support_due: String(records.filter(record => ["RECEBIDA", "EM_ANALISE"].includes(record.status) &&
                record.prazo_em && new Date(record.prazo_em).getTime() <= today.getTime() + 86400000).length),
            support_done: String(records.filter(record => ["ATENDIDA", "NEGADA"].includes(record.status)).length)
        };

        document.querySelectorAll("[data-insight-key]").forEach(card => {
            const key = card.dataset.insightKey;
            const value = card.querySelector("[data-insight-value]");

            if (value && Object.prototype.hasOwnProperty.call(summary, key)) {
                value.textContent = summary[key];
            }
        });
    }

    function isPendingStatus(status) {
        return [
            "PENDENTE",
            "AGUARDANDO_PAGAMENTO",
            "PAGAMENTO_APROVADO",
            "EM_SEPARACAO"
        ].includes(status);
    }

    function isDeliveredStatus(status) {
        return [
            "ENTREGUE",
            "FINALIZADA"
        ].includes(status);
    }

    function formatDateKey(value) {
        if (isSalesPage && window.NacaoAnimalOrderFilters) return window.NacaoAnimalOrderFilters.dateKey(value);
        if (!value) {
            return "";
        }

        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            return value.slice(0, 10);
        }

        const date = value instanceof Date ? value : new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function formatTime(value) {
        return String(value || "").slice(0, 5) || "--:--";
    }

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value || "";
        }
    }

    function setStatus(message) {
        setText("statusLine", message);
    }

    function formatStatusLabel(value) {
        const labels = {
            PENDENTE: "Pendente",
            AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
            PAGAMENTO_APROVADO: "Pedido recebido",
            EM_SEPARACAO: "Preparando",
            SAIU_PARA_ENTREGA: "Saiu para entrega",
            ENTREGUE: "Entregue",
            FINALIZADA: "Finalizado",
            CANCELADA: "Cancelado",
            CONFIRMADO: "Confirmado",
            EM_ANDAMENTO: "Em atendimento",
            CONCLUIDO: "Concluído",
            CANCELADO: "Cancelado",
            PAGO: "Pago",
            ATRASADO: "Atrasado"
        };

        return labels[value] ||
            String(value || "")
                .replaceAll("_", " ")
                .toLowerCase();
    }

    function toSnake(value) {
        return value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    function buildFieldAttributes(field) {
        const attributes = [];

        [
            "placeholder",
            "min",
            "max",
            "step",
            "pattern",
            "title",
            "minlength",
            "maxlength"
        ].forEach(attribute => {
            if (field[attribute] !== undefined && field[attribute] !== null) {
                attributes.push(
                    `${attribute}="${escapeHtml(field[attribute])}"`
                );
            }
        });

        if (field.disabled) attributes.push("disabled");
        if (field.readonly) attributes.push("readonly");

        return attributes.join(" ");
    }

    function buildItemsBuilderField(field) {
        return `
            <div
                class="form-group items-builder"
                data-items-builder="${escapeHtml(field.name)}"
                data-product-key="${escapeHtml(field.productKey || "produto_id")}"
                data-price-key="${escapeHtml(field.priceField || "valor_unitario")}">
                <div class="items-builder-header">
                    <label>${escapeHtml(field.label || "Itens")}</label>

                    <button
                        class="btn btn-small"
                        type="button"
                        data-action="add-item"
                        data-field="${escapeHtml(field.name)}">
                        <i class="fa-solid fa-plus"></i>
                        Adicionar item
                    </button>
                </div>

                <div class="items-builder-columns" aria-hidden="true">
                    <span>Produto</span>
                    <span>Qtd</span>
                    <span>Valor unit.</span>
                    <span></span>
                </div>

                <div class="items-builder-list" data-items-list></div>

                <div class="items-builder-total">
                    <span>Total estimado</span>
                    <strong data-items-total>R$ 0,00</strong>
                </div>
            </div>
        `;
    }

    function addItemRow(fieldName, item = {}) {
        const builder =
            document.querySelector(`[data-items-builder="${fieldName}"]`);
        const list = builder?.querySelector("[data-items-list]");

        if (!builder || !list) {
            return;
        }

        const options = JSON.parse(builder.dataset.options || "[]");
        const productValue =
            item.produto_id ||
            item.produtoId ||
            item.id ||
            "";
        const quantity = item.quantidade || 1;
        const price =
            item.valor_unitario ||
            item.valorUnitario ||
            item.preco_unitario ||
            item.preco ||
            0;

        const row = document.createElement("div");
        row.className = "items-builder-row";
        row.innerHTML = `
            <label class="item-control item-control-product">
                <span>Produto</span>
                <select class="form-control" data-item-product required>
                <option value="">Selecione</option>
                ${options.map(option => `
                    <option
                        value="${escapeHtml(option.value)}"
                        data-price="${escapeHtml(option.price)}"
                        ${String(option.value) === String(productValue) ? "selected" : ""}>
                        ${escapeHtml(option.label || option.value)}
                    </option>
                `).join("")}
                </select>
            </label>

            <label class="item-control">
                <span>Quantidade</span>
                <input
                class="form-control"
                type="number"
                min="1"
                step="1"
                value="${escapeHtml(quantity)}"
                data-item-quantity
                required>
            </label>

            <label class="item-control">
                <span>Valor unitário (R$)</span>
                <input
                class="form-control"
                type="number"
                min="0"
                step="0.01"
                value="${escapeHtml(price)}"
                data-item-price
                required>
            </label>

            <button
                class="icon-btn"
                type="button"
                data-action="remove-item"
                aria-label="Remover item"
                title="Remover item">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        list.appendChild(row);
        if (savingRecord) setRecordFormBusy(true);
        refreshItemsBuilderTotal(builder);
    }

    function fillItemsBuilder(fieldName, items) {
        const builder =
            document.querySelector(`[data-items-builder="${fieldName}"]`);
        const list = builder?.querySelector("[data-items-list]");

        if (!builder || !list) {
            return;
        }

        list.innerHTML = "";

        (Array.isArray(items) && items.length ? items : [{}])
            .forEach(item => addItemRow(fieldName, item));

        refreshItemsBuilderTotal(builder);
    }

    function readItemsBuilder(fieldName) {
        const builder =
            document.querySelector(`[data-items-builder="${fieldName}"]`);
        const productKey = builder?.dataset.productKey || "produto_id";
        const priceKey = builder?.dataset.priceKey || "valor_unitario";

        return [...(builder?.querySelectorAll(".items-builder-row") || [])]
            .map(row => {
                const produto =
                    row.querySelector("[data-item-product]")?.value;
                const quantidade = Number(
                    row.querySelector("[data-item-quantity]")?.value || 0
                );
                const valor = Number(
                    row.querySelector("[data-item-price]")?.value || 0
                );

                return {
                    [productKey]: produto,
                    quantidade,
                    [priceKey]: valor
                };
            })
            .filter(item => item[productKey] && item.quantidade > 0);
    }

    function refreshItemsBuilderTotal(builder) {
        if (!builder) {
            return;
        }

        const total = [...builder.querySelectorAll(".items-builder-row")]
            .reduce((sum, row) => {
                const quantity = Number(
                    row.querySelector("[data-item-quantity]")?.value || 0
                );
                const price = Number(
                    row.querySelector("[data-item-price]")?.value || 0
                );

                return sum + quantity * price;
            }, 0);

        const totalElement = builder.querySelector("[data-items-total]");

        if (totalElement) {
            totalElement.textContent = formatAdminCurrency(total);
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function normalizeSearch(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }
})();
