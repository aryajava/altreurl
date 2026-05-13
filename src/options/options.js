import {
  PATTERN_TYPES,
  CREDENTIAL_MODES,
  CREDENTIAL_SOURCES,
  STORAGE_AREAS,
  convertPatternFormat,
  createBlankRule,
  hasSyncEnabled,
  isWaitingForSyncCapture
} from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules } from "../shared/storage.js";
import { initThemeControl } from "../shared/theme.js";
import { createNotifier } from "../shared/notifications.js";

const rulesList = document.querySelector("#rulesList");
const editorPanel = document.querySelector("#editorPanel");
const ruleCount = document.querySelector("#ruleCount");
const ruleSearch = document.querySelector("#ruleSearch");
const statusFilter = document.querySelector("#statusFilter");
const credentialFilter = document.querySelector("#credentialFilter");
const toggleRuleControls = document.querySelector("#toggleRuleControls");
const ruleListControls = document.querySelector("#ruleListControls");
const ruleListItemTemplate = document.querySelector("#ruleListItemTemplate");
const emptyEditorTemplate = document.querySelector("#emptyEditorTemplate");
const ruleTemplate = document.querySelector("#ruleTemplate");
const headerTemplate = document.querySelector("#headerTemplate");
const addRuleButton = document.querySelector("#addRule");
const themePreference = document.querySelector("#themePreference");
const notifications = document.querySelector("#notifications");
const notify = createNotifier(notifications);

let rules = await getRedirectRules();
let selectedRuleId = rules[0]?.id || "";
let isSavingRule = false;

await initThemeControl(themePreference, { controlType: "toggle" });

