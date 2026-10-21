"use strict";

(function (root, factory) {
    const filters = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = filters;
    }

    if (root) {
        root.NacaoAnimalOrderFilters = filters;
    }
})(typeof window !== "undefined" ? window : null, function () {
    const statusLabels = Object.freeze({
        AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
        PAGAMENTO_APROVADO: "Pedido recebido",
        EM_SEPARACAO: "Preparando",
        SAIU_PARA_ENTREGA: "Saiu para entrega",
        ENTREGUE: "Entregue",
        FINALIZADA: "Finalizado",
        CANCELADA: "Cancelado"
    });
    const storeDate = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    function normalizeSearch(value) {
        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function normalizeStatus(value) {
        return String(value ?? "").trim().toUpperCase();
    }

    function validDateLiteral(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }

        const [year, month, day] = value.split("-").map(Number);
        const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
    }

    function dateKey(value) {
        if (typeof value === "string") {
            const text = value.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                return validDateLiteral(text) ? text : "";
            }

            // A timestamp needs an explicit zone so the computer's zone cannot change its day.
            const timestamp = text.match(/^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?([Zz]|[+-]\d{2}:?\d{2})$/);
            if (!timestamp || !validDateLiteral(timestamp[1]) ||
                Number(timestamp[2]) > 23 || Number(timestamp[3]) > 59 ||
                Number(timestamp[4] || 0) > 59) {
                return "";
            }
            value = text;
        } else if (!(value instanceof Date) && typeof value !== "number") {
            return "";
        }

        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) {
            return "";
        }

        const parts = Object.fromEntries(storeDate.formatToParts(date)
            .filter(part => part.type !== "literal")
            .map(part => [part.type, part.value]));
        return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`;
    }

    function validateRange(from = "", to = "") {
        const start = String(from ?? "").trim();
        const end = String(to ?? "").trim();

        if ((start && !validDateLiteral(start)) || (end && !validDateLiteral(end))) {
            return "Informe datas válidas para o período.";
        }

        if (start && end && start > end) {
            return "A data inicial não pode ser posterior à data final.";
        }

        return "";
    }

    function matchesStatus(orderStatus, filterStatus) {
        const status = normalizeStatus(filterStatus);
        return !status || normalizeStatus(orderStatus) === status;
    }

    function filter(records, { query = "", status = "", from = "", to = "" } = {}) {
        if (!Array.isArray(records) || validateRange(from, to)) {
            return [];
        }

        const search = normalizeSearch(query);
        const start = String(from ?? "").trim();
        const end = String(to ?? "").trim();

        return records.filter(record => {
            if (!matchesStatus(record?.status, status)) {
                return false;
            }

            const label = statusLabels[normalizeStatus(record?.status)] || "";
            if (search && !normalizeSearch(`${JSON.stringify(record) ?? ""} ${label}`).includes(search)) {
                return false;
            }

            if (start || end) {
                const day = dateKey(record?.data_venda);
                return Boolean(day) && (!start || day >= start) && (!end || day <= end);
            }

            return true;
        });
    }

    return Object.freeze({ filter, matchesStatus, dateKey, validateRange });
});
