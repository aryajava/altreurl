const RULE_ID_BASE = 1000;
const WILDCARD = "*";
export const PATTERN_TYPES = {
  wildcard: "wildcard",
  regex: "regex"
};
export const CREDENTIAL_MODES = {
  manual: "manual",
  sync: "sync"
};
export const CREDENTIAL_SOURCES = {
  request: "request",
  storage: "storage",
  cookie: "cookie"
};
export const STORAGE_AREAS = {
  localStorage: "localStorage",
  sessionStorage: "sessionStorage"
};
const UNSYNCED_HEADER_NAMES = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "origin",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "upgrade-insecure-requests"
]);

export function normalizeHeaderRows(headers = []) {
  return headers
    .map((header) => ({
      name: String(header.name || "").trim(),
      value: String(header.value || "").trim()
    }))
    .filter((header) => header.name && header.value);
}

export function normalizePatternType(patternType) {
  return Object.values(PATTERN_TYPES).includes(patternType) ? patternType : PATTERN_TYPES.wildcard;
}

export function normalizeCredentialMode(rule) {
  if (Object.values(CREDENTIAL_MODES).includes(rule?.credentialMode)) {
    return rule.credentialMode;
  }

  return Boolean(rule?.syncHeaders || rule?.syncAuthorization || rule?.syncCookies)
    ? CREDENTIAL_MODES.sync
    : CREDENTIAL_MODES.manual;
}

export function normalizeCredentialSource(rule) {
  if (Object.values(CREDENTIAL_SOURCES).includes(rule?.credentialSource)) {
    return rule.credentialSource;
  }

  return CREDENTIAL_SOURCES.request;
}

export function normalizeStorageArea(storageArea) {
  return Object.values(STORAGE_AREAS).includes(storageArea) ? storageArea : STORAGE_AREAS.localStorage;
}

export function isSyncableHeaderName(headerName) {
  const normalizedName = String(headerName || "").trim().toLowerCase();
  return normalizedName && !UNSYNCED_HEADER_NAMES.has(normalizedName) && normalizedName !== "authorization";
}

export function normalizeSyncedHeaders(headers = []) {
  return normalizeHeaderRows(headers).filter((header) => isSyncableHeaderName(header.name));
}

export function hasSyncEnabled(rule) {
  return normalizeCredentialMode(rule) === CREDENTIAL_MODES.sync &&
    Boolean(rule.syncHeaders || rule.syncAuthorization || rule.syncCookies);
}

export function isWaitingForSyncCapture(rule) {
  if (!hasSyncEnabled(rule)) {
    return false;
  }

  return Boolean(
    (rule.syncHeaders && normalizeSyncedHeaders(rule.syncedHeaders).length === 0) ||
    (rule.syncAuthorization && !rule.syncedAuthorization) ||
    (rule.syncCookies && !rule.syncedCookieHeader)
  );
}

export function buildSourceMatcher(sourcePattern, patternType = PATTERN_TYPES.wildcard) {
  const normalizedPatternType = normalizePatternType(patternType);
  const regexSource = normalizedPatternType === PATTERN_TYPES.regex
    ? sourcePattern
    : buildRegexFilterFromWildcard(sourcePattern);
  const regex = new RegExp(regexSource);

  return (url) => regex.test(url);
}

