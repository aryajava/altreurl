export const STORAGE_KEYS = {
  rules: "redirectRules",
  theme: "themePreference",
  applyError: "altreurlApplyError",
  updateCheck: "altreurlUpdateCheck"
};

export async function getRedirectRules() {
  const result = await chrome.storage.local.get({ [STORAGE_KEYS.rules]: [] });
  return Array.isArray(result[STORAGE_KEYS.rules]) ? result[STORAGE_KEYS.rules] : [];
}

export async function saveRedirectRules(rules) {
  await chrome.storage.local.set({ [STORAGE_KEYS.rules]: rules });
}

export async function getThemePreference() {
  const result = await chrome.storage.local.get({ [STORAGE_KEYS.theme]: "system" });
  return ["system", "light", "dark"].includes(result[STORAGE_KEYS.theme]) ? result[STORAGE_KEYS.theme] : "system";
}

export async function saveThemePreference(themePreference) {
  const nextThemePreference = ["system", "light", "dark"].includes(themePreference) ? themePreference : "system";
  await chrome.storage.local.set({ [STORAGE_KEYS.theme]: nextThemePreference });
}
