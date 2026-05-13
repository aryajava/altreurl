export const STORAGE_KEYS = {
  rules: "redirectRules"
};

export async function getRedirectRules() {
  const result = await chrome.storage.local.get({ [STORAGE_KEYS.rules]: [] });
  return Array.isArray(result[STORAGE_KEYS.rules]) ? result[STORAGE_KEYS.rules] : [];
}

export async function saveRedirectRules(rules) {
  await chrome.storage.local.set({ [STORAGE_KEYS.rules]: rules });
}