function escapeRegex(value) {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

function countWildcards(value) {
  return [...String(value || "")].filter((character) => character === WILDCARD).length;
}

function buildRegexFilterFromWildcard(sourcePattern) {
  if (sourcePattern.startsWith("^") && sourcePattern.endsWith("$")) {
    return sourcePattern;
  }

  return `^${sourcePattern.split(WILDCARD).map(escapeRegex).join("(.*)")}$`;
}

function buildRegexSubstitutionFromWildcard(targetUrl) {
  if (/\\[1-9]\d*|\$[1-9]\d*/.test(targetUrl)) {
    return targetUrl;
  }

  let groupIndex = 0;

  return targetUrl
    .split(WILDCARD)
    .map((part, index) => {
      if (index === 0) {
        return part;
      }

      groupIndex += 1;
      return `\\${groupIndex}${part}`;
    })
    .join("");
}

function stripRegexAnchors(regexPattern) {
  return regexPattern.replace(/^\^/, "").replace(/\$$/, "");
}

function unescapeRegexLiterals(regexPattern) {
  return regexPattern.replace(/\\([\\^$*+?.()|[\]{}])/g, "$1");
}

function buildWildcardFromRegexFilter(regexPattern) {
  return unescapeRegexLiterals(
    stripRegexAnchors(regexPattern)
      .replace(/\(\.\*\??\)/g, WILDCARD)
      .replace(/\(\[\^[^\]]+\]\*\??\)/g, WILDCARD)
  );
}

function buildWildcardFromRegexSubstitution(targetUrl) {
  return targetUrl.replace(/\\[1-9]\d*/g, WILDCARD).replace(/\$[1-9]\d*/g, WILDCARD);
}

function buildRegexFilterFromRegexSubstitution(targetUrl) {
  return `^${targetUrl
    .replace(/\\[1-9]\d*/g, "(.*)")
    .replace(/\$[1-9]\d*/g, "(.*)")}$`;
}

export function convertPatternFormat(value, fromPatternType, toPatternType, fieldType) {
  const fromType = normalizePatternType(fromPatternType);
  const toType = normalizePatternType(toPatternType);

  if (!value || fromType === toType) {
    return value;
  }

  if (fromType === PATTERN_TYPES.wildcard && toType === PATTERN_TYPES.regex) {
    return fieldType === "target" ? buildRegexSubstitutionFromWildcard(value) : buildRegexFilterFromWildcard(value);
  }

  if (fromType === PATTERN_TYPES.regex && toType === PATTERN_TYPES.wildcard) {
    return fieldType === "target" ? buildWildcardFromRegexSubstitution(value) : buildWildcardFromRegexFilter(value);
  }

  return value;
}

export function buildRedirectCondition(sourcePattern, patternType = PATTERN_TYPES.wildcard) {
  if (normalizePatternType(patternType) === PATTERN_TYPES.regex) {
    return {
      regexFilter: sourcePattern,
      resourceTypes: getResourceTypes()
    };
  }

  if (!sourcePattern.includes(WILDCARD)) {
    return {
      urlFilter: sourcePattern,
      resourceTypes: getResourceTypes()
    };
  }

  return {
    regexFilter: buildRegexFilterFromWildcard(sourcePattern),
    resourceTypes: getResourceTypes()
  };
}

export function buildHeaderCondition(sourcePattern, targetUrl, patternType = PATTERN_TYPES.wildcard) {
  if (normalizePatternType(patternType) === PATTERN_TYPES.regex) {
    return {
      regexFilter: buildRegexFilterFromRegexSubstitution(targetUrl),
      resourceTypes: getResourceTypes()
    };
  }

  if (targetUrl.includes(WILDCARD)) {
    return {
      regexFilter: buildRegexFilterFromWildcard(targetUrl),
      resourceTypes: getResourceTypes()
    };
  }

  return {
    urlFilter: targetUrl,
    resourceTypes: getResourceTypes()
  };
}

export function buildRedirectAction(sourcePattern, targetUrl, patternType = PATTERN_TYPES.wildcard) {
  if (normalizePatternType(patternType) === PATTERN_TYPES.regex) {
    return {
      type: "redirect",
      redirect: {
        regexSubstitution: targetUrl
      }
    };
  }

  const sourceWildcardCount = countWildcards(sourcePattern);
  const targetWildcardCount = countWildcards(targetUrl);

  if (sourceWildcardCount > 0 && targetWildcardCount > 0) {
    if (sourceWildcardCount !== targetWildcardCount) {
      throw new Error("Source URL pattern and redirect target URL must use the same number of wildcards.");
    }

    return {
      type: "redirect",
      redirect: {
        regexSubstitution: buildRegexSubstitutionFromWildcard(targetUrl)
      }
    };
  }

  if (targetWildcardCount > 0) {
    throw new Error("Redirect target URL cannot use wildcards unless source URL pattern also uses wildcards.");
  }

  return {
    type: "redirect",
    redirect: {
      url: targetUrl
    }
  };
}

function getResourceTypes() {
  return [
    "main_frame",
    "sub_frame",
    "xmlhttprequest",
    "script",
    "stylesheet",
    "image",
    "font",
    "media",
    "websocket",
    "other"
  ];
}

function mergeRequestHeaders(...headerGroups) {
  const headersByName = new Map();

  headerGroups.flat().forEach((header) => {
    if (!header.name || !header.value) {
      return;
    }

    headersByName.set(header.name.toLowerCase(), {
      header: header.name,
      operation: "set",
      value: header.value
    });
  });

  return [...headersByName.values()];
}

export function buildDynamicRules(configRules = []) {
  return configRules
    .filter((rule) => rule.enabled && rule.sourcePattern && rule.targetUrl)
    .filter((rule) => !isWaitingForSyncCapture(rule))
    .flatMap((rule, index) => {
      const syncedHeaders = rule.syncHeaders ? normalizeSyncedHeaders(rule.syncedHeaders) : [];
      const syncedAuthorization = rule.syncAuthorization && rule.syncedAuthorization
        ? [{ name: "Authorization", value: rule.syncedAuthorization }]
        : [];
      const syncedCookieHeader = rule.syncCookies && rule.syncedCookieHeader
        ? [{ name: "Cookie", value: rule.syncedCookieHeader }]
        : [];
      const manualAuthorization = rule.authorization
        ? [{ name: "Authorization", value: rule.authorization }]
        : [];
      const requestHeaders = mergeRequestHeaders(
        syncedHeaders,
        syncedAuthorization,
        syncedCookieHeader,
        normalizeCredentialMode(rule) === CREDENTIAL_MODES.manual ? manualAuthorization : [],
        normalizeCredentialMode(rule) === CREDENTIAL_MODES.manual ? normalizeHeaderRows(rule.headers) : []
      );

      const patternType = normalizePatternType(rule.patternType);
      const redirectCondition = buildRedirectCondition(rule.sourcePattern, patternType);
      const headerCondition = buildHeaderCondition(rule.sourcePattern, rule.targetUrl, patternType);

      const redirectRule = {
        id: RULE_ID_BASE + index * 2,
        priority: 1,
        action: buildRedirectAction(rule.sourcePattern, rule.targetUrl, patternType),
        condition: redirectCondition
      };

      if (requestHeaders.length === 0) {
        return [redirectRule];
      }

      return [
        redirectRule,
        {
          id: RULE_ID_BASE + index * 2 + 1,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders
          },
          condition: headerCondition
        }
      ];
    });
}

export async function applyDynamicRules(configRules = []) {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules
    .filter((rule) => rule.id >= RULE_ID_BASE)
    .map((rule) => rule.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: buildDynamicRules(configRules)
  });
}

export function createBlankRule() {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    createdAt: now,
    modifiedAt: now,
    name: "Local backend",
    group: "",
    enabled: true,
    patternType: PATTERN_TYPES.wildcard,
    credentialMode: CREDENTIAL_MODES.manual,
    syncHeaders: false,
    syncAuthorization: false,
    syncCookies: false,
    credentialSource: CREDENTIAL_SOURCES.request,
    storageArea: STORAGE_AREAS.localStorage,
    authorizationKey: "",
    authorizationPrefix: "",
    headersKey: "",
    cookieNames: "",
    sourcePattern: "",
    targetUrl: "",
    authorization: "",
    headers: [],
    syncedHeaders: [],
    syncedAuthorization: "",
    syncedCookieHeader: "",
    lastSyncedAt: ""
  };
}
