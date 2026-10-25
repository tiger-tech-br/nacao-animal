"use strict";
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.NacaoMapsLocationLink = api;
})(typeof window === "object" ? window : this, function () {
    function parse(value) {
        const message = "Cole somente o link de Compartilhamento de local do Google Maps.";
        if (typeof value !== "string") throw new Error(message);
        const input = value.trim();
        if (!input || input.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(input) || /%(?:00|0a|0d|5c)/i.test(input)) throw new Error(message);
        let url;
        try { url = new URL(input); } catch { throw new Error(message); }
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.href.length > 2048) throw new Error(message);
        const short = url.hostname === "maps.app.goo.gl" && /^\/[A-Za-z0-9_-]{4,200}\/?$/.test(url.pathname);
        const legacy = url.hostname === "goo.gl" && /^\/maps\/[A-Za-z0-9_-]{4,200}\/?$/.test(url.pathname);
        const long = ["www.google.com", "google.com", "maps.google.com"].includes(url.hostname)
            && /^\/maps(?:\/|$)/.test(url.pathname)
            && !/^\/maps\/(?:dir|search|place|embed|d|preview)(?:\/|$)/i.test(url.pathname)
            && (url.pathname.length > 6 || url.search.length > 1);
        if (!short && !legacy && !long) throw new Error(message);
        // O formato é validado; somente o Google pode confirmar se o link está ao vivo.
        return url.href;
    }
    return Object.freeze({ parse });
});
