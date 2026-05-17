const THEME_KEY = "altreurlWebTheme";
const REPO_URL = "https://github.com/yavanara/altreurl";
const CHROME_STORE_URL = "#";
const EDGE_STORE_URL = "#";

function getCurrentPage() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function getHomeHref(hash) {
  return getCurrentPage() === "index.html" ? hash : `index.html${hash}`;
}

function getThemedIconPath(iconName, theme = document.documentElement.dataset.colorScheme || getPreferredTheme()) {
  const folder = theme === "dark" ? "w" : "b";

  return `assets/icons/${folder}/${iconName}`;
}

function renderSiteChrome() {
  const currentPage = getCurrentPage();
  const header = document.querySelector("[data-site-header]");
  const footer = document.querySelector("[data-site-footer]");

  if (header) {
    header.innerHTML = `
      <header class="site-header">
        <a class="brand" href="index.html" aria-label="Altreurl home">
          <img src="assets/favicons/v2/Altreurl_V2_48.png" alt="" width="40" height="40">
          <span>Altreurl</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="${getHomeHref("#features")}"><span class="material-symbols-rounded" aria-hidden="true">apps</span>Features</a>
          <a href="${getHomeHref("#workflow")}"><span class="material-symbols-rounded" aria-hidden="true">route</span>Workflow</a>
          <a href="privacy.html" ${currentPage === "privacy.html" ? 'aria-current="page"' : ""}><span class="material-symbols-rounded" aria-hidden="true">shield_lock</span>Privacy</a>
          <a href="support.html" ${currentPage === "support.html" ? 'aria-current="page"' : ""}><span class="material-symbols-rounded" aria-hidden="true">help</span>Support</a>
        </nav>
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch color theme">
          <span class="material-symbols-rounded" data-theme-icon aria-hidden="true">light_mode</span>
          <span data-theme-label>Light</span>
        </button>
      </header>
    `;
  }

  if (footer) {
    footer.innerHTML = `
      <footer class="app-footer">
        <p>Built for developers who would rather debug the backend than wrestle the network tab.</p>
        <nav class="app-footer__links" aria-label="Altreurl resources">
          <a class="footer-link" href="${REPO_URL}" rel="noopener">
            <img data-themed-icon="icons8-github-32.png" alt="" width="16" height="16">
            GitHub
          </a>
          <a class="footer-link" href="${CHROME_STORE_URL}">
            <img data-themed-icon="icons8-chrome-32.png" alt="" width="16" height="16">
            Chrome
          </a>
          <a class="footer-link" href="${EDGE_STORE_URL}">
            <img data-themed-icon="icons8-microsoft-edge-32.png" alt="" width="16" height="16">
            Edge
          </a>
          <a class="footer-link" href="privacy.html" ${currentPage === "privacy.html" ? 'aria-current="page"' : ""}>
            <span class="material-symbols-rounded" aria-hidden="true">shield_lock</span>
            Privacy
          </a>
          <a class="footer-link" href="support.html" ${currentPage === "support.html" ? 'aria-current="page"' : ""}>
            <span class="material-symbols-rounded" aria-hidden="true">help</span>
            Support
          </a>
        </nav>
      </footer>
    `;
  }
}

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
    const label = button.querySelector("[data-theme-label]");
    const icon = button.querySelector("[data-theme-icon]");

    if (label) {
      label.textContent = nextTheme;
    } else {
      button.textContent = nextTheme;
    }

    if (icon) {
      icon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
    }

    button.setAttribute("aria-label", `Switch to ${nextTheme.toLowerCase()} mode`);
  });

  document.querySelectorAll("[data-themed-icon]").forEach((icon) => {
    icon.src = getThemedIconPath(icon.dataset.themedIcon, theme);
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
  const progress = carousel.querySelector("[data-carousel-progress]");
  const progressFill = carousel.querySelector("[data-carousel-progress-fill]");

  if (!track) {
    return;
  }

  const cards = [...track.querySelectorAll(".screenshot-card")];

  if (cards.length === 0) {
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

  function setProgress(index) {
    const percent = ((index + 1) / cards.length) * 100;

    if (progress) {
      progress.setAttribute("aria-valuenow", String(index + 1));
      progress.setAttribute("aria-valuetext", `Screenshot ${index + 1} of ${cards.length}`);
    }

    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }
  }

  function goTo(index, behavior = "smooth") {
    activeIndex = (index + cards.length) % cards.length;
    track.scrollTo({
      left: cards[activeIndex].offsetLeft,
      behavior
    });
    setProgress(activeIndex);
  }

  function goNext() {
    goTo(activeIndex === cards.length - 1 ? 0 : activeIndex + 1);
  }

  function goPrevious() {
    goTo(activeIndex === 0 ? cards.length - 1 : activeIndex - 1);
  }

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
      setProgress(activeIndex);
    }
  }, { passive: true });

  progress?.addEventListener("click", (event) => {
    const rect = progress.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(cards.length - 1, Math.max(0, Math.floor(ratio * cards.length)));

    goTo(index);
    restartAutoAdvance();
  });

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

  setProgress(0);
  startAutoAdvance();
}

renderSiteChrome();
initTheme();
initCarousel();
