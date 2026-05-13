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

function updateToggleControl(themeControl, themePreference) {
  if (!themeControl) {
    return;
  }

  const resolvedTheme = resolveTheme(themePreference);
  themeControl.setAttribute("aria-pressed", String(resolvedTheme === "dark"));
  themeControl.textContent = resolvedTheme === "dark" ? "Dark" : "Light";
  themeControl.title = `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`;
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
