"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const status = document.getElementById("unsubscribeStatus");
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    const token = params.get("token");

    try {
        const response = await fetch(
            `/api/public/newsletter/cancelar?email=${encodeURIComponent(email || "")}&token=${encodeURIComponent(token || "")}`
        );
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.message || "Não foi possível cancelar sua inscrição.");
        }

        setText(status, payload.message || "Inscrição cancelada com sucesso.");
    } catch (error) {
        setText(status, error.message || "Não foi possível cancelar sua inscrição.");
    }
});

function setText(element, value) {
    if (element) {
        element.textContent = value || "";
    }
}
