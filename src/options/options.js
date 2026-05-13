import {
  PATTERN_TYPES,
  convertPatternFormat,
  createBlankRule,
  hasSyncEnabled,
  isWaitingForSyncCapture
} from "../shared/rules.js";
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
    syncHeaders: card.querySelector('[data-field="syncHeaders"]').checked,
    syncAuthorization: card.querySelector('[data-field="syncAuthorization"]').checked,
    syncCookies: card.querySelector('[data-field="syncCookies"]').checked,
    sourcePattern: card.querySelector('[data-field="sourcePattern"]').value.trim(),
    targetUrl: card.querySelector('[data-field="targetUrl"]').value.trim(),
    authorization: card.querySelector('[data-field="authorization"]').value.trim(),
    headers: [...card.querySelectorAll(".header-row")].map((row) => ({
      name: row.querySelector('[data-field="headerName"]').value.trim(),
      value: row.querySelector('[data-field="headerValue"]').value.trim()
    })),
    syncedHeaders: JSON.parse(card.dataset.syncedHeaders || "[]"),
    syncedAuthorization: card.dataset.syncedAuthorization || "",
    syncedCookieHeader: card.dataset.syncedCookieHeader || "",
    lastSyncedAt: card.dataset.lastSyncedAt || ""
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
  const patternTypeInput = card.querySelector('[data-field="patternType"]');
  const sourcePatternInput = card.querySelector('[data-field="sourcePattern"]');
  const targetUrlInput = card.querySelector('[data-field="targetUrl"]');

  card.dataset.ruleId = rule.id || crypto.randomUUID();
  card.querySelector('[data-field="enabled"]').checked = Boolean(rule.enabled);
  card.querySelector('[data-field="name"]').value = rule.name || "";
  card.dataset.patternType = rule.patternType || PATTERN_TYPES.wildcard;
  card.dataset.syncedHeaders = JSON.stringify(rule.syncedHeaders || []);
  card.dataset.syncedAuthorization = rule.syncedAuthorization || "";
  card.dataset.syncedCookieHeader = rule.syncedCookieHeader || "";
  card.dataset.lastSyncedAt = rule.lastSyncedAt || "";
  patternTypeInput.value = card.dataset.patternType;
  sourcePatternInput.value = rule.sourcePattern || "";
  targetUrlInput.value = rule.targetUrl || "";
  card.querySelector('[data-field="authorization"]').value = rule.authorization || "";
  card.querySelector('[data-field="syncHeaders"]').checked = Boolean(rule.syncHeaders);
  card.querySelector('[data-field="syncAuthorization"]').checked = Boolean(rule.syncAuthorization);
  card.querySelector('[data-field="syncCookies"]').checked = Boolean(rule.syncCookies);
  card.querySelector('[data-role="syncStatus"]').textContent = getSyncStatus(rule);

  patternTypeInput.addEventListener("change", () => {
    const fromType = card.dataset.patternType || PATTERN_TYPES.wildcard;
    const toType = patternTypeInput.value;

    sourcePatternInput.value = convertPatternFormat(sourcePatternInput.value.trim(), fromType, toType, "source");
    targetUrlInput.value = convertPatternFormat(targetUrlInput.value.trim(), fromType, toType, "target");
    card.dataset.patternType = toType;
    setStatus(`Pattern converted to ${toType}`);
  });

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

function getSyncStatus(rule) {
  if (!hasSyncEnabled(rule)) {
    return "Sync disabled";
  }

  if (isWaitingForSyncCapture(rule)) {
    return "Learning mode: trigger one source request";
  }

  return rule.lastSyncedAt
    ? `Last synced ${new Date(rule.lastSyncedAt).toLocaleString()}`
    : "Ready";
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.redirectRules) {
    return;
  }

  rules = Array.isArray(changes.redirectRules.newValue) ? changes.redirectRules.newValue : [];
  renderRules();
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
