import { buildDynamicRules, getRuleSetIssuesByRuleId, normalizePatternType, PATTERN_TYPES } from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules } from "../shared/storage.js";
import { initThemeControl } from "../shared/theme.js";
import { createNotifier } from "../shared/notifications.js";
import { checkForUpdates, renderUpdateStatus } from "../shared/update-checker.js";

const summary = document.querySelector("#summary");
const activeRules = document.querySelector("#activeRules");
const ruleSearch = document.querySelector("#ruleSearch");
const openOptions = document.querySelector("#openOptions");
const updateStatus = document.querySelector("#updateStatus");
const notifications = document.querySelector("#notifications");
const notify = createNotifier(notifications, { scope: "popup" });

let rules = await getRedirectRules();
let activeTabContext = await getActiveTabContext();

await initThemeControl();
checkForUpdates()
  .then((status) => renderUpdateStatus(updateStatus, status))
  .catch((error) => notify(error.message, "error"));

function renderPopup() {
  const attentionIds = getRuleAttentionIds(rules);
  const applicableRules = activeTabContext.isSupported
    ? rules.filter((rule) => isRuleApplicableToTab(rule, activeTabContext))
    : [];
  const activeRuleIds = getActiveRuleIds(applicableRules, attentionIds);
  const enabledRules = applicableRules.filter((rule) => activeRuleIds.has(rule.id));
  const blockedRuleCount = applicableRules.filter((rule) => rule.enabled && attentionIds.has(rule.id)).length;
  const waitingRuleCount = getWaitingRuleCount(applicableRules, attentionIds);
  const query = ruleSearch.value.trim().toLowerCase();
  const visibleRules = applicableRules.filter((rule) => !query || [
    rule.name,
    rule.sourcePattern,
    rule.targetUrl
  ].some((value) => String(value || "").toLowerCase().includes(query)));

  const activeSummary = !activeTabContext.isSupported
    ? "Unsupported page"
    : applicableRules.length === 0
      ? `No rules for ${activeTabContext.hostLabel}`
      : `${enabledRules.length}/${applicableRules.length} enabled for ${activeTabContext.hostLabel}`;
  summary.textContent = blockedRuleCount > 0
    ? `${activeSummary} · ${blockedRuleCount} need attention`
    : activeSummary;

  if (visibleRules.length === 0) {
    activeRules.replaceChildren(renderEmptyState({
      totalRuleCount: rules.length,
      contextualRuleCount: applicableRules.length,
      activeRuleCount: enabledRules.length,
      enabledRuleCount: applicableRules.filter((rule) => rule.enabled).length,
      blockedRuleCount,
      waitingRuleCount,
      hasQuery: Boolean(query),
      activeTabContext
    }));
    return;
  }

  activeRules.replaceChildren(...visibleRules.map((rule) => {
    const item = document.createElement("div");
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    const toggleButton = document.createElement("button");
    const toggleIcon = document.createElement("img");
    const isEnabled = rule.enabled;

    item.className = "popup-rule";
    item.title = getRuleTooltip(rule);
    item.dataset.enabled = String(isEnabled);
    name.textContent = rule.name || "Unnamed rule";
    name.title = `${isEnabled ? "Enabled" : "Disabled"} · ${rule.name || "Unnamed rule"}`;
    toggleButton.type = "button";
    toggleButton.className = "icon-button";
    toggleButton.setAttribute("aria-label", `${isEnabled ? "Disable" : "Enable"} ${rule.name || "Unnamed rule"}`);
    toggleButton.title = `${isEnabled ? "Disable" : "Enable"} ${rule.name || "Unnamed rule"}`;
    toggleIcon.src = isEnabled
      ? "../shared/imgs/icons/icons8-remove-32.png"
      : "../shared/imgs/icons/icons8-checkbox-checked-32.png";
    toggleIcon.alt = "";
    toggleIcon.width = 16;
    toggleIcon.height = 16;
    toggleButton.append(toggleIcon);
    toggleButton.addEventListener("click", async () => {
      try {
        toggleButton.disabled = true;
        const nextRules = rules.map((currentRule) => currentRule.id === rule.id
          ? { ...currentRule, enabled: !isEnabled, modifiedAt: new Date().toISOString() }
          : currentRule);
        rules = await applyRules(nextRules);
        await saveRedirectRules(rules);
        notify(isEnabled ? "Rule disabled" : "Rule enabled", "success");
        renderPopup();
      } catch (error) {
        notify(error.message, "error");
        toggleButton.disabled = false;
      }
    });

    detail.append(name);
    item.append(detail, toggleButton);
    return item;
  }));
}

