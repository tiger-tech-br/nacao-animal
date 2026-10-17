/* ==================================================
   HERO CAROUSEL
================================================== */

const track = document.querySelector(".carousel-track");

const slides = document.querySelectorAll(".carousel-item");

const nextButton = document.querySelector(".carousel-control.next");

const prevButton = document.querySelector(".carousel-control.prev");

const indicators = document.querySelectorAll(".carousel-indicator");

let currentSlide = 0;

let autoPlay;

/* ==================================================
   ATUALIZAR SLIDE
================================================== */

function updateCarousel() {

    track.style.transform = `translateX(-${currentSlide * 100}%)`;

    indicators.forEach((indicator, index) => {

        indicator.classList.toggle(
            "active",
            index === currentSlide
        );

    });

}

/* ==================================================
   PRÓXIMO
================================================== */

function nextSlide() {

    currentSlide++;

    if (currentSlide >= slides.length) {

        currentSlide = 0;

    }

    updateCarousel();

}

/* ==================================================
   ANTERIOR
================================================== */

function previousSlide() {

    currentSlide--;

    if (currentSlide < 0) {

        currentSlide = slides.length - 1;

    }

    updateCarousel();

}

/* ==================================================
   EVENTOS
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

        currentSlide = index;

        updateCarousel();

        restartAutoPlay();

    });

});

/* ==================================================
   AUTOPLAY
================================================== */

function startAutoPlay() {

    autoPlay = setInterval(() => {

        nextSlide();

    }, 5000);

}

function stopAutoPlay() {

    clearInterval(autoPlay);

}

function restartAutoPlay() {

    stopAutoPlay();

    startAutoPlay();

}

/* ==================================================
   PAUSAR AO PASSAR O MOUSE
================================================== */

const hero = document.querySelector(".hero");

hero.addEventListener("mouseenter", stopAutoPlay);

hero.addEventListener("mouseleave", startAutoPlay);

/* ==================================================
   INICIAR
================================================== */

updateCarousel();

startAutoPlay();