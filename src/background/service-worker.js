import { getRedirectRules } from "../shared/storage.js";
import {
  applyDynamicRules,
  buildSourceMatcher,
  CREDENTIAL_SOURCES,
  hasSyncEnabled,
  isSyncableHeaderName,
  isWaitingForSyncCapture,
  normalizeCredentialSource,
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

  prepareAndApplyRules(message.rules || [])
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

async function prepareAndApplyRules(rules) {
  const hydratedRules = await hydrateCredentialSourceRules(rules);

  if (JSON.stringify(hydratedRules) !== JSON.stringify(rules)) {
    await chrome.storage.local.set({ redirectRules: hydratedRules });
  }

  await applyDynamicRules(hydratedRules);
}

async function hydrateCredentialSourceRules(rules) {
  const hydratedRules = [];

  for (const rule of rules) {
    hydratedRules.push(await hydrateCredentialSourceRule(rule));
  }

  return hydratedRules;
}

async function hydrateCredentialSourceRule(rule) {
  if (!rule.enabled || !hasSyncEnabled(rule) || !rule.sourcePattern || !rule.targetUrl) {
    return rule;
  }

  const credentialSource = normalizeCredentialSource(rule);

  if (credentialSource === CREDENTIAL_SOURCES.request) {
    return rule;
  }

  if (credentialSource === CREDENTIAL_SOURCES.storage) {
    return hydrateFromBrowserStorage(rule);
  }

  if (credentialSource === CREDENTIAL_SOURCES.cookie) {
    return hydrateFromCookies(rule);
  }

  return rule;
}

async function hydrateFromBrowserStorage(rule) {
  try {
    const sourceUrl = getRepresentativeSourceUrl(rule.sourcePattern);

    if (!sourceUrl) {
      return rule;
    }

    const sourceOrigin = new URL(sourceUrl).origin;
    const sourceTabs = await chrome.tabs.query({ url: `${sourceOrigin}/*` });
    const sourceTab = sourceTabs.find((tab) => tab.id);

    if (!sourceTab) {
      return rule;
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: sourceTab.id },
      args: [{
        area: rule.storageArea || "localStorage",
        authorizationKey: rule.authorizationKey || "",
        headersKey: rule.headersKey || ""
      }],
      func: ({ area, authorizationKey, headersKey }) => {
        const storage = area === "sessionStorage" ? window.sessionStorage : window.localStorage;

        return {
          authorization: authorizationKey ? storage.getItem(authorizationKey) || "" : "",
          headers: headersKey ? storage.getItem(headersKey) || "" : ""
        };
      }
    });
    const storageValues = result?.result || {};
    const nextRule = {
      ...rule,
      syncedAuthorization: rule.syncAuthorization && storageValues.authorization
        ? formatAuthorizationValue(storageValues.authorization, rule.authorizationPrefix)
        : rule.syncedAuthorization || "",
      syncedHeaders: rule.syncHeaders && storageValues.headers
        ? parseHeaderValue(storageValues.headers)
        : rule.syncedHeaders || [],
      syncedCookieHeader: rule.syncCookies ? await buildCookieHeaderFromRule(rule, sourceUrl) : rule.syncedCookieHeader || ""
    };

    return markRuleSyncedIfReady(nextRule);
  } catch (_error) {
    return rule;
  }
}

async function hydrateFromCookies(rule) {
  const sourceUrl = getRepresentativeSourceUrl(rule.sourcePattern);

  if (!sourceUrl) {
    return rule;
  }

  const cookies = await chrome.cookies.getAll({ url: sourceUrl });
  const cookieNames = parseCsv(rule.cookieNames);
  const selectedCookies = cookieNames.length > 0
    ? cookies.filter((cookie) => cookieNames.includes(cookie.name))
    : cookies;
  const authorizationCookie = rule.authorizationKey
    ? cookies.find((cookie) => cookie.name === rule.authorizationKey)
    : null;
  const nextRule = {
    ...rule,
    syncedAuthorization: rule.syncAuthorization && authorizationCookie?.value
      ? formatAuthorizationValue(authorizationCookie.value, rule.authorizationPrefix)
      : rule.syncedAuthorization || "",
    syncedCookieHeader: rule.syncCookies
      ? selectedCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
      : rule.syncedCookieHeader || ""
  };

  return markRuleSyncedIfReady(nextRule);
}

function markRuleSyncedIfReady(nextRule) {
  return isWaitingForSyncCapture(nextRule)
    ? nextRule
    : { ...nextRule, lastSyncedAt: new Date().toISOString() };
}

function parseHeaderValue(rawHeaders) {
  try {
    const parsedHeaders = JSON.parse(rawHeaders);

    if (Array.isArray(parsedHeaders)) {
      return normalizeHeaderRows(parsedHeaders);
    }

    if (parsedHeaders && typeof parsedHeaders === "object") {
      return normalizeHeaderRows(
        Object.entries(parsedHeaders).map(([name, value]) => ({ name, value: String(value) }))
      );
    }
  } catch (_error) {
    return [];
  }

  return [];
}

function formatAuthorizationValue(value, prefix = "") {
  const trimmedValue = String(value || "").trim();
  const trimmedPrefix = String(prefix || "").trim();

  if (!trimmedValue || !trimmedPrefix || trimmedValue.toLowerCase().startsWith(`${trimmedPrefix.toLowerCase()} `)) {
    return trimmedValue;
  }

  return `${trimmedPrefix} ${trimmedValue}`;
}

function parseCsv(value = "") {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function buildCookieHeaderFromRule(rule, sourceUrl) {
  const cookieNames = parseCsv(rule.cookieNames);
  const cookies = await chrome.cookies.getAll({ url: sourceUrl });
  const selectedCookies = cookieNames.length > 0
    ? cookies.filter((cookie) => cookieNames.includes(cookie.name))
    : cookies;

  return selectedCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function getRepresentativeSourceUrl(sourcePattern) {
  const normalizedPattern = String(sourcePattern || "")
    .replace(/^\^/, "")
    .replace(/\$$/, "")
    .replace(/\\\./g, ".")
    .replace(/\(\.\*\??\)/g, "")
    .replace(/\(\[\^[^\]]+\]\*\??\)/g, "")
    .replace(/\*/g, "");
  const urlMatch = normalizedPattern.match(/https?:\/\/[^/\\\s]+(?:\/[^\\\s]*)?/);

  if (!urlMatch) {
    return "";
  }

  try {
    return new URL(urlMatch[0]).href;
  } catch (_error) {
    return "";
  }
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
