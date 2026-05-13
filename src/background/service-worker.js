import { getRedirectRules } from "../shared/storage.js";
import { applyDynamicRules } from "../shared/rules.js";

chrome.runtime.onInstalled.addListener(async () => {
  const rules = await getRedirectRules();
  await applyDynamicRules(rules);
});

chrome.runtime.onStartup.addListener(async () => {
  const rules = await getRedirectRules();
  await applyDynamicRules(rules);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "APPLY_RULES") {
    return false;
  }

  applyDynamicRules(message.rules || [])
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

