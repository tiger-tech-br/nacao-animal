"use strict";

/* ==================================================
   CARROSSEL DA HOME
================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const carousel = document.querySelector(".carousel");

    if (!carousel) {

        return;

    }

    const track = carousel.querySelector(".carousel-track");

    const slides = carousel.querySelectorAll(".carousel-item");

    const indicators = carousel.querySelectorAll(".carousel-indicator");

    const prevButton = carousel.querySelector(".carousel-control.prev");

    const nextButton = carousel.querySelector(".carousel-control.next");

    if (
        !track ||
        !slides.length ||
        !indicators.length ||
        !prevButton ||
        !nextButton
    ) {

        return;

    }

    let currentSlide = 0;

    let autoPlay = null;

    const AUTO_PLAY_TIME = 4000;

    /* ==================================================
       EXIBIR SLIDE
    ================================================== */

    function showSlide(index) {

        if (index < 0) {

            currentSlide = slides.length - 1;

        } else if (index >= slides.length) {

            currentSlide = 0;

        } else {

            currentSlide = index;

        }

        track.style.transform = `translateX(-${currentSlide * 100}%)`;

        indicators.forEach((indicator, indicatorIndex) => {

            indicator.classList.toggle(
                "active",
                indicatorIndex === currentSlide
            );

        });

    }

    /* ==================================================
       PRÓXIMO
    ================================================== */

    function nextSlide() {

        showSlide(currentSlide + 1);

    }

    /* ==================================================
       ANTERIOR
    ================================================== */

    function previousSlide() {

        showSlide(currentSlide - 1);

    }

    /* ==================================================
       AUTOPLAY
    ================================================== */

    function stopAutoPlay() {

        if (autoPlay) {

            clearInterval(autoPlay);

            autoPlay = null;

        }

    }

    function startAutoPlay() {

        stopAutoPlay();

        if (slides.length <= 1) {

            return;

        }

        autoPlay = setInterval(() => {

            nextSlide();

        }, AUTO_PLAY_TIME);

    }

    function restartAutoPlay() {

        stopAutoPlay();

        startAutoPlay();

    }

    /* ==================================================
       BOTÕES
    ================================================== */

    nextButton.addEventListener("click", () => {

        nextSlide();

        restartAutoPlay();

    });

    prevButton.addEventListener("click", () => {

        previousSlide();

        restartAutoPlay();

    });

    /* ==================================================
       INDICADORES
    ================================================== */

    indicators.forEach((indicator, index) => {

        indicator.addEventListener("click", () => {

            showSlide(index);

            restartAutoPlay();

        });

    });

    /* ==================================================
       PAUSAR AO PASSAR O MOUSE
    ================================================== */

    /* ==================================================
       PAUSAR QUANDO A ABA NÃO ESTIVER VISÍVEL
    ================================================== */

    document.addEventListener("visibilitychange", () => {

        if (document.hidden) {

            stopAutoPlay();

        } else {

            startAutoPlay();

        }

    });

    /* ==================================================
       INICIAR
    ================================================== */

    showSlide(0);

    startAutoPlay();

});
