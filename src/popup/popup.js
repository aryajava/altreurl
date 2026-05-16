import { buildDynamicRules, getRuleSetIssuesByRuleId } from "../shared/rules.js";
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

await initThemeControl();
checkForUpdates()
  .then((status) => renderUpdateStatus(updateStatus, status))
  .catch((error) => notify(error.message, "error"));

function renderPopup() {
  const attentionIds = getRuleAttentionIds(rules);
  const activeRuleIds = getActiveRuleIds(rules, attentionIds);
  const enabledRules = rules.filter((rule) => activeRuleIds.has(rule.id));
  const blockedRuleCount = rules.filter((rule) => rule.enabled && attentionIds.has(rule.id)).length;
  const waitingRuleCount = getWaitingRuleCount(rules, attentionIds);
  const query = ruleSearch.value.trim().toLowerCase();
  const visibleRules = enabledRules.filter((rule) => !query || [
    rule.name,
    rule.sourcePattern,
    rule.targetUrl
  ].some((value) => String(value || "").toLowerCase().includes(query)));

  const activeSummary = enabledRules.length === 0
    ? "No active rules"
    : `${enabledRules.length} active ${enabledRules.length === 1 ? "rule" : "rules"}`;
  summary.textContent = blockedRuleCount > 0
    ? `${activeSummary} · ${blockedRuleCount} need attention`
    : activeSummary;

  if (visibleRules.length === 0) {
    activeRules.replaceChildren(renderEmptyState({
      totalRuleCount: rules.length,
      activeRuleCount: enabledRules.length,
      enabledRuleCount: rules.filter((rule) => rule.enabled).length,
      blockedRuleCount,
      waitingRuleCount,
      hasQuery: Boolean(query)
    }));
    return;
  }

  activeRules.replaceChildren(...visibleRules.map((rule) => {
    const item = document.createElement("div");
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    const target = document.createElement("small");
    const disableButton = document.createElement("button");
    const disableIcon = document.createElement("img");

    item.className = "popup-rule";
    name.textContent = rule.name || "Unnamed rule";
    target.textContent = rule.targetUrl || "No target URL";
    disableButton.type = "button";
    disableButton.className = "icon-button";
    disableIcon.src = "../shared/imgs/icons/icons8-remove-32.png";
    disableIcon.alt = "";
    disableIcon.width = 16;
    disableIcon.height = 16;
    disableButton.append(disableIcon, "Disable");
    disableButton.addEventListener("click", async () => {
      try {
        disableButton.disabled = true;
        rules = rules.map((currentRule) => currentRule.id === rule.id
          ? { ...currentRule, enabled: false }
          : currentRule);
        rules = await applyRules(rules);
        await saveRedirectRules(rules);
        notify("Rule disabled", "success");
        renderPopup();
      } catch (error) {
        notify(error.message, "error");
        disableButton.disabled = false;
      }
    });

    detail.append(name, target);
    item.append(detail, disableButton);
    return item;
  }));
}

function renderEmptyState(context) {
  const emptyState = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");

  emptyState.className = "popup-empty";

  if (context.hasQuery && context.activeRuleCount > 0) {
    title.textContent = "No matching active rules";
    detail.textContent = "Try another search keyword.";
  } else if (context.totalRuleCount === 0) {
    title.textContent = "No rules yet";
    detail.textContent = "Open rules to create your first redirect.";
  } else if (context.enabledRuleCount === 0) {
    title.textContent = "All rules are disabled";
    detail.textContent = "Open rules to enable one or create a new rule.";
  } else if (context.blockedRuleCount > 0) {
    title.textContent = `${context.blockedRuleCount} ${context.blockedRuleCount === 1 ? "rule needs" : "rules need"} attention`;
    detail.textContent = "Open rules to fix invalid patterns, conflicts, or credential issues.";
  } else if (context.waitingRuleCount > 0) {
    title.textContent = `${context.waitingRuleCount} ${context.waitingRuleCount === 1 ? "rule is" : "rules are"} waiting sync`;
    detail.textContent = "Trigger one source request first, then the redirect can use synced credentials.";
  } else {
    title.textContent = "No active rules";
    detail.textContent = "Open rules to review enabled rules and credential state.";
  }

  emptyState.append(title, detail);
  return emptyState;
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
