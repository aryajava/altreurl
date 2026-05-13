import { getRedirectRules } from "../shared/storage.js";
import {
  applyDynamicRules,
  buildSourceMatcher,
  hasSyncEnabled,
  isSyncableHeaderName,
  isWaitingForSyncCapture,
  normalizeHeaderRows
} from "../shared/rules.js";

const CAPTURE_FILTER = { urls: ["<all_urls>"] };
const CAPTURE_OPTIONS = ["requestHeaders", "extraHeaders"];

chrome.webRequest.onBeforeSendHeaders.addListener(captureSourceRequest, CAPTURE_FILTER, CAPTURE_OPTIONS);

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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.redirectRules) {
    return;
  }

  applyDynamicRules(changes.redirectRules.newValue || []);
});

async function captureSourceRequest(details) {
  const rules = await getRedirectRules();
  const matchingRule = rules.find((rule) => {
    if (!rule.enabled || !hasSyncEnabled(rule) || !rule.sourcePattern || !rule.targetUrl) {
      return false;
    }

    try {
      return buildSourceMatcher(rule.sourcePattern, rule.patternType)(details.url);
    } catch (_error) {
      return false;
    }
  });

  if (!matchingRule) {
    return;
  }

  const capturedRule = await buildCapturedRule(matchingRule, details);
  if (isWaitingForSyncCapture(capturedRule)) {
    return;
  }

  const nextRules = rules.map((rule) => (rule.id === capturedRule.id ? capturedRule : rule));

  await chrome.storage.local.set({ redirectRules: nextRules });
  await applyDynamicRules(nextRules);
}

async function buildCapturedRule(rule, details) {
  const requestHeaders = details.requestHeaders || [];
  const capturedHeaders = requestHeaders
    .filter((header) => rule.syncHeaders && isSyncableHeaderName(header.name))
    .map((header) => ({ name: header.name, value: header.value || "" }));
  const authorizationHeader = requestHeaders.find((header) => header.name.toLowerCase() === "authorization");
  const cookieHeader = requestHeaders.find((header) => header.name.toLowerCase() === "cookie");

  const nextRule = {
    ...rule,
    syncedHeaders: rule.syncHeaders ? normalizeHeaderRows(capturedHeaders) : rule.syncedHeaders || [],
    syncedAuthorization: rule.syncAuthorization ? authorizationHeader?.value || rule.syncedAuthorization || "" : rule.syncedAuthorization || "",
    syncedCookieHeader: rule.syncCookies ? cookieHeader?.value || rule.syncedCookieHeader || "" : rule.syncedCookieHeader || "",
    lastSyncedAt: new Date().toISOString()
  };

  if (rule.syncCookies && !nextRule.syncedCookieHeader) {
    nextRule.syncedCookieHeader = await buildCookieHeader(details.url);
  }

  return nextRule;
}

async function buildCookieHeader(url) {
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
