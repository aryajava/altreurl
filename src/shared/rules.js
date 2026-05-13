const RULE_ID_BASE = 1000;

export function normalizeHeaderRows(headers = []) {
  return headers
    .map((header) => ({
      name: String(header.name || "").trim(),
      value: String(header.value || "").trim()
    }))
    .filter((header) => header.name && header.value);
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

      const condition = {
        urlFilter: rule.sourcePattern,
        resourceTypes: [
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
        ]
      };

      const redirectRule = {
        id: RULE_ID_BASE + index * 2,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            url: rule.targetUrl
          }
        },
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
    sourcePattern: "",
    targetUrl: "",
    authorization: "",
    headers: []
  };
}
