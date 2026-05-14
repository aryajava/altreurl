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
const groupFilter = document.querySelector("#groupFilter");
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
let isRemovingRule = false;
let savedRuleIds = new Set(rules.map((rule) => rule.id));

await initThemeControl(themePreference, { controlType: "toggle" });

if (rules.length === 0) {
  const blankRule = createBlankRule();
  rules = [blankRule];
  selectedRuleId = blankRule.id;
}

function getSelectedRule() {
  return rules.find((rule) => rule.id === selectedRuleId) || rules[0];
}

function getDraftRules(persistedRules = []) {
  const persistedRuleIds = new Set(persistedRules.map((rule) => rule.id));
  return rules.filter((rule) => !savedRuleIds.has(rule.id) && !persistedRuleIds.has(rule.id));
}

function mergePersistedRulesWithDrafts(persistedRules = []) {
  return [...persistedRules, ...getDraftRules(persistedRules)];
}

function isDraftRule(rule) {
  return !savedRuleIds.has(rule.id);
}

function getRuleGroup(rule) {
  return String(rule.group || "").trim() || "Ungrouped";
}

function getRuleStatus(rule) {
  if (isDraftRule(rule)) {
    return { key: "draft", label: "Draft" };
  }

  if (!rule.enabled) {
    return { key: "disabled", label: "Disabled" };
  }

  if (!isRuleConfigValid(rule)) {
    return { key: "invalid", label: "Invalid" };
  }

  if (isWaitingForSyncCapture(rule)) {
    return { key: "waiting", label: "Waiting sync" };
  }

  return { key: "ready", label: "Ready" };
}

function isRuleConfigValid(rule) {
  if (!rule.sourcePattern || !rule.targetUrl) {
    return false;
  }

  if (rule.patternType === PATTERN_TYPES.regex) {
    try {
      new RegExp(rule.sourcePattern);
    } catch (_error) {
      return false;
    }

    return true;
  }

  const sourceWildcardCount = countWildcardCharacters(rule.sourcePattern);
  const targetWildcardCount = countWildcardCharacters(rule.targetUrl);

  if (targetWildcardCount > 0 && sourceWildcardCount === 0) {
    return false;
  }

  return sourceWildcardCount === 0 ||
    targetWildcardCount === 0 ||
    sourceWildcardCount === targetWildcardCount;
}

function countWildcardCharacters(value) {
  return [...String(value || "")].filter((character) => character === "*").length;
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
      group: card.querySelector('[data-field="group"]').value.trim(),
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
  renderGroupFilter();
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
    const ruleStatus = getRuleStatus(rule);
    item.querySelector('[data-role="ruleName"]').textContent = rule.name || "Unnamed rule";
    const statusBadge = item.querySelector('[data-role="statusBadge"]');
    statusBadge.textContent = ruleStatus.label;
    statusBadge.dataset.status = ruleStatus.key;
    item.querySelector('[data-role="ruleGroup"]').textContent = getRuleGroup(rule);
    item.querySelector('[data-role="ruleMeta"]').textContent = `${rule.credentialMode || CREDENTIAL_MODES.manual} · ${rule.patternType || PATTERN_TYPES.wildcard}`;
    item.addEventListener("click", () => {
      updateSelectedRuleFromEditor();
      selectedRuleId = rule.id;
      render();
    });
    return fragment;
  }));
}

function renderGroupFilter() {
  const selectedGroup = groupFilter.value || "all";
  const groups = [...new Set(rules.map((rule) => getRuleGroup(rule)))].sort((leftGroup, rightGroup) => {
    if (leftGroup === "Ungrouped") {
      return 1;
    }

    if (rightGroup === "Ungrouped") {
      return -1;
    }

    return leftGroup.localeCompare(rightGroup);
  });
  const options = [
    new Option("All groups", "all"),
    ...groups.map((group) => new Option(group, group))
  ];

  groupFilter.replaceChildren(...options);
  groupFilter.value = groups.includes(selectedGroup) ? selectedGroup : "all";
}

