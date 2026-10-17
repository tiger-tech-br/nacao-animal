/* ==================================================
   HERO CAROUSEL
================================================== */

document.addEventListener("DOMContentLoaded", () => {

    const track = document.querySelector(".carousel-track");
    const slides = document.querySelectorAll(".carousel-item");
    const nextButton = document.querySelector(".carousel-control.next");
    const prevButton = document.querySelector(".carousel-control.prev");
    const indicators = document.querySelectorAll(".carousel-indicator");

    if (
        !track ||
        !slides.length ||
        !nextButton ||
        !prevButton
    ) {
        return;
    }

    let currentSlide = 0;

    let autoplay;

    /* ==========================================
       ATUALIZAR
    ========================================== */

    function updateCarousel() {

        track.style.transform =
            `translateX(-${currentSlide * 100}%)`;

        indicators.forEach((indicator, index) => {

            indicator.classList.toggle(
                "active",
                index === currentSlide
            );

        });

    }

    /* ==========================================
       PRÓXIMO
    ========================================== */

    function nextSlide() {

        currentSlide++;

        if (currentSlide >= slides.length) {

            currentSlide = 0;

        }

        updateCarousel();

    }

    /* ==========================================
       ANTERIOR
    ========================================== */

    function previousSlide() {

        currentSlide--;

        if (currentSlide < 0) {

            currentSlide = slides.length - 1;

        }

        updateCarousel();

    }

    /* ==========================================
       AUTOPLAY
    ========================================== */

    function startAutoplay() {

        autoplay = setInterval(nextSlide, 5000);

    }

    function stopAutoplay() {

        clearInterval(autoplay);

    }

    function restartAutoplay() {

        stopAutoplay();

        startAutoplay();

    }

    /* ==========================================
       BOTÕES
    ========================================== */

    nextButton.addEventListener("click", () => {

        nextSlide();

        restartAutoplay();

    });

    prevButton.addEventListener("click", () => {

        previousSlide();

        restartAutoplay();

    });

    /* ==========================================
       INDICADORES
    ========================================== */

    indicators.forEach((indicator, index) => {

        indicator.addEventListener("click", () => {

            currentSlide = index;

            updateCarousel();

            restartAutoplay();

        });

    });

    /* ==========================================
       PAUSAR NO HOVER
    ========================================== */

    const hero = document.querySelector(".hero");

    hero.addEventListener("mouseenter", stopAutoplay);

    hero.addEventListener("mouseleave", startAutoplay);

    /* ==========================================
       INICIAR
    ========================================== */

    updateCarousel();

    startAutoplay();

});