const THEME_KEY = "altreurlWebTheme";
const APP_VERSION = "v1.13.0";
const ORG_URL = "https://github.com/yavanara";
const REPO_URL = "https://github.com/yavanara/altreurl";
const DONATION_URL = "#";
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

function iconMarkup(iconName, size = 16) {
  return `<img data-themed-icon="${iconName}" alt="" width="${size}" height="${size}">`;
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
          <strong>Altreurl</strong>
          <span class="version-badge">${APP_VERSION}</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="${getHomeHref("#overview")}">${iconMarkup("icons8-globe-32.png")}Overview</a>
          <a href="${getHomeHref("#features")}">${iconMarkup("icons8-list-32.png")}Features</a>
          <a href="${getHomeHref("#preview")}">${iconMarkup("icons8-route-32.png")}Preview</a>
          <a href="${getHomeHref("#workflow")}">${iconMarkup("icons8-url-32.png")}Example</a>
          <a href="docs.html" ${currentPage === "docs.html" ? 'aria-current="page"' : ""}>${iconMarkup("icons8-log-32.png")}Docs</a>
          <a href="privacy.html" ${currentPage === "privacy.html" ? 'aria-current="page"' : ""}>${iconMarkup("icons8-diploma-32.png")}Privacy</a>
        </nav>
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch color theme">
          <img data-theme-icon data-themed-icon="icons8-moon-and-stars-32.png" alt="" width="16" height="16">
          <span data-theme-label>Light</span>
        </button>
      </header>
    `;
  }

  if (footer) {
    footer.innerHTML = `
      <footer class="app-footer">
        <div class="app-footer__brand">
          <a class="brand" href="index.html" aria-label="Altreurl home">
            <img src="assets/favicons/v2/Altreurl_V2_48.png" alt="" width="40" height="40">
            <strong>Altreurl</strong>
          </a>
          <p>Local backend debugging without fighting the network tab.</p>
          <p>Maintained by <a href="${ORG_URL}" rel="noopener">Yavanara</a>. Version ${APP_VERSION}. Licensed <a href="${REPO_URL}/blob/main/LICENSE" rel="noopener">MIT</a>.</p>
        </div>
        <div class="app-footer__groups">
          <nav class="footer-group" aria-label="Project links">
            <strong>Project</strong>
            <a href="${REPO_URL}" rel="noopener">GitHub</a>
            <a href="docs.html" ${currentPage === "docs.html" ? 'aria-current="page"' : ""}>Docs</a>
            <a href="support.html" ${currentPage === "support.html" ? 'aria-current="page"' : ""}>Support</a>
          </nav>
          <nav class="footer-group" aria-label="Store links">
            <strong>Stores</strong>
            <a href="${CHROME_STORE_URL}">Chrome</a>
            <a href="${EDGE_STORE_URL}">Edge</a>
            <a href="privacy.html" ${currentPage === "privacy.html" ? 'aria-current="page"' : ""}>Privacy</a>
          </nav>
          <nav class="footer-group" aria-label="Community links">
            <strong>Community</strong>
            <a href="${ORG_URL}" rel="noopener">Yavanara</a>
            <a href="${DONATION_URL}" aria-disabled="true" tabindex="-1">Support development</a>
          </nav>
        </div>
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
      icon.dataset.themedIcon = theme === "dark" ? "icons8-sun-32.png" : "icons8-moon-and-stars-32.png";
      icon.src = getThemedIconPath(icon.dataset.themedIcon, theme);
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

function initGallery() {
  const gallery = document.querySelector("[data-gallery]");

  if (!gallery) {
    return;
  }

  const image = gallery.querySelector("[data-gallery-image]");
  const title = gallery.querySelector("[data-gallery-title]");
  const count = gallery.querySelector("[data-gallery-count]");
  const status = gallery.querySelector("[data-gallery-status]");
  const previousButton = gallery.querySelector("[data-gallery-prev]");
  const nextButton = gallery.querySelector("[data-gallery-next]");
  const thumbs = [...gallery.querySelectorAll("[data-gallery-thumb]")];

  if (!image || thumbs.length === 0) {
    return;
  }

  const items = thumbs.map((thumb) => ({
    alt: thumb.dataset.galleryAlt || "",
    src: thumb.dataset.gallerySrc || "",
    title: thumb.dataset.galleryTitle || ""
  }));

  let activeIndex = 0;
  let autoAdvanceTimer = null;

  function setActive(index, options = {}) {
    const { behavior = "smooth", revealThumb = false } = options;

    activeIndex = (index + items.length) % items.length;
    const item = items[activeIndex];

    image.src = item.src;
    image.alt = item.alt;

    if (title) {
      title.textContent = item.title;
    }

    if (count) {
      count.textContent = `${activeIndex + 1} / ${items.length}`;
    }

    if (status) {
      status.textContent = item.title;
    }

    thumbs.forEach((thumb, thumbIndex) => {
      const isActive = thumbIndex === activeIndex;

      thumb.classList.toggle("is-active", isActive);
      thumb.setAttribute("aria-current", isActive ? "true" : "false");
    });

    if (revealThumb) {
      thumbs[activeIndex].scrollIntoView({
        behavior,
        block: "nearest",
        inline: "nearest"
      });
    }
  }

  function goNext() {
    setActive(activeIndex + 1);
  }

  function goPrevious() {
    setActive(activeIndex - 1);
  }

  previousButton?.addEventListener("click", () => {
    goPrevious();
    restartAutoAdvance();
  });
  nextButton?.addEventListener("click", () => {
    goNext();
    restartAutoAdvance();
  });

  thumbs.forEach((thumb, index) => {
    thumb.addEventListener("click", () => {
      setActive(index, { revealThumb: true });
      restartAutoAdvance();
    });
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

  gallery.addEventListener("mouseenter", () => window.clearInterval(autoAdvanceTimer));
  gallery.addEventListener("mouseleave", restartAutoAdvance);
  gallery.addEventListener("focusin", () => window.clearInterval(autoAdvanceTimer));
  gallery.addEventListener("focusout", restartAutoAdvance);

  setActive(0, { behavior: "auto" });
  startAutoAdvance();
}

function initDocsVersion() {
  const switcher = document.querySelector("[data-doc-version]");

  if (!switcher) {
    return;
  }

  const panels = [...document.querySelectorAll("[data-doc-panel]")];
  const labels = [...document.querySelectorAll("[data-doc-version-label]")];

  function showVersion(version) {
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.docPanel !== version;
    });

    labels.forEach((label) => {
      label.textContent = version;
    });
  }

  switcher.addEventListener("change", () => showVersion(switcher.value));
  showVersion(switcher.value);
}

renderSiteChrome();
initTheme();
initGallery();
initDocsVersion();
