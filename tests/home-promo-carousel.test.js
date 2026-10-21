"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function element(parent = null, tagName = "DIV") {
    const listeners = new Map();
    return {
        parent, tagName, dataset: {}, attributes: {}, hidden: false, textContent: "",
        addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
        emit(type, event = {}) {
            const payload = { target: this, preventDefault() { this.prevented = true; }, ...event };
            for (const listener of listeners.get(type) || []) listener(payload);
            return payload;
        },
        setAttribute(name, value) { this.attributes[name] = value; },
        contains(node) { for (let current = node; current; current = current.parent) if (current === this) return true; return false; },
        closest() { return ["A", "INPUT", "SELECT", "TEXTAREA"].includes(this.tagName) ? this : null; },
        querySelector() { return null; }, querySelectorAll() { return []; }
    };
}

function page({ reducedMotion = false, noCarousel = false, incomplete = false, initialFocus = null, readyState = "loading" } = {}) {
    const carousel = element();
    const controls = element(carousel);
    controls.hidden = true;
    const track = element(carousel);
    const previous = element(controls, "BUTTON");
    const next = element(controls, "BUTTON");
    const dots = Array.from({ length: 3 }, (_, index) => {
        const dot = element(controls, "BUTTON");
        dot.dataset.promoGo = String(index);
        return dot;
    });
    const slides = Array.from({ length: 3 }, (_, index) => {
        const slide = element(track);
        slide.hidden = index !== 0;
        return slide;
    });
    const slideLink = element(slides[0], "A");
    const status = element(carousel);
    const selectors = {
        "[data-promo-controls]": controls, "[data-promo-prev]": previous,
        "[data-promo-next]": incomplete ? null : next,
        "[data-promo-status]": status, "[data-promo-track]": track
    };
    carousel.querySelector = selector => selectors[selector] || null;
    carousel.querySelectorAll = selector => ({ "[data-promo-slide]": slides, "[data-promo-go]": dots })[selector] || [];
    const document = element();
    document.hidden = false;
    document.activeElement = initialFocus === "next" ? next : initialFocus === "slide-link" ? slideLink : null;
    document.readyState = readyState;
    document.querySelector = selector => selector === ".home-promo" && !noCarousel ? carousel : null;
    const motion = element();
    motion.matches = reducedMotion;
    const timers = new Map();
    let serial = 0;
    const context = {
        document,
        matchMedia: () => motion,
        setInterval(callback, delay) { assert.equal(delay, 7000); const id = ++serial; timers.set(id, callback); return id; },
        clearInterval: id => timers.delete(id)
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync("public/js/pages/home/promo-carousel.js", "utf8"), context);
    document.emit("DOMContentLoaded");
    return {
        carousel, controls, previous, next, dots, slides, slideLink, status, document, timers, motion,
        tick() { for (const callback of [...timers.values()]) callback(); },
        active: () => slides.findIndex(slide => !slide.hidden)
    };
}

test("sem botão de pausa, avisos avançam a cada sete segundos e voltam ao primeiro sem anúncios automáticos", () => {
    const ui = page();
    assert.equal(ui.active(), 0);
    assert.equal(ui.controls.hidden, false);
    assert.equal(ui.timers.size, 1);
    for (const expected of [1, 2, 0]) {
        ui.tick();
        assert.equal(ui.active(), expected);
        assert.equal(ui.slides.filter(slide => !slide.hidden).length, 1);
        assert.equal(ui.dots.filter(dot => dot.attributes["aria-current"] === "true").length, 1);
        assert.equal(ui.dots[expected].attributes["aria-current"], "true");
        assert.equal(ui.status.textContent, "", "Autoplay não deve interromper leitor de tela");
    }
    ui.document.emit("DOMContentLoaded");
    assert.equal(ui.timers.size, 1, "Reinicialização não duplica a rotação");
});

test("script defer inicializa também com documento interativo ou completo sem duplicar temporizador", () => {
    for (const readyState of ["interactive", "complete"]) {
        const ui = page({ readyState });
        assert.equal(ui.controls.hidden, false);
        assert.equal(ui.timers.size, 1);
        ui.tick();
        assert.equal(ui.active(), 1);
        ui.document.emit("DOMContentLoaded");
        assert.equal(ui.timers.size, 1);
    }
});