if (rules.length === 0) {
  const blankRule = createBlankRule();
  rules = [blankRule];
  selectedRuleId = blankRule.id;
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
      credentialSource: card.querySelector('[data-field="credentialSource"]').value,
      storageArea: card.querySelector('[data-field="storageArea"]').value,
      authorizationKey: card.querySelector('[data-field="authorizationKey"]').value.trim(),
      authorizationPrefix: card.querySelector('[data-field="authorizationPrefix"]').value,
      headersKey: card.querySelector('[data-field="headersKey"]').value.trim(),
      cookieNames: card.querySelector('[data-field="cookieNames"]').value.trim(),
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
  const filteredRules = getFilteredRules();
  ruleCount.textContent = `${filteredRules.length}/${rules.length} shown`;

  if (filteredRules.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "rule-list-empty";
    emptyState.textContent = "No matching rules";
    rulesList.replaceChildren(emptyState);
    return;
  }

  rulesList.replaceChildren(...filteredRules.map((rule) => {
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

function getFilteredRules() {
  const query = ruleSearch.value.trim().toLowerCase();
  const status = statusFilter.value;
  const credentialMode = credentialFilter.value;

  return [...rules]
    .filter((rule) => {
      const normalizedCredentialMode = rule.credentialMode || (hasSyncEnabled(rule) ? CREDENTIAL_MODES.sync : CREDENTIAL_MODES.manual);
      const matchesQuery = !query || [
        rule.name,
        rule.sourcePattern,
        rule.targetUrl
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = status === "all" ||
        (status === "enabled" && rule.enabled) ||
        (status === "disabled" && !rule.enabled);
      const matchesCredential = credentialMode === "all" || normalizedCredentialMode === credentialMode;

      return matchesQuery && matchesStatus && matchesCredential;
    })
    .sort((leftRule, rightRule) => getRuleCreatedAt(rightRule) - getRuleCreatedAt(leftRule));
}

function getRuleCreatedAt(rule) {
  const timestamp = Date.parse(rule.createdAt || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
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
  const credentialSourceInput = card.querySelector('[data-field="credentialSource"]');
  const manualAuthorization = card.querySelector('[data-role="manualAuthorization"]');
  const manualHeaders = card.querySelector('[data-role="manualHeaders"]');
  const syncOptions = card.querySelector('[data-role="syncOptions"]');
  const sourceFields = {
    storageArea: card.querySelector('[data-role="storageAreaField"]'),
    authorizationKey: card.querySelector('[data-role="authorizationKeyField"]'),
    authorizationPrefix: card.querySelector('[data-role="authorizationPrefixField"]'),
    headersKey: card.querySelector('[data-role="headersKeyField"]'),
    cookieNames: card.querySelector('[data-role="cookieNamesField"]')
  };

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
  credentialSourceInput.value = rule.credentialSource || CREDENTIAL_SOURCES.request;
  card.querySelector('[data-field="storageArea"]').value = rule.storageArea || STORAGE_AREAS.localStorage;
  card.querySelector('[data-field="authorizationKey"]').value = rule.authorizationKey || "";
  card.querySelector('[data-field="authorizationPrefix"]').value = rule.authorizationPrefix || "";
  card.querySelector('[data-field="headersKey"]').value = rule.headersKey || "";
  card.querySelector('[data-field="cookieNames"]').value = rule.cookieNames || "";
  card.querySelector('[data-role="syncStatus"]').textContent = getSyncStatus(rule);
  updateCredentialModeVisibility(credentialModeInput.value, manualAuthorization, manualHeaders, syncOptions);
  updateCredentialSourceVisibility(credentialSourceInput.value, sourceFields);

  card.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => {
      if (input === patternTypeInput) {
        return;
      }

      updateSelectedRuleFromEditor();
      renderRuleList();
    });
    input.addEventListener("change", () => {
      if (input === patternTypeInput) {
        return;
      }

      updateSelectedRuleFromEditor();
      renderRuleList();
    });
  });

  patternTypeInput.addEventListener("change", () => {
    const previousRule = getSelectedRule();
    const fromType = previousRule?.patternType || PATTERN_TYPES.wildcard;
    const toType = patternTypeInput.value;

    if (fromType === toType) {
      return;
    }

    sourcePatternInput.value = convertPatternFormat(sourcePatternInput.value.trim(), fromType, toType, "source");
    targetUrlInput.value = convertPatternFormat(targetUrlInput.value.trim(), fromType, toType, "target");
    updateSelectedRuleFromEditor();
    renderRuleList();
    notify(`Pattern converted to ${toType}`);
  });

  credentialModeInput.addEventListener("change", () => {
    updateCredentialModeVisibility(credentialModeInput.value, manualAuthorization, manualHeaders, syncOptions);
    updateSelectedRuleFromEditor();
    renderRuleList();
  });

  credentialSourceInput.addEventListener("change", () => {
    updateCredentialSourceVisibility(credentialSourceInput.value, sourceFields);
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

  card.querySelector('[data-action="saveRule"]').addEventListener("click", async (event) => {
    await saveCurrentRule(event.currentTarget);
  });

  card.querySelector('[data-action="removeRule"]').addEventListener("click", () => {
    rules = rules.filter((currentRule) => currentRule.id !== selectedRuleId);
    selectedRuleId = rules[0]?.id || "";
    render();
    notify("Rule removed");
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
    return rule.credentialSource && rule.credentialSource !== CREDENTIAL_SOURCES.request
      ? "Waiting for credential source values"
      : "Learning mode: trigger one source request";
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

function updateCredentialSourceVisibility(credentialSource, sourceFields) {
  const isRequestSource = credentialSource === CREDENTIAL_SOURCES.request;
  const isStorageSource = credentialSource === CREDENTIAL_SOURCES.storage;
  const isCookieSource = credentialSource === CREDENTIAL_SOURCES.cookie;

  sourceFields.storageArea.hidden = !isStorageSource;
  sourceFields.authorizationKey.hidden = isRequestSource;
  sourceFields.authorizationPrefix.hidden = isRequestSource;
  sourceFields.headersKey.hidden = !isStorageSource;
  sourceFields.cookieNames.hidden = !isCookieSource;
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

async function saveCurrentRule(saveButton) {
  if (isSavingRule) {
    return;
  }

  try {
    isSavingRule = true;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    updateSelectedRuleFromEditor();
    await saveRedirectRules(rules);
    await applyRules(rules);
    notify("Rule saved", "success");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    isSavingRule = false;
    saveButton.disabled = false;
    saveButton.textContent = "Save Rule";
  }
}

addRuleButton.addEventListener("click", () => {
  updateSelectedRuleFromEditor();
  const blankRule = createBlankRule();
  rules = [blankRule, ...rules];
  selectedRuleId = blankRule.id;
  render();
  notify("Rule added");
});

[ruleSearch, statusFilter, credentialFilter].forEach((control) => {
  control.addEventListener("input", renderRuleList);
  control.addEventListener("change", renderRuleList);
});

toggleRuleControls.addEventListener("click", () => {
  const isHidden = ruleListControls.hidden;

  ruleListControls.hidden = !isHidden;
  toggleRuleControls.setAttribute("aria-expanded", String(isHidden));
  toggleRuleControls.textContent = isHidden ? "Hide search and filters" : "Show search and filters";
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.redirectRules) {
    return;
  }

  rules = Array.isArray(changes.redirectRules.newValue) ? changes.redirectRules.newValue : [];
  selectedRuleId = rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : rules[0]?.id || "";
  render();
});

render();