function renderEmptyState(context) {
  const emptyState = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");

  emptyState.className = "popup-empty";

  if (!context.activeTabContext?.isSupported) {
    title.textContent = "This page cannot be matched";
    detail.textContent = "Open an http or https page so Altreurl can show contextual rules.";
  } else if (context.hasQuery && context.contextualRuleCount > 0) {
    title.textContent = "No matching rules on this page";
    detail.textContent = "Try another search keyword for this domain.";
  } else if (context.totalRuleCount === 0) {
    title.textContent = "No rules yet";
    detail.textContent = "Open rules to create your first redirect.";
  } else if (context.contextualRuleCount === 0) {
    title.textContent = `No rules for ${context.activeTabContext.hostLabel}`;
    detail.textContent = "Open rules to create or adjust a Source URL pattern for this domain.";
  } else if (context.enabledRuleCount === 0) {
    title.textContent = "All matching rules are disabled";
    detail.textContent = "Enable a rule from this popup or open rules for more details.";
  } else if (context.blockedRuleCount > 0 && context.contextualRuleCount > 0) {
    title.textContent = `${context.blockedRuleCount} ${context.blockedRuleCount === 1 ? "rule needs" : "rules need"} attention`;
    detail.textContent = "Open rules to fix invalid patterns, conflicts, or credential issues.";
  } else if (context.waitingRuleCount > 0) {
    title.textContent = `${context.waitingRuleCount} ${context.waitingRuleCount === 1 ? "rule is" : "rules are"} waiting sync`;
    detail.textContent = "Trigger one source request first, then the redirect can use synced credentials.";
  } else {
    title.textContent = "No enabled matching rules";
    detail.textContent = "Enable a matching rule here or open rules to review credential state.";
  }

  emptyState.append(title, detail);
  return emptyState;
}

async function getActiveTabContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url) : null;

    if (!url || !["http:", "https:"].includes(url.protocol)) {
      return {
        isSupported: false,
        hostLabel: "this page",
        hostname: "",
        origin: "",
        url: tab?.url || ""
      };
    }

    return {
      isSupported: true,
      hostLabel: url.hostname,
      hostname: url.hostname,
      origin: url.origin,
      url: url.href
    };
  } catch (_error) {
    return {
      isSupported: false,
      hostLabel: "this page",
      hostname: "",
      origin: "",
      url: ""
    };
  }
}

function isRuleApplicableToTab(rule, tabContext) {
  const scope = getRuleSourceScope(rule);

  return Boolean(scope?.hostname && tabContext.hostname && scope.hostname === tabContext.hostname);
}

function getRuleSourceScope(rule) {
  const patternType = normalizePatternType(rule.patternType);
  const sourcePattern = String(rule.sourcePattern || "").trim();

  if (!sourcePattern) {
    return null;
  }

  return patternType === PATTERN_TYPES.regex
    ? getRegexSourceScope(sourcePattern)
    : getWildcardSourceScope(sourcePattern);
}

function getWildcardSourceScope(sourcePattern) {
  const literalPrefix = sourcePattern.split("*")[0];

  return getUrlScope(literalPrefix || sourcePattern);
}

function getRegexSourceScope(sourcePattern) {
  const readablePattern = sourcePattern
    .replace(/^\^/, "")
    .replace(/\\\//g, "/")
    .replace(/\\\./g, ".")
    .replace(/\\:/g, ":");
  const match = readablePattern.match(/https?:\/\/[A-Za-z0-9.-]+(?::\d+)?/i);

  return match ? getUrlScope(match[0]) : null;
}

function getUrlScope(value) {
  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return {
      hostname: url.hostname,
      origin: url.origin
    };
  } catch (_error) {
    return null;
  }
}

function getRuleTooltip(rule) {
  return [
    `Source URL pattern: ${rule.sourcePattern || "Not set"}`,
    `Redirect target URL: ${rule.targetUrl || "Not set"}`
  ].join("\n");
}

async function applyRules(configRules) {
  const response = await chrome.runtime.sendMessage({
    type: "APPLY_RULES",
    rules: configRules
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unable to apply dynamic rules.");
  }

  return Array.isArray(response.rules) ? response.rules : configRules;
}

function getActiveRuleIds(configRules, attentionIds = getRuleAttentionIds(configRules)) {

  return new Set(configRules
    .filter((rule) => {
      try {
        return !attentionIds.has(rule.id) && buildDynamicRules([rule]).length > 0;
      } catch (_error) {
        return false;
      }
    })
    .map((rule) => rule.id));
}

function getRuleIssueIds(configRules) {
  try {
    return getRuleSetIssuesByRuleId(configRules);
  } catch (_error) {
    return new Map();
  }
}

function getRuleAttentionIds(configRules) {
  const attentionIds = getRuleIssueIds(configRules);

  configRules
    .filter((rule) => rule.enabled)
    .forEach((rule) => {
      try {
        buildDynamicRules([rule]);
      } catch (error) {
        attentionIds.set(rule.id, error.message || "Rule cannot be applied.");
      }
    });

  return attentionIds;
}

function getWaitingRuleCount(configRules, attentionIds) {
  return configRules.filter((rule) => {
    if (!rule.enabled || attentionIds.has(rule.id)) {
      return false;
    }

    try {
      return buildDynamicRules([rule]).length === 0;
    } catch (_error) {
      return false;
    }
  }).length;
}

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

ruleSearch.addEventListener("input", renderPopup);

renderPopup();
