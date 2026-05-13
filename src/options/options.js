import {
  PATTERN_TYPES,
  CREDENTIAL_MODES,
  convertPatternFormat,
  createBlankRule,
  hasSyncEnabled,
  isWaitingForSyncCapture
} from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules } from "../shared/storage.js";

const rulesList = document.querySelector("#rulesList");
const editorPanel = document.querySelector("#editorPanel");
const ruleCount = document.querySelector("#ruleCount");
const ruleListItemTemplate = document.querySelector("#ruleListItemTemplate");
const emptyEditorTemplate = document.querySelector("#emptyEditorTemplate");
const ruleTemplate = document.querySelector("#ruleTemplate");
const headerTemplate = document.querySelector("#headerTemplate");
const addRuleButton = document.querySelector("#addRule");
const saveRulesButton = document.querySelector("#saveRules");
const status = document.querySelector("#status");

let rules = await getRedirectRules();
let selectedRuleId = rules[0]?.id || "";

if (rules.length === 0) {
  const blankRule = createBlankRule();
  rules = [blankRule];
  selectedRuleId = blankRule.id;
}

function setStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 2500);
}

function getSelectedRule() {
  return rules.find((rule) => rule.id === selectedRuleId) || rules[0];
}

function updateSelectedRuleFromEditor() {
  const card = editorPanel.querySelector(".rule-editor");

  if (!card) {
    return;
  }

  const credentialMode = card.querySelector('[data-field="credentialMode"]').value;
  rules = rules.map((rule) => {
    if (rule.id !== selectedRuleId) {
      return rule;
    }

    return {
      ...rule,
      name: card.querySelector('[data-field="name"]').value.trim(),
      enabled: card.querySelector('[data-field="enabled"]').checked,
      patternType: card.querySelector('[data-field="patternType"]').value,
      credentialMode,
      syncHeaders: credentialMode === CREDENTIAL_MODES.sync &&
        card.querySelector('[data-field="syncHeaders"]').checked,
      syncAuthorization: credentialMode === CREDENTIAL_MODES.sync &&
        card.querySelector('[data-field="syncAuthorization"]').checked,
      syncCookies: credentialMode === CREDENTIAL_MODES.sync &&
        card.querySelector('[data-field="syncCookies"]').checked,
      sourcePattern: card.querySelector('[data-field="sourcePattern"]').value.trim(),
      targetUrl: card.querySelector('[data-field="targetUrl"]').value.trim(),
      authorization: card.querySelector('[data-field="authorization"]').value.trim(),
      headers: [...card.querySelectorAll(".header-row")].map((row) => ({
        name: row.querySelector('[data-field="headerName"]').value.trim(),
        value: row.querySelector('[data-field="headerValue"]').value.trim()
      }))
    };
  });
}

function renderRuleList() {
  ruleCount.textContent = `${rules.filter((rule) => rule.enabled).length}/${rules.length} enabled`;
  rulesList.replaceChildren(...rules.map((rule) => {
    const fragment = ruleListItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".rule-list-item");
    item.dataset.ruleId = rule.id;
    item.classList.toggle("is-selected", rule.id === selectedRuleId);
    item.querySelector('[data-role="ruleName"]').textContent = rule.name || "Unnamed rule";
    item.querySelector('[data-role="ruleMeta"]').textContent = `${rule.enabled ? "Enabled" : "Disabled"} · ${rule.credentialMode || CREDENTIAL_MODES.manual}`;
    item.addEventListener("click", () => {
      updateSelectedRuleFromEditor();
      selectedRuleId = rule.id;
      render();
    });
    return fragment;
  }));
}

function renderHeader(header = { name: "", value: "" }) {
  const fragment = headerTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".header-row");

  row.querySelector('[data-field="headerName"]').value = header.name || "";
  row.querySelector('[data-field="headerValue"]').value = header.value || "";
  row.querySelector('[data-action="removeHeader"]').addEventListener("click", () => {
    row.remove();
    updateSelectedRuleFromEditor();
    renderRuleList();
  });

  return fragment;
}

