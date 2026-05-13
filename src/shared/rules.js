const RULE_ID_BASE = 1000;
const WILDCARD = "*";
export const PATTERN_TYPES = {
  wildcard: "wildcard",
  regex: "regex"
};

export function normalizeHeaderRows(headers = []) {
  return headers
    .map((header) => ({
      name: String(header.name || "").trim(),
      value: String(header.value || "").trim()
    }))
    .filter((header) => header.name && header.value);
}

function normalizePatternType(patternType) {
  return Object.values(PATTERN_TYPES).includes(patternType) ? patternType : PATTERN_TYPES.wildcard;
}

function escapeRegex(value) {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

function countWildcards(value) {
  return [...String(value || "")].filter((character) => character === WILDCARD).length;
}

function buildRegexFilterFromWildcard(sourcePattern) {
  return `^${sourcePattern.split(WILDCARD).map(escapeRegex).join("(.*)")}$`;
}

function buildRegexSubstitutionFromWildcard(targetUrl) {
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

export function buildDynamicRules(configRules = []) {
  return configRules
    .filter((rule) => rule.enabled && rule.sourcePattern && rule.targetUrl)
    .flatMap((rule, index) => {
      const requestHeaders = normalizeHeaderRows(rule.headers).map((header) => ({
        header: header.name,
        operation: "set",
        value: header.value
      }));

      if (rule.authorization) {
        requestHeaders.push({
          header: "Authorization",
          operation: "set",
          value: rule.authorization
        });
      }

      const patternType = normalizePatternType(rule.patternType);
      const condition = buildRedirectCondition(rule.sourcePattern, patternType);

      const redirectRule = {
        id: RULE_ID_BASE + index * 2,
        priority: 1,
        action: buildRedirectAction(rule.sourcePattern, rule.targetUrl, patternType),
        condition
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
          condition
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
  return {
    id: crypto.randomUUID(),
    name: "Local backend",
    enabled: true,
    patternType: PATTERN_TYPES.wildcard,
    sourcePattern: "",
    targetUrl: "",
    authorization: "",
    headers: []
  };
}
