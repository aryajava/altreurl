const THEME_KEY = "altreurlWebTheme";

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);

  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.colorScheme = theme;
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const nextTheme = theme === "dark" ? "Light" : "Dark";
    button.textContent = nextTheme;
    button.setAttribute("aria-label", `Switch to ${nextTheme.toLowerCase()} mode`);
  });
}

function initTheme() {
  applyTheme(getPreferredTheme());

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentTheme = document.documentElement.dataset.colorScheme || getPreferredTheme();
      const nextTheme = currentTheme === "dark" ? "light" : "dark";

      localStorage.setItem(THEME_KEY, nextTheme);
      applyTheme(nextTheme);
    });
  });
}

function initCarousel() {
  const carousel = document.querySelector("[data-carousel]");

  if (!carousel) {
    return;
  }

  const track = carousel.querySelector("[data-carousel-track]");
  const previousButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const dots = carousel.querySelector("[data-carousel-dots]");
  const cards = [...track.querySelectorAll(".screenshot-card")];

  if (!track || cards.length === 0) {
    return;
  }

  let activeIndex = 0;
  let autoAdvanceTimer = null;

  function getCardStep() {
    const [firstCard, secondCard] = cards;

    if (firstCard && secondCard) {
      return secondCard.offsetLeft - firstCard.offsetLeft;
    }

    return firstCard?.offsetWidth || track.clientWidth;
  }

  function setActiveDot(index) {
    [...dots.children].forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
      dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
    });
  }

  function goTo(index, behavior = "smooth") {
    activeIndex = (index + cards.length) % cards.length;
    track.scrollTo({
      left: cards[activeIndex].offsetLeft,
      behavior
    });
    setActiveDot(activeIndex);
  }

  function goNext() {
    goTo(activeIndex === cards.length - 1 ? 0 : activeIndex + 1);
  }

  function goPrevious() {
    goTo(activeIndex === 0 ? cards.length - 1 : activeIndex - 1);
  }

  cards.forEach((_card, index) => {
    const dot = document.createElement("button");

    dot.className = "carousel-dot";
    dot.type = "button";
    dot.setAttribute("aria-label", `Show screenshot ${index + 1}`);
    dot.addEventListener("click", () => {
      goTo(index);
      restartAutoAdvance();
    });
    dots.append(dot);
  });

  previousButton?.addEventListener("click", () => {
    goPrevious();
    restartAutoAdvance();
  });
  nextButton?.addEventListener("click", () => {
    goNext();
    restartAutoAdvance();
  });

  track.addEventListener("scroll", () => {
    const step = getCardStep();
    const nextIndex = Math.round(track.scrollLeft / step);

    if (nextIndex !== activeIndex && nextIndex >= 0 && nextIndex < cards.length) {
      activeIndex = nextIndex;
      setActiveDot(activeIndex);
    }
  }, { passive: true });

  function startAutoAdvance() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    autoAdvanceTimer = window.setInterval(goNext, 3600);
  }

  function restartAutoAdvance() {
    window.clearInterval(autoAdvanceTimer);
    startAutoAdvance();
  }

  carousel.addEventListener("mouseenter", () => window.clearInterval(autoAdvanceTimer));
  carousel.addEventListener("mouseleave", restartAutoAdvance);
  carousel.addEventListener("focusin", () => window.clearInterval(autoAdvanceTimer));
  carousel.addEventListener("focusout", restartAutoAdvance);

  setActiveDot(0);
  startAutoAdvance();
}

initTheme();
initCarousel();
