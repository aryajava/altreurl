import { applyDynamicRules } from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules } from "../shared/storage.js";

const summary = document.querySelector("#summary");
const activeRules = document.querySelector("#activeRules");
const openOptions = document.querySelector("#openOptions");

let rules = await getRedirectRules();

function renderPopup() {
  const enabledRules = rules.filter((rule) => rule.enabled);
  summary.textContent = enabledRules.length === 0
    ? "No active rules"
    : `${enabledRules.length} active ${enabledRules.length === 1 ? "rule" : "rules"}`;

  activeRules.replaceChildren(...enabledRules.map((rule) => {
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
      rules = rules.map((currentRule) => currentRule.id === rule.id
        ? { ...currentRule, enabled: false }
        : currentRule);
      await saveRedirectRules(rules);
      await applyDynamicRules(rules);
      renderPopup();
    });

    detail.append(name, target);
    item.append(detail, disableButton);
    return item;
  }));
}

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

renderPopup();
