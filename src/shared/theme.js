import { getThemePreference, saveThemePreference, STORAGE_KEYS } from "./storage.js";

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function resolveTheme(themePreference) {
  if (themePreference === "light" || themePreference === "dark") {
    return themePreference;
  }

  return mediaQuery.matches ? "dark" : "light";
}

function applyTheme(themePreference) {
  const normalizedTheme = ["system", "light", "dark"].includes(themePreference) ? themePreference : "system";
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.dataset.colorScheme = resolveTheme(normalizedTheme);
}

export async function initThemeControl(themeControl) {
  const themePreference = await getThemePreference();

  applyTheme(themePreference);

  if (themeControl) {
    themeControl.value = themePreference;
    themeControl.addEventListener("change", async () => {
      applyTheme(themeControl.value);
      await saveThemePreference(themeControl.value);
    });
  }

  mediaQuery.addEventListener("change", async () => {
    const nextThemePreference = await getThemePreference();

    if (nextThemePreference === "system") {
      applyTheme(nextThemePreference);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEYS.theme]) {
      return;
    }

    const nextThemePreference = changes[STORAGE_KEYS.theme].newValue || "system";
    applyTheme(nextThemePreference);

    if (themeControl) {
      themeControl.value = nextThemePreference;
    }
  });
}
