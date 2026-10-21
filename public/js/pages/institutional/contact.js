"use strict";

document.addEventListener("DOMContentLoaded", loadContactStoreInfo);

async function loadContactStoreInfo() {
    try {
        const response = await fetch("/api/public/loja");
        if (!response.ok) return;
        const payload = await response.json();
        const store = payload.data;
        if (payload.success === false || !store || typeof store !== "object" || Array.isArray(store)) return;

        const address = [store.endereco, store.numero, store.complemento, store.bairro, store.cidade, store.estado, store.cep]
            .map(contactText).filter(Boolean).join(", ");
        const addressElement = document.querySelector("[data-contact-address]");
        const map = document.querySelector("[data-contact-map]");
        if (address && addressElement) addressElement.textContent = address;
        if (address && map) map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

        const phone = contactText(store.telefone);
        const digits = phone.replace(/\D/g, "");
        const phoneElement = document.querySelector("[data-contact-phone]");
        const internationalPhone = /^\d{10,11}$/.test(digits) ? `55${digits}`
            : /^55\d{10,11}$/.test(digits) ? digits : "";
        if (internationalPhone && phoneElement) {
            phoneElement.textContent = phone;
            phoneElement.href = `tel:+${internationalPhone}`;
        }

        const email = contactText(store.email);
        const emailElement = document.querySelector("[data-contact-email]");
        const emailNote = document.querySelector("[data-contact-email-note]");
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && emailElement) {
            emailElement.textContent = email;
            emailElement.href = `mailto:${encodeURIComponent(email)}`;
            emailElement.hidden = false;
            if (emailNote) emailNote.hidden = true;
        }

        const opening = contactTime(store.horario_abertura);
        const closing = contactTime(store.horario_fechamento);
        const hours = document.querySelector("[data-contact-hours]");
        if (opening && closing && hours) {
            hours.textContent = `Das ${opening} às ${closing}. Consulte os dias de atendimento com a loja.`;
        }
    } catch {
        // Mantém os contatos já conhecidos quando a API estiver indisponível.
    }
}

function contactText(value) {
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function contactTime(value) {
    const time = contactText(value);
    return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time) ? time.slice(0, 5) : "";
}
