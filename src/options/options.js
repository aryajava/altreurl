import { PATTERN_TYPES, createBlankRule } from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules } from "../shared/storage.js";

const rulesList = document.querySelector("#rulesList");
const ruleTemplate = document.querySelector("#ruleTemplate");
const headerTemplate = document.querySelector("#headerTemplate");
const addRuleButton = document.querySelector("#addRule");
const saveRulesButton = document.querySelector("#saveRules");
const status = document.querySelector("#status");

let rules = await getRedirectRules();

if (rules.length === 0) {
  rules = [createBlankRule()];
}

function setStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 2500);
}

function readRulesFromDom() {
  return [...rulesList.querySelectorAll(".rule-card")].map((card) => ({
    id: card.dataset.ruleId,
    name: card.querySelector('[data-field="name"]').value.trim(),
    enabled: card.querySelector('[data-field="enabled"]').checked,
    patternType: card.querySelector('[data-field="patternType"]').value,
    sourcePattern: card.querySelector('[data-field="sourcePattern"]').value.trim(),
    targetUrl: card.querySelector('[data-field="targetUrl"]').value.trim(),
    authorization: card.querySelector('[data-field="authorization"]').value.trim(),
    headers: [...card.querySelectorAll(".header-row")].map((row) => ({
      name: row.querySelector('[data-field="headerName"]').value.trim(),
      value: row.querySelector('[data-field="headerValue"]').value.trim()
    }))
  }));
}

function renderHeader(header = { name: "", value: "" }) {
  const fragment = headerTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".header-row");

  row.querySelector('[data-field="headerName"]').value = header.name || "";
  row.querySelector('[data-field="headerValue"]').value = header.value || "";
  row.querySelector('[data-action="removeHeader"]').addEventListener("click", () => {
    row.remove();
  });

  return fragment;
}

function renderRule(rule) {
  const fragment = ruleTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".rule-card");
  const headersContainer = card.querySelector('[data-role="headers"]');

  card.dataset.ruleId = rule.id || crypto.randomUUID();
  card.querySelector('[data-field="enabled"]').checked = Boolean(rule.enabled);
  card.querySelector('[data-field="name"]').value = rule.name || "";
  card.querySelector('[data-field="patternType"]').value = rule.patternType || PATTERN_TYPES.wildcard;
  card.querySelector('[data-field="sourcePattern"]').value = rule.sourcePattern || "";
  card.querySelector('[data-field="targetUrl"]').value = rule.targetUrl || "";
  card.querySelector('[data-field="authorization"]').value = rule.authorization || "";

  (rule.headers || []).forEach((header) => {
    headersContainer.append(renderHeader(header));
  });

  card.querySelector('[data-action="addHeader"]').addEventListener("click", () => {
    headersContainer.append(renderHeader());
  });

  card.querySelector('[data-action="removeRule"]').addEventListener("click", () => {
    card.remove();
  });

  return fragment;
}

function renderRules() {
  rulesList.replaceChildren(...rules.map(renderRule));
}

async function applyRules(savedRules) {
  const response = await chrome.runtime.sendMessage({
    type: "APPLY_RULES",
    rules: savedRules
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unable to apply dynamic rules.");
  }
}

addRuleButton.addEventListener("click", () => {
  rulesList.append(renderRule(createBlankRule()));
});

saveRulesButton.addEventListener("click", async () => {
  try {
    const nextRules = readRulesFromDom();
    await saveRedirectRules(nextRules);
    await applyRules(nextRules);
    rules = nextRules;
    setStatus("Rules saved");
  } catch (error) {
    setStatus(error.message);
  }
});

renderRules();
