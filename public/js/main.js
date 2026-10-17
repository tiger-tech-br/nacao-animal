"use strict";

(function () {
    if (document.querySelector("script[src='/js/layout/sidebar.js']")) {
        return;
    }

    const script = document.createElement("script");
    script.src = "/js/layout/sidebar.js";
    script.defer = true;
    document.head.appendChild(script);
})();
