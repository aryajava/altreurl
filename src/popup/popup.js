import { applyDynamicRules } from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules } from "../shared/storage.js";
import { initThemeControl } from "../shared/theme.js";
import { createNotifier } from "../shared/notifications.js";

const summary = document.querySelector("#summary");
const activeRules = document.querySelector("#activeRules");
const ruleSearch = document.querySelector("#ruleSearch");
const openOptions = document.querySelector("#openOptions");
const themePreference = document.querySelector("#themePreference");
const notifications = document.querySelector("#notifications");
const notify = createNotifier(notifications);

let rules = await getRedirectRules();

await initThemeControl(themePreference);

function renderPopup() {
  const enabledRules = rules.filter((rule) => rule.enabled);
  const query = ruleSearch.value.trim().toLowerCase();
  const visibleRules = enabledRules.filter((rule) => !query || [
    rule.name,
    rule.sourcePattern,
    rule.targetUrl
  ].some((value) => String(value || "").toLowerCase().includes(query)));

  summary.textContent = enabledRules.length === 0
    ? "No active rules"
    : `${enabledRules.length} active ${enabledRules.length === 1 ? "rule" : "rules"}`;

  if (visibleRules.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "popup-empty";
    emptyState.textContent = enabledRules.length === 0 ? "No active rules" : "No matching active rules";
    activeRules.replaceChildren(emptyState);
    return;
  }

  activeRules.replaceChildren(...visibleRules.map((rule) => {
    const item = document.createElement("div");
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    const target = document.createElement("small");
    const disableButton = document.createElement("button");

    item.className = "popup-rule";
    name.textContent = rule.name || "Unnamed rule";
    target.textContent = rule.targetUrl || "No target URL";
    disableButton.type = "button";
    disableButton.textContent = "Disable";
    disableButton.addEventListener("click", async () => {
      try {
        disableButton.disabled = true;
        rules = rules.map((currentRule) => currentRule.id === rule.id
          ? { ...currentRule, enabled: false }
          : currentRule);
        await saveRedirectRules(rules);
        await applyDynamicRules(rules);
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

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

ruleSearch.addEventListener("input", renderPopup);

renderPopup();
