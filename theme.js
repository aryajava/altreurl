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
  const track = document.querySelector("[data-carousel]");

  if (!track || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  [...track.children].forEach((item) => {
    const clone = item.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.append(clone);
  });
  track.classList.add("is-animated");
}

initTheme();
initCarousel();
