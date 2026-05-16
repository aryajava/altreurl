import { getThemePreference, saveThemePreference, STORAGE_KEYS } from "./storage.js";
import { t } from "./i18n.js";

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const ICON_FOLDERS = {
  dark: "w",
  light: "b"
};

function resolveTheme(themePreference) {
  if (themePreference === "light" || themePreference === "dark") {
    return themePreference;
  }

  return mediaQuery.matches ? "dark" : "light";
}

function applyTheme(themePreference) {
  const normalizedTheme = ["system", "light", "dark"].includes(themePreference) ? themePreference : "system";
  const resolvedTheme = resolveTheme(normalizedTheme);
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.dataset.colorScheme = resolvedTheme;
  applyThemedIcons(document, resolvedTheme);
}

function updateToggleControl(themeControl, themePreference) {
  if (!themeControl) {
    return;
  }

  const resolvedTheme = resolveTheme(themePreference);
  themeControl.dataset.activeTheme = resolvedTheme;
  themeControl.setAttribute("aria-pressed", String(resolvedTheme === "light"));
  themeControl.setAttribute("aria-label", t("theme.mode", { theme: resolvedTheme }));
  themeControl.title = t("theme.switchTo", { theme: resolvedTheme === "dark" ? "light" : "dark" });
}

export async function initThemeControl(themeControl, options = {}) {
  const controlType = options.controlType || "select";
  const themePreference = await getThemePreference();

  applyTheme(themePreference);

  if (themeControl) {
    if (controlType === "toggle") {
      updateToggleControl(themeControl, themePreference);
      themeControl.addEventListener("click", async () => {
        const nextThemePreference = document.documentElement.dataset.colorScheme === "dark" ? "light" : "dark";
        applyTheme(nextThemePreference);
        updateToggleControl(themeControl, nextThemePreference);
        await saveThemePreference(nextThemePreference);
      });
    } else {
      themeControl.value = themePreference;
      themeControl.addEventListener("change", async () => {
        applyTheme(themeControl.value);
        await saveThemePreference(themeControl.value);
      });
    }
  }

  mediaQuery.addEventListener("change", async () => {
    const nextThemePreference = await getThemePreference();

    if (nextThemePreference === "system") {
      applyTheme(nextThemePreference);
      updateToggleControl(themeControl, nextThemePreference);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEYS.theme]) {
      return;
    }

    const nextThemePreference = changes[STORAGE_KEYS.theme].newValue || "system";
    applyTheme(nextThemePreference);

    if (themeControl && controlType === "toggle") {
      updateToggleControl(themeControl, nextThemePreference);
    } else if (themeControl) {
      themeControl.value = nextThemePreference;
    }
  });
}

export function getThemedIconPath(iconName, theme = document.documentElement.dataset.colorScheme || "light") {
  const folder = ICON_FOLDERS[theme] || ICON_FOLDERS.light;

  return `../shared/imgs/icons/${folder}/${iconName}`;
}

export function applyThemedIcons(root = document, theme = document.documentElement.dataset.colorScheme || "light") {
  root.querySelectorAll("[data-icon]").forEach((icon) => {
    icon.src = getThemedIconPath(icon.dataset.icon, theme);
  });
}
