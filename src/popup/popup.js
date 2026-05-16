import { buildDynamicRules, getRuleSetIssuesByRuleId, normalizePatternType, PATTERN_TYPES } from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules } from "../shared/storage.js";
import { initThemeControl } from "../shared/theme.js";
import { createNotifier } from "../shared/notifications.js";

const summary = document.querySelector("#summary");
const activeRules = document.querySelector("#activeRules");
const ruleSearch = document.querySelector("#ruleSearch");
const openOptions = document.querySelector("#openOptions");
const notifications = document.querySelector("#notifications");
const notify = createNotifier(notifications, { scope: "popup" });

let rules = await getRedirectRules();
let activeTabContext = await getActiveTabContext();

await initThemeControl();

function renderPopup() {
  const attentionIds = getRuleAttentionIds(rules);
  const applicableRules = activeTabContext.isSupported
    ? rules.filter((rule) => isRuleApplicableToTab(rule, activeTabContext))
    : [];
  const enabledRuleCount = applicableRules.filter((rule) => rule.enabled).length;
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
      : `${enabledRuleCount}/${applicableRules.length} enabled for ${activeTabContext.hostLabel}`;
  summary.textContent = blockedRuleCount > 0
    ? `${activeSummary} · ${blockedRuleCount} need attention`
    : activeSummary;

  if (visibleRules.length === 0) {
    activeRules.replaceChildren(renderEmptyState({
      totalRuleCount: rules.length,
      contextualRuleCount: applicableRules.length,
      enabledRuleCount,
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
    const ruleTooltip = getRuleTooltip(rule, isEnabled);
    const actionLabel = `${isEnabled ? "Disable" : "Enable"} ${rule.name || "Unnamed rule"}`;

    item.className = "popup-rule";
    item.title = ruleTooltip;
    item.dataset.enabled = String(isEnabled);
    name.textContent = rule.name || "Unnamed rule";
    toggleButton.type = "button";
    toggleButton.className = "icon-button";
    toggleButton.setAttribute("aria-label", actionLabel);
    toggleButton.title = `${actionLabel}\n\n${ruleTooltip}`;
    toggleIcon.src = isEnabled
      ? "../shared/imgs/icons/icons8-checkbox-32.png"
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
      host: url.host,
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
  const matcher = getRuleSourceMatcher(rule);

  return Boolean(matcher?.(tabContext));
}

function getRuleSourceMatcher(rule) {
  const patternType = normalizePatternType(rule.patternType);
  const sourcePattern = String(rule.sourcePattern || "").trim();

  if (!sourcePattern) {
    return null;
  }

  return patternType === PATTERN_TYPES.regex
    ? getRegexSourceMatcher(sourcePattern)
    : getWildcardSourceMatcher(sourcePattern);
}

function getWildcardSourceMatcher(sourcePattern) {
  const hostPattern = getWildcardSourceHostPattern(sourcePattern);

  return hostPattern ? buildHostMatcher(hostPattern) : null;
}

function getRegexSourceMatcher(sourcePattern) {
  const readablePattern = sourcePattern
    .replace(/^\^/, "")
    .replace(/\\\//g, "/")
    .replace(/\\\./g, ".")
    .replace(/\\:/g, ":");
  const match = readablePattern.match(/(?:https\?:|https?:)\/\/([A-Za-z0-9.-]+(?::\d+)?)/i);

  return match ? buildHostMatcher(match[1]) : null;
}

function getWildcardSourceHostPattern(sourcePattern) {
  const match = sourcePattern.match(/^(?:https?|\*):\/\/([^/\s]+)/i);

  return match?.[1] || "";
}

function buildHostMatcher(hostPattern) {
  const normalizedHostPattern = String(hostPattern || "").trim().toLowerCase();

  if (!normalizedHostPattern) {
    return null;
  }

  const shouldMatchPort = normalizedHostPattern.includes(":");
  const regex = normalizedHostPattern.includes("*")
    ? new RegExp(`^${escapeRegex(normalizedHostPattern).replace(/\*/g, ".*")}$`, "i")
    : null;

  return (tabContext) => {
    const candidate = String(shouldMatchPort ? tabContext.host : tabContext.hostname || "").toLowerCase();

    return regex ? regex.test(candidate) : candidate === normalizedHostPattern;
  };
}

function escapeRegex(value) {
  return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

function getRuleTooltip(rule, isEnabled = rule.enabled) {
  return [
    `Status: ${isEnabled ? "Enabled" : "Disabled"}`,
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
