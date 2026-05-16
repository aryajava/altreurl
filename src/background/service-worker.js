import { getRedirectRules, STORAGE_KEYS } from "../shared/storage.js";
import { initI18n, t } from "../shared/i18n.js";
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
let appliedRuleWriteSignature = "";
const i18nReady = initI18n();

chrome.webRequest.onBeforeSendHeaders.addListener(captureSourceRequest, CAPTURE_FILTER, CAPTURE_OPTIONS);

chrome.runtime.onInstalled.addListener(async () => {
  await i18nReady;
  const rules = await getRedirectRules();
  await prepareAndApplyRules(rules, { persistHydratedRules: true });
});

chrome.runtime.onStartup.addListener(async () => {
  await i18nReady;
  const rules = await getRedirectRules();
  await prepareAndApplyRules(rules, { persistHydratedRules: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SAVE_RULES") {
    return false;
  }

  saveAndApplyRules(message.rules || [])
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEYS.rules]) {
    return;
  }

  const nextRules = changes[STORAGE_KEYS.rules].newValue || [];

  if (shouldSkipAppliedRuleWrite(nextRules)) {
    return;
  }

  awaitI18nAndApplyRules(nextRules)
    .catch(async (error) => {
      await i18nReady;
      console.warn(t("runtime.error.storedRules"), error);
      await chrome.storage.local.set({
        [STORAGE_KEYS.applyError]: {
          message: error.message || t("runtime.error.storedRules"),
          occurredAt: new Date().toISOString()
        }
      });
    });
});

async function awaitI18nAndApplyRules(rules) {
  await i18nReady;
  await prepareAndApplyRules(rules);
}

async function captureSourceRequest(details) {
  await i18nReady;
  const rules = await getRedirectRules();
  const matchingRules = rules.filter((rule) => {
    if (!rule.enabled ||
      !hasSyncEnabled(rule) ||
      normalizeCredentialSource(rule) !== CREDENTIAL_SOURCES.request ||
      !rule.sourcePattern ||
      !rule.targetUrl) {
      return false;
    }

    try {
      return buildSourceMatcher(rule.sourcePattern, rule.patternType)(details.url);
    } catch (_error) {
      return false;
    }
  });

  if (matchingRules.length === 0) {
    return;
  }

  const capturedRules = await Promise.all(
    matchingRules.map((rule) => buildCapturedRule(rule, details))
  );
  const readyCapturedRulesById = new Map(capturedRules
    .filter((rule) => !isWaitingForSyncCapture(rule))
    .map((rule) => [rule.id, rule]));

  if (readyCapturedRulesById.size === 0) {
    return;
  }

  const nextRules = rules.map((rule) => readyCapturedRulesById.get(rule.id) || rule);

  await prepareAndApplyRules(nextRules);

  try {
    rememberAppliedRuleWrite(nextRules);
    await chrome.storage.local.set({ [STORAGE_KEYS.rules]: nextRules });
  } catch (error) {
    await applyDynamicRules(rules);
    throw error;
  }
}

async function prepareAndApplyRules(rules, options = {}) {
  await i18nReady;
  const hydratedRules = await hydrateCredentialSourceRules(rules);

  await applyDynamicRules(hydratedRules);
  await clearApplyError();

  if (options.persistHydratedRules && JSON.stringify(hydratedRules) !== JSON.stringify(rules)) {
    rememberAppliedRuleWrite(hydratedRules);
    await chrome.storage.local.set({ [STORAGE_KEYS.rules]: hydratedRules });
  }

  return hydratedRules;
}

async function saveAndApplyRules(rules) {
  await i18nReady;
  const savedRules = Array.isArray(rules) ? rules : [];

  rememberAppliedRuleWrite(savedRules);
  await chrome.storage.local.set({ [STORAGE_KEYS.rules]: savedRules });

  try {
    const hydratedRules = await prepareAndApplyRules(savedRules, { persistHydratedRules: true });

    return { rules: hydratedRules };
  } catch (error) {
    const applyError = {
      message: error.message || t("runtime.error.apply"),
      occurredAt: new Date().toISOString()
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.applyError]: applyError });

    return { rules: savedRules, applyError };
  }
}

function rememberAppliedRuleWrite(rules) {
  appliedRuleWriteSignature = JSON.stringify(rules || []);
}

function shouldSkipAppliedRuleWrite(rules) {
  const signature = JSON.stringify(rules || []);

  if (!appliedRuleWriteSignature || signature !== appliedRuleWriteSignature) {
    return false;
  }

  appliedRuleWriteSignature = "";
  return true;
}

async function clearApplyError() {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.applyError);
  } catch (error) {
    console.warn(t("runtime.error.clearApply"), error);
  }
}

async function hydrateCredentialSourceRules(rules) {
  const hydratedRules = [];

  for (const rule of rules) {
    hydratedRules.push(await hydrateCredentialSourceRule(rule));
  }

  return hydratedRules;
}

async function hydrateCredentialSourceRule(rule) {
  const capableRule = normalizeCredentialSourceCapabilities(rule);

  if (!capableRule.enabled || !hasSyncEnabled(capableRule) || !capableRule.sourcePattern || !capableRule.targetUrl) {
    return capableRule;
  }

  const credentialSource = normalizeCredentialSource(capableRule);

  if (credentialSource === CREDENTIAL_SOURCES.request) {
    return capableRule;
  }

  if (credentialSource === CREDENTIAL_SOURCES.storage) {
    return hydrateFromBrowserStorage(capableRule);
  }

  if (credentialSource === CREDENTIAL_SOURCES.cookie) {
    return hydrateFromCookies(capableRule);
  }

  return capableRule;
}

function normalizeCredentialSourceCapabilities(rule) {
  if (normalizeCredentialSource(rule) !== CREDENTIAL_SOURCES.cookie || !rule.syncHeaders) {
    return rule;
  }

  return {
    ...rule,
    syncHeaders: false,
    syncedHeaders: []
  };
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