function getFilteredRules() {
  const query = ruleSearch.value.trim().toLowerCase();
  const status = statusFilter.value;
  const group = groupFilter.value;
  const credentialMode = credentialFilter.value;

  return [...rules]
    .filter((rule) => {
      const normalizedCredentialMode = rule.credentialMode || (hasSyncEnabled(rule) ? CREDENTIAL_MODES.sync : CREDENTIAL_MODES.manual);
      const matchesQuery = !query || [
        rule.name,
        rule.group,
        rule.sourcePattern,
        rule.targetUrl
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const ruleStatus = getRuleStatus(rule);
      const matchesStatus = status === "all" ||
        ruleStatus.key === status ||
        (status === "enabled" && rule.enabled && ruleStatus.key !== "draft");
      const matchesGroup = group === "all" || getRuleGroup(rule) === group;
      const matchesCredential = credentialMode === "all" || normalizedCredentialMode === credentialMode;

      return matchesQuery && matchesStatus && matchesGroup && matchesCredential;
    })
    .sort((leftRule, rightRule) => getRuleUpdatedAt(rightRule) - getRuleUpdatedAt(leftRule));
}

function getRuleUpdatedAt(rule) {
  const timestamp = Date.parse(rule.modifiedAt || rule.createdAt || "");
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
  card.querySelector('[data-role="editorDraftBadge"]').hidden = !isDraftRule(rule);
  card.querySelector('[data-field="name"]').value = rule.name || "";
  card.querySelector('[data-field="group"]').value = rule.group || "";
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

  card.querySelector('[data-action="removeRule"]').addEventListener("click", async (event) => {
    await removeCurrentRule(event.currentTarget);
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
    touchSelectedRule();
    const selectedRule = getSelectedRule();
    const persistedRules = await getRedirectRules();
    const savedRules = upsertRule(persistedRules, selectedRule);

    savedRuleIds = new Set(savedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(savedRules);
    await saveRedirectRules(savedRules);
    await applyRules(savedRules);
    render();
    notify("Rule saved", "success");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    isSavingRule = false;
    saveButton.disabled = false;
    saveButton.textContent = "Save Rule";
  }
}

function upsertRule(savedRules, ruleToSave) {
  const existingRuleIndex = savedRules.findIndex((rule) => rule.id === ruleToSave.id);

  if (existingRuleIndex === -1) {
    return [ruleToSave, ...savedRules];
  }

  return savedRules.map((rule) => rule.id === ruleToSave.id ? ruleToSave : rule);
}

async function removeCurrentRule(removeButton) {
  if (isRemovingRule) {
    return;
  }

  try {
    isRemovingRule = true;
    removeButton.disabled = true;
    const ruleToRemove = getSelectedRule();

    if (!ruleToRemove) {
      return;
    }

    if (isDraftRule(ruleToRemove)) {
      rules = rules.filter((rule) => rule.id !== ruleToRemove.id);
      selectedRuleId = rules[0]?.id || "";
      render();
      notify("Draft rule removed");
      return;
    }

    const persistedRules = await getRedirectRules();
    const savedRules = persistedRules.filter((rule) => rule.id !== ruleToRemove.id);

    savedRuleIds = new Set(savedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(savedRules).filter((rule) => rule.id !== ruleToRemove.id);
    selectedRuleId = rules[0]?.id || "";
    await saveRedirectRules(savedRules);
    await applyRules(savedRules);
    render();
    notify("Rule removed", "success");
  } catch (error) {
    notify(error.message, "error");
    removeButton.disabled = false;
  } finally {
    isRemovingRule = false;
  }
}

function touchSelectedRule() {
  const modifiedAt = new Date().toISOString();
  rules = rules.map((rule) => rule.id === selectedRuleId ? { ...rule, modifiedAt } : rule);
}

addRuleButton.addEventListener("click", () => {
  updateSelectedRuleFromEditor();
  const blankRule = createBlankRule();
  rules = [blankRule, ...rules];
  selectedRuleId = blankRule.id;
  render();
  notify("Rule added");
});

[ruleSearch, statusFilter, groupFilter, credentialFilter].forEach((control) => {
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

  const persistedRules = Array.isArray(changes.redirectRules.newValue) ? changes.redirectRules.newValue : [];
  savedRuleIds = new Set(persistedRules.map((rule) => rule.id));
  rules = mergePersistedRulesWithDrafts(persistedRules);
  selectedRuleId = rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : rules[0]?.id || "";
  render();
});

render();