test("setas, indicadores e teclado mudam o aviso com status, preservando teclas de links e formulários", () => {
    const ui = page();
    const initialTimer = [...ui.timers.keys()][0];
    ui.previous.emit("click");
    assert.equal(ui.timers.size, 1, "Mudar manualmente não duplica o temporizador");
    assert.notEqual([...ui.timers.keys()][0], initialTimer, "A ação manual reinicia o intervalo completo");
    assert.equal(ui.active(), 2);
    assert.equal(ui.status.textContent, "Aviso 3 de 3.");
    ui.next.emit("click");
    assert.equal(ui.active(), 0);
    ui.dots[1].emit("click");
    assert.equal(ui.active(), 1);
    assert.equal(ui.status.attributes["aria-live"], "polite");
    const handled = ui.carousel.emit("keydown", { key: "ArrowRight", target: ui.next });
    assert.equal(ui.active(), 2);
    assert.equal(handled.prevented, true);
    for (const target of [element(ui.slides[0], "A"), element(ui.controls, "INPUT"), element(null, "BUTTON")]) {
        const event = ui.carousel.emit("keydown", { key: "ArrowRight", target });
        assert.equal(event.prevented, undefined);
        assert.equal(ui.active(), 2);
    }
    ui.carousel.emit("keydown", { key: "ArrowLeft", target: ui.carousel });
    assert.equal(ui.active(), 1);
    ui.carousel.emit("keydown", { key: "ArrowRight", target: ui.next, altKey: true });
    assert.equal(ui.active(), 1, "Atalho do navegador não é capturado");
    ui.tick();
    assert.equal(ui.active(), 2, "O carrossel segue automaticamente depois da navegação manual");
    assert.equal(ui.timers.size, 1);
});

test("mouse sobre o banner e foco nas setas ou indicadores não travam o autoplay", () => {
    const ui = page({ initialFocus: "next" });
    assert.equal(ui.timers.size, 1, "Foco inicial no controle não desativa a rotação");
    for (const type of ["mouseenter", "mouseleave"]) {
        ui.carousel.emit(type);
        assert.equal(ui.timers.size, 1);
    }
    for (const target of [ui.previous, ui.next, ui.dots[1]]) {
        ui.document.activeElement = target;
        ui.carousel.emit("focusin", { target });
        assert.equal(ui.timers.size, 1, "Controles podem permanecer focados sem suspender os slides");
        const before = ui.active();
        ui.tick();
        assert.equal(ui.active(), (before + 1) % 3);
    }
});

test("foco dentro do conteúdo do slide preserva o link visível e sair para os controles retoma a rotação", () => {
    const ui = page({ initialFocus: "slide-link" });
    assert.equal(ui.timers.size, 0);
    ui.tick();
    assert.equal(ui.active(), 0, "Não esconde o link que está recebendo foco");
    const nested = element(ui.slideLink, "SPAN");
    ui.document.activeElement = nested;
    ui.carousel.emit("focusin", { target: nested });
    assert.equal(ui.timers.size, 0);
    ui.document.activeElement = ui.next;
    ui.carousel.emit("focusout", { target: nested, relatedTarget: ui.next });
    assert.equal(ui.timers.size, 1);
    ui.tick();
    assert.equal(ui.active(), 1);

    const secondLink = element(ui.slides[1], "A");
    ui.document.activeElement = secondLink;
    ui.carousel.emit("focusin", { target: secondLink });
    assert.equal(ui.timers.size, 0);
    ui.document.activeElement = null;
    ui.carousel.emit("focusout", { target: secondLink, relatedTarget: null });
    assert.equal(ui.timers.size, 1);
});

test("aba oculta suspende o temporizador e voltar à página retoma sem duplicação", () => {
    const ui = page();
    ui.document.hidden = true;
    ui.document.emit("visibilitychange");
    assert.equal(ui.timers.size, 0);
    ui.tick();
    assert.equal(ui.active(), 0);
    ui.next.emit("click");
    assert.equal(ui.timers.size, 0);
    ui.document.hidden = false;
    ui.document.emit("visibilitychange");
    assert.equal(ui.timers.size, 1);
    ui.document.emit("visibilitychange");
    assert.equal(ui.timers.size, 1);
    ui.tick();
    assert.equal(ui.active(), 2);
});

test("preferência de movimento reduzido não impede a passagem automática solicitada", () => {
    const ui = page({ reducedMotion: true });
    assert.equal(ui.timers.size, 1);
    ui.tick();
    assert.equal(ui.active(), 1);
    ui.motion.emit("change", { matches: true });
    assert.equal(ui.timers.size, 1);
    ui.motion.emit("change", { matches: false });
    assert.equal(ui.timers.size, 1);
    ui.tick();
    assert.equal(ui.active(), 2);
});

test("documentos sem carrossel ou controles incompletos preservam fallback sem iniciar temporizador", () => {
    for (const options of [{ noCarousel: true }, { incomplete: true }]) {
        const ui = page(options);
        assert.equal(ui.timers.size, 0);
        assert.equal(ui.controls.hidden, true);
        assert.equal(ui.active(), 0);
    }
});
