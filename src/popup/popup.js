import { getRedirectRules } from "../shared/storage.js";

const summary = document.querySelector("#summary");
const openOptions = document.querySelector("#openOptions");

const rules = await getRedirectRules();
const enabledCount = rules.filter((rule) => rule.enabled).length;

summary.textContent = `${enabledCount} of ${rules.length} rules enabled`;

openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