function renderEditor() {
  const rule = getSelectedRule();

  if (!rule) {
    editorPanel.replaceChildren(emptyEditorTemplate.content.cloneNode(true));
    return;
  }

  const fragment = ruleTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".rule-editor");
  const headersContainer = card.querySelector('[data-role="headers"]');
  const patternTypeInput = card.querySelector('[data-field="patternType"]');
  const credentialModeInput = card.querySelector('[data-field="credentialMode"]');
  const sourcePatternInput = card.querySelector('[data-field="sourcePattern"]');
  const targetUrlInput = card.querySelector('[data-field="targetUrl"]');
  const manualAuthorization = card.querySelector('[data-role="manualAuthorization"]');
  const manualHeaders = card.querySelector('[data-role="manualHeaders"]');
  const syncOptions = card.querySelector('[data-role="syncOptions"]');

  card.querySelector('[data-field="enabled"]').checked = Boolean(rule.enabled);
  card.querySelector('[data-field="name"]').value = rule.name || "";
  patternTypeInput.value = rule.patternType || PATTERN_TYPES.wildcard;
  credentialModeInput.value = rule.credentialMode || (hasSyncEnabled(rule) ? CREDENTIAL_MODES.sync : CREDENTIAL_MODES.manual);
  sourcePatternInput.value = rule.sourcePattern || "";
  targetUrlInput.value = rule.targetUrl || "";
  card.querySelector('[data-field="authorization"]').value = rule.authorization || "";
  card.querySelector('[data-field="syncHeaders"]').checked = Boolean(rule.syncHeaders);
  card.querySelector('[data-field="syncAuthorization"]').checked = Boolean(rule.syncAuthorization);
  card.querySelector('[data-field="syncCookies"]').checked = Boolean(rule.syncCookies);
  card.querySelector('[data-role="syncStatus"]').textContent = getSyncStatus(rule);
  updateCredentialModeVisibility(credentialModeInput.value, manualAuthorization, manualHeaders, syncOptions);

  card.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => {
      updateSelectedRuleFromEditor();
      renderRuleList();
    });
    input.addEventListener("change", () => {
      updateSelectedRuleFromEditor();
      renderRuleList();
    });
  });

  patternTypeInput.addEventListener("change", () => {
    const fromType = rule.patternType || PATTERN_TYPES.wildcard;
    const toType = patternTypeInput.value;

    sourcePatternInput.value = convertPatternFormat(sourcePatternInput.value.trim(), fromType, toType, "source");
    targetUrlInput.value = convertPatternFormat(targetUrlInput.value.trim(), fromType, toType, "target");
    updateSelectedRuleFromEditor();
    setStatus(`Pattern converted to ${toType}`);
  });

  credentialModeInput.addEventListener("change", () => {
    updateCredentialModeVisibility(credentialModeInput.value, manualAuthorization, manualHeaders, syncOptions);
    updateSelectedRuleFromEditor();
    renderRuleList();
  });

  (rule.headers || []).forEach((header) => {
    headersContainer.append(renderHeader(header));
  });

  card.querySelector('[data-action="addHeader"]').addEventListener("click", () => {
    headersContainer.append(renderHeader());
    updateSelectedRuleFromEditor();
  });

  card.querySelector('[data-action="removeRule"]').addEventListener("click", () => {
    rules = rules.filter((currentRule) => currentRule.id !== selectedRuleId);
    selectedRuleId = rules[0]?.id || "";
    render();
  });

  editorPanel.replaceChildren(fragment);
}

function render() {
  renderRuleList();
  renderEditor();
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

function updateCredentialModeVisibility(credentialMode, manualAuthorization, manualHeaders, syncOptions) {
  const isSyncMode = credentialMode === CREDENTIAL_MODES.sync;

  manualAuthorization.hidden = isSyncMode;
  manualHeaders.hidden = isSyncMode;
  syncOptions.hidden = !isSyncMode;
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
  updateSelectedRuleFromEditor();
  const blankRule = createBlankRule();
  rules = [...rules, blankRule];
  selectedRuleId = blankRule.id;
  render();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.redirectRules) {
    return;
  }

  rules = Array.isArray(changes.redirectRules.newValue) ? changes.redirectRules.newValue : [];
  selectedRuleId = rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : rules[0]?.id || "";
  render();
});

saveRulesButton.addEventListener("click", async () => {
  try {
    updateSelectedRuleFromEditor();
    await saveRedirectRules(rules);
    await applyRules(rules);
    setStatus("Rules saved");
  } catch (error) {
    setStatus(error.message);
  }
});

render();
