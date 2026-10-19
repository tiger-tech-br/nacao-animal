"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const links = document.querySelectorAll("[data-store-contact]");
    if (!links.length) return;
    try {
        const response = await fetch("/api/public/loja");
        if (!response.ok) return;
        const { data } = await response.json();
        const email = String(data?.email || "").trim();
        if (!email) return;
        links.forEach(link => {
            link.href = `mailto:${email}`;
            link.textContent = email;
        });
    } catch {
        // Mantem o telefone da loja se o e-mail ainda nao estiver cadastrado ou a consulta falhar.
    }
});
