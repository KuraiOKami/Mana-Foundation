(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const startCarousel = (carousel) => {
    const slides = Array.from(carousel.querySelectorAll('img'));
    if (slides.length === 0) return;

    slides.forEach((slide, index) => {
      slide.classList.toggle('active', index === 0);
    });

    if (slides.length === 1) return;

    const dotsWrapper = document.createElement('div');
    dotsWrapper.className = 'carousel-dots';
    const dots = slides.map((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', `Show slide ${index + 1}`);
      dot.addEventListener('click', () => goToSlide(index));
      dotsWrapper.appendChild(dot);
      return dot;
    });
    dots[0].classList.add('active');
    carousel.appendChild(dotsWrapper);

    const interval = Number(carousel.dataset.interval) || 6000;
    let timerId = setInterval(nextSlide, interval);

    carousel.addEventListener('mouseenter', () => {
      clearInterval(timerId);
    });

    carousel.addEventListener('mouseleave', () => {
      clearInterval(timerId);
      timerId = setInterval(nextSlide, interval);
    });

    function nextSlide() {
      goToSlide((current + 1) % slides.length, true);
    }

    let current = 0;

    function goToSlide(index, autoAdvance = false) {
      if (index === current) return;
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = index;
      slides[current].classList.add('active');
      dots[current].classList.add('active');

      if (!autoAdvance) {
        clearInterval(timerId);
        timerId = setInterval(nextSlide, interval);
      }
    }
  };

  document.querySelectorAll('.hero-carousel').forEach(startCarousel);
})();
