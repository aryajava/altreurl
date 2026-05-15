import {
  PATTERN_TYPES,
  CREDENTIAL_MODES,
  CREDENTIAL_SOURCES,
  STORAGE_AREAS,
  convertPatternFormat,
  createBlankRule,
  getGeneratedDynamicRuleCount,
  getRuleSetIssuesByRuleId,
  hasSyncEnabled,
  isRegexSubstitutionValid,
  isWaitingForSyncCapture
} from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules, STORAGE_KEYS } from "../shared/storage.js";
import { initThemeControl } from "../shared/theme.js";
import { createNotifier } from "../shared/notifications.js";

const rulesList = document.querySelector("#rulesList");
const editorPanel = document.querySelector("#editorPanel");
const ruleCount = document.querySelector("#ruleCount");
const ruleSearch = document.querySelector("#ruleSearch");
const statusFilter = document.querySelector("#statusFilter");
const groupFilter = document.querySelector("#groupFilter");
const credentialFilter = document.querySelector("#credentialFilter");
const bulkToolbar = document.querySelector("#bulkToolbar");
const selectVisibleRules = document.querySelector("#selectVisibleRules");
const selectedRuleCount = document.querySelector("#selectedRuleCount");
const bulkEnable = document.querySelector("#bulkEnable");
const bulkDisable = document.querySelector("#bulkDisable");
const bulkGroupName = document.querySelector("#bulkGroupName");
const bulkMoveGroup = document.querySelector("#bulkMoveGroup");
const bulkDuplicate = document.querySelector("#bulkDuplicate");
const bulkExport = document.querySelector("#bulkExport");
const bulkRemove = document.querySelector("#bulkRemove");
const bulkActions = document.querySelector('[data-role="bulkActions"]');
const toggleRuleControls = document.querySelector("#toggleRuleControls");
const filterToggleLabel = toggleRuleControls.querySelector('[data-role="filterToggleLabel"]');
const filterToggleStateIcon = toggleRuleControls.querySelector('[data-role="filterToggleStateIcon"]');
const ruleListControls = document.querySelector("#ruleListControls");
const ruleListItemTemplate = document.querySelector("#ruleListItemTemplate");
const emptyEditorTemplate = document.querySelector("#emptyEditorTemplate");
const ruleTemplate = document.querySelector("#ruleTemplate");
const headerTemplate = document.querySelector("#headerTemplate");
const addRuleButton = document.querySelector("#addRule");
const importRulesButton = document.querySelector("#importRules");
const importRulesFile = document.querySelector("#importRulesFile");
const themePreference = document.querySelector("#themePreference");
const notifications = document.querySelector("#notifications");
const notify = createNotifier(notifications, { scope: "options" });

let rules = await getRedirectRules();
let selectedRuleId = "";
let isSavingRule = false;
let isRemovingRule = false;
let savedRuleIds = new Set(rules.map((rule) => rule.id));
let selectedRuleIds = new Set();

await initThemeControl(themePreference, { controlType: "toggle" });

function getSelectedRule() {
  return rules.find((rule) => rule.id === selectedRuleId);
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

function createRuleId() {
  return crypto.randomUUID();
}

function timestampNow() {
  return new Date().toISOString();
}

function cloneRuleAsDraft(rule, suffix = "Copy") {
  const now = timestampNow();

  return {
    ...rule,
    id: createRuleId(),
    name: `${rule.name || "Unnamed rule"} ${suffix}`.trim(),
    enabled: false,
    createdAt: now,
    modifiedAt: now
  };
}

function normalizeImportedRule(rule) {
  if (!rule || typeof rule !== "object") {
    return null;
  }

  const blankRule = createBlankRule();

  return {
    ...blankRule,
    ...rule,
    id: createRuleId(),
    createdAt: timestampNow(),
    modifiedAt: timestampNow(),
    enabled: Boolean(rule.enabled),
    name: String(rule.name || blankRule.name).trim() || blankRule.name,
    group: String(rule.group || "").trim()
  };
}

function getSelectedRules() {
  return rules.filter((rule) => selectedRuleIds.has(rule.id));
}

function getPersistedRulesFromMemory() {
  return rules.filter((rule) => savedRuleIds.has(rule.id));
}

function getRuleGroup(rule) {
  return String(rule.group || "").trim() || "Ungrouped";
}

function getRuleStatus(rule) {
  const ruleSetIssue = getRuleSetIssue(rule);

  if (ruleSetIssue) {
    return { key: "conflict", label: "Conflict", description: ruleSetIssue };
  }

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

function getRuleStatusDescription(ruleStatus) {
  if (ruleStatus.description) {
    return ruleStatus.description;
  }

  const descriptions = {
    conflict: "Rule target overlaps another rule that modifies credential headers.",
    draft: "Rule ini belum tersimpan. Klik Save Rule untuk menyimpan rule ini.",
    disabled: "Rule tersimpan tetapi sedang nonaktif.",
    invalid: "Rule aktif tetapi Source URL pattern atau Redirect target URL belum valid.",
    waiting: "Rule menunggu credential sync. Jalankan satu request source atau lengkapi sumber storage/cookie.",
    ready: "Rule aktif, valid, dan siap menjalankan redirect."
  };

  return descriptions[ruleStatus.key] || "Status rule";
}

function getRuleSetIssue(rule) {
  try {
    const persistedRules = getPersistedRulesFromMemory();
    const candidateRules = persistedRules.some((persistedRule) => persistedRule.id === rule.id)
      ? persistedRules.map((persistedRule) => persistedRule.id === rule.id ? rule : persistedRule)
      : [...persistedRules, rule];

    return getRuleSetIssuesByRuleId(candidateRules).get(rule.id) || "";
  } catch (_error) {
    return "";
  }
}

function getDynamicRuleCountLabel(rule) {
  try {
    const count = getGeneratedDynamicRuleCount([rule]);
    return `${count} DNR ${count === 1 ? "rule" : "rules"}`;
  } catch (_error) {
    return "DNR invalid";
  }
}

function isRuleConfigValid(rule) {
  if (!rule.sourcePattern || !rule.targetUrl) {
    return false;
  }

  if (rule.sourcePattern.includes("#") || rule.targetUrl.includes("#")) {
    return false;
  }

  if (rule.patternType === PATTERN_TYPES.regex) {
    try {
      new RegExp(rule.sourcePattern);
    } catch (_error) {
      return false;
    }

    return isRegexSubstitutionValid(rule.sourcePattern, rule.targetUrl);
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
  renderBulkToolbar(filteredRules);

  if (filteredRules.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "rule-list-empty";
    emptyState.textContent = "No matching rules";
    rulesList.replaceChildren(emptyState);
    return;
  }

  rulesList.replaceChildren(...filteredRules.map((rule) => {
    const fragment = ruleListItemTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".rule-list-row");
    const selector = fragment.querySelector('[data-role="ruleSelect"]');
    const item = fragment.querySelector(".rule-list-item");
    row.dataset.ruleId = rule.id;
    item.dataset.ruleId = rule.id;
    row.classList.toggle("is-selected", rule.id === selectedRuleId);
    selector.checked = selectedRuleIds.has(rule.id);
    selector.addEventListener("change", () => {
      if (selector.checked) {
        selectedRuleIds.add(rule.id);
      } else {
        selectedRuleIds.delete(rule.id);
      }

      renderRuleList();
    });
    const ruleStatus = getRuleStatus(rule);
    item.querySelector('[data-role="ruleName"]').textContent = rule.name || "Unnamed rule";
    const statusBadge = item.querySelector('[data-role="statusBadge"]');
    statusBadge.textContent = ruleStatus.label;
    statusBadge.dataset.status = ruleStatus.key;
    statusBadge.title = getRuleStatusDescription(ruleStatus);
    item.title = `Source: ${rule.sourcePattern || "No source pattern"}\nTarget: ${rule.targetUrl || "No redirect target"}`;
    item.querySelector('[data-role="ruleGroup"]').textContent = getRuleGroup(rule);
    item.querySelector('[data-role="ruleMeta"]').textContent = `${rule.credentialMode || CREDENTIAL_MODES.manual} · ${rule.patternType || PATTERN_TYPES.wildcard} · ${getDynamicRuleCountLabel(rule)}`;
    item.addEventListener("click", () => {
      updateSelectedRuleFromEditor();
      selectedRuleId = rule.id;
      render();
    });
    return fragment;
  }));
}

function renderBulkToolbar(visibleRules = getFilteredRules()) {
  const visibleRuleIds = new Set(visibleRules.map((rule) => rule.id));
  selectedRuleIds = new Set([...selectedRuleIds].filter((ruleId) => rules.some((rule) => rule.id === ruleId) || visibleRuleIds.has(ruleId)));
  const selectedVisibleCount = visibleRules.filter((rule) => selectedRuleIds.has(rule.id)).length;
  const selectedCount = selectedRuleIds.size;

  bulkToolbar.hidden = rules.length === 0;
  selectedRuleCount.textContent = selectedCount > 0
    ? `${selectedCount} selected`
    : `${visibleRules.length} visible`;
  selectVisibleRules.checked = visibleRules.length > 0 && selectedVisibleCount === visibleRules.length;
  selectVisibleRules.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRules.length;
  bulkActions.hidden = selectedCount === 0;

  [bulkEnable, bulkDisable, bulkMoveGroup, bulkDuplicate, bulkRemove].forEach((button) => {
    button.disabled = selectedCount === 0;
  });
  bulkGroupName.disabled = selectedCount === 0;
  bulkExport.textContent = selectedCount > 0 ? "Export selected" : "Export all";
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
    const fragment = emptyEditorTemplate.content.cloneNode(true);
    fragment.querySelectorAll('[data-action="addEmptyRule"]').forEach((button) => {
      button.addEventListener("click", addDraftRule);
    });
    editorPanel.replaceChildren(fragment);
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
  const syncPreview = card.querySelector('[data-role="syncPreview"]');
  const syncTabs = card.querySelector('[data-role="syncTabs"]');
  const syncPreviewContent = card.querySelector('[data-role="syncPreviewContent"]');
  const sourceFields = {
    storageArea: card.querySelector('[data-role="storageAreaField"]'),
    authorizationKey: card.querySelector('[data-role="authorizationKeyField"]'),
    authorizationPrefix: card.querySelector('[data-role="authorizationPrefixField"]'),
    headersKey: card.querySelector('[data-role="headersKeyField"]'),
    cookieNames: card.querySelector('[data-role="cookieNamesField"]')
  };

  card.querySelector('[data-field="enabled"]').checked = Boolean(rule.enabled);
  const editorStatusBadge = card.querySelector('[data-role="editorStatusBadge"]');
  const ruleStatus = getRuleStatus(rule);
  editorStatusBadge.textContent = ruleStatus.label;
  editorStatusBadge.dataset.status = ruleStatus.key;
  editorStatusBadge.title = getRuleStatusDescription(ruleStatus);
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
  renderSyncPreview(rule, syncPreview, syncTabs, syncPreviewContent);

  card.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => {
      if (input === patternTypeInput || input === credentialModeInput || input === credentialSourceInput) {
        return;
      }

      updateSelectedRuleFromEditor();
      renderRuleList();
      renderSyncPreview(getSelectedRule(), syncPreview, syncTabs, syncPreviewContent);
    });
    input.addEventListener("change", () => {
      if (input === patternTypeInput || input === credentialModeInput || input === credentialSourceInput) {
        return;
      }

      updateSelectedRuleFromEditor();
      renderRuleList();
      renderSyncPreview(getSelectedRule(), syncPreview, syncTabs, syncPreviewContent);
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
    renderSyncPreview(getSelectedRule(), syncPreview, syncTabs, syncPreviewContent);
  });

  credentialSourceInput.addEventListener("change", () => {
    updateCredentialSourceVisibility(credentialSourceInput.value, sourceFields);
    updateSelectedRuleFromEditor();
    renderRuleList();
    renderSyncPreview(getSelectedRule(), syncPreview, syncTabs, syncPreviewContent);
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

function getSyncPreviewTabs(rule) {
  const tabs = [];

  if (rule.syncHeaders) {
    const headers = normalizeSyncedHeadersForPreview(rule.syncedHeaders);
    tabs.push({
      key: "headers",
      label: "Headers",
      title: "Readonly headers captured from the source request or credential source",
      emptyText: "No synced headers captured yet.",
      rows: headers
    });
  }

  if (rule.syncAuthorization) {
    tabs.push({
      key: "authorization",
      label: "Authorization",
      title: "Readonly Authorization value captured from the source request or credential source",
      emptyText: "No synced authorization captured yet.",
      rows: rule.syncedAuthorization
        ? [{ name: "Authorization", value: rule.syncedAuthorization }]
        : []
    });
  }

  if (rule.syncCookies) {
    tabs.push({
      key: "cookies",
      label: "Session cookies",
      title: "Readonly Cookie header generated from synced session cookies",
      emptyText: "No synced session cookies captured yet.",
      rows: parseCookieHeaderForPreview(rule.syncedCookieHeader)
    });
  }

  return tabs;
}

function normalizeSyncedHeadersForPreview(headers = []) {
  return (Array.isArray(headers) ? headers : [])
    .map((header) => ({
      name: String(header.name || "").trim(),
      value: String(header.value || "").trim()
    }))
    .filter((header) => header.name && header.value);
}

function parseCookieHeaderForPreview(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const separatorIndex = cookie.indexOf("=");
      return separatorIndex === -1
        ? { name: cookie, value: "" }
        : {
            name: cookie.slice(0, separatorIndex).trim(),
            value: cookie.slice(separatorIndex + 1).trim()
          };
    })
    .filter((cookie) => cookie.name);
}

function renderSyncPreview(rule, syncPreview, syncTabs, syncPreviewContent) {
  const tabs = getSyncPreviewTabs(rule);
  const credentialMode = rule.credentialMode || (hasSyncEnabled(rule) ? CREDENTIAL_MODES.sync : CREDENTIAL_MODES.manual);

  if (credentialMode !== CREDENTIAL_MODES.sync || tabs.length === 0) {
    syncPreview.hidden = true;
    syncTabs.replaceChildren();
    syncPreviewContent.replaceChildren();
    return;
  }

  syncPreview.hidden = false;
  const activeKey = tabs.some((tab) => tab.key === syncPreview.dataset.activeTab)
    ? syncPreview.dataset.activeTab
    : tabs[0].key;
  syncPreview.dataset.activeTab = activeKey;
  const activeTab = tabs.find((tab) => tab.key === activeKey) || tabs[0];

  syncTabs.replaceChildren(...tabs.map((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sync-tab";
    button.dataset.tab = tab.key;
    button.textContent = tab.label;
    button.title = tab.title;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.key === activeKey));
    button.classList.toggle("is-active", tab.key === activeKey);
    button.addEventListener("click", () => {
      syncPreview.dataset.activeTab = tab.key;
      renderSyncPreview(getSelectedRule(), syncPreview, syncTabs, syncPreviewContent);
    });
    return button;
  }));

  renderSyncPreviewContent(activeTab, syncPreviewContent);
  syncPreviewContent.title = activeTab.title;
}

function renderSyncPreviewContent(tab, syncPreviewContent) {
  const rows = tab.rows || [];

  if (rows.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "sync-preview-empty";
    emptyState.textContent = tab.emptyText;
    syncPreviewContent.replaceChildren(emptyState);
    return;
  }

  const list = document.createElement("div");
  list.className = "sync-preview-list";

  rows.forEach((row) => {
    const rowElement = document.createElement("div");
    rowElement.className = "sync-preview-row";

    const nameElement = document.createElement("span");
    nameElement.className = "sync-preview-row__name";
    nameElement.textContent = row.name;

    const valueElement = document.createElement("code");
    valueElement.className = "sync-preview-row__value";
    valueElement.textContent = row.value;

    rowElement.append(nameElement, valueElement);
    list.append(rowElement);
  });

  syncPreviewContent.replaceChildren(list);
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

  return Array.isArray(response.rules) ? response.rules : savedRules;
}

async function saveCurrentRule(saveButton) {
  if (isSavingRule) {
    return;
  }

  const saveButtonLabel = saveButton.querySelector('[data-role="saveRuleLabel"]');

  try {
    isSavingRule = true;
    saveButton.disabled = true;
    saveButtonLabel.textContent = "Saving...";
    updateSelectedRuleFromEditor();
    touchSelectedRule();
    const selectedRule = getSelectedRule();
    const persistedRules = await getRedirectRules();
    const savedRules = upsertRule(persistedRules, selectedRule);
    const appliedRules = await applyRules(savedRules);

    savedRuleIds = new Set(appliedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(appliedRules);
    await saveRedirectRules(appliedRules);
    render();
    notify("Rule saved", "success");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    isSavingRule = false;
    saveButton.disabled = false;
    saveButtonLabel.textContent = "Save Rule";
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
      selectedRuleId = "";
      render();
      notify("Draft rule removed");
      return;
    }

    const persistedRules = await getRedirectRules();
    const savedRules = persistedRules.filter((rule) => rule.id !== ruleToRemove.id);
    const appliedRules = await applyRules(savedRules);

    savedRuleIds = new Set(appliedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(appliedRules).filter((rule) => rule.id !== ruleToRemove.id);
    selectedRuleId = "";
    await saveRedirectRules(appliedRules);
    render();
    notify("Rule removed", "success");
  } catch (error) {
    notify(error.message, "error");
    removeButton.disabled = false;
  } finally {
    isRemovingRule = false;
  }
}

async function savePersistedRules(nextRules) {
  const savedRules = nextRules.filter((rule) => savedRuleIds.has(rule.id));
  const appliedRules = await applyRules(savedRules);

  savedRuleIds = new Set(appliedRules.map((rule) => rule.id));
  rules = mergePersistedRulesWithDrafts(appliedRules);
  await saveRedirectRules(appliedRules);
}

async function updateSelectedRules(mutator, successMessage) {
  if (selectedRuleIds.size === 0) {
    return;
  }

  const previousRules = rules;
  const previousSavedRuleIds = new Set(savedRuleIds);

  try {
    const modifiedAt = timestampNow();
    rules = rules.map((rule) => selectedRuleIds.has(rule.id)
      ? mutator({ ...rule, modifiedAt })
      : rule);
    await savePersistedRules(rules);
    render();
    notify(successMessage, "success");
  } catch (error) {
    rules = previousRules;
    savedRuleIds = previousSavedRuleIds;
    render();
    notify(error.message, "error");
  }
}

async function removeSelectedRules() {
  const selectedCount = selectedRuleIds.size;

  if (selectedCount === 0) {
    return;
  }

  if (!window.confirm(`Remove ${selectedCount} selected ${selectedCount === 1 ? "rule" : "rules"}?`)) {
    return;
  }

  const previousRules = rules;
  const previousSavedRuleIds = new Set(savedRuleIds);
  const previousSelectedRuleIds = new Set(selectedRuleIds);
  const previousSelectedRuleId = selectedRuleId;

  try {
    rules = rules.filter((rule) => !selectedRuleIds.has(rule.id));
    savedRuleIds = new Set(rules.filter((rule) => savedRuleIds.has(rule.id)).map((rule) => rule.id));
    selectedRuleIds = new Set();
    selectedRuleId = rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : "";
    const appliedRules = await applyRules(getPersistedRulesFromMemory());

    savedRuleIds = new Set(appliedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(appliedRules);
    await saveRedirectRules(appliedRules);
    render();
    notify("Selected rules removed", "success");
  } catch (error) {
    rules = previousRules;
    savedRuleIds = previousSavedRuleIds;
    selectedRuleIds = previousSelectedRuleIds;
    selectedRuleId = previousSelectedRuleId;
    render();
    notify(error.message, "error");
  }
}

function duplicateSelectedRules() {
  const selectedRules = getSelectedRules();

  if (selectedRules.length === 0) {
    return;
  }

  const duplicatedRules = selectedRules.map((rule) => cloneRuleAsDraft(rule));
  rules = [...duplicatedRules, ...rules];
  selectedRuleIds = new Set(duplicatedRules.map((rule) => rule.id));
  selectedRuleId = duplicatedRules[0].id;
  render();
  notify(`${duplicatedRules.length} duplicated ${duplicatedRules.length === 1 ? "rule" : "rules"} added as draft`);
}

function exportRules() {
  const rulesToExport = selectedRuleIds.size > 0 ? getSelectedRules() : getPersistedRulesFromMemory();

  if (rulesToExport.length === 0) {
    notify("No rules to export", "error");
    return;
  }

  const exportBlob = new Blob([JSON.stringify({ version: 1, rules: rulesToExport }, null, 2)], {
    type: "application/json"
  });
  const exportUrl = URL.createObjectURL(exportBlob);
  const downloadLink = document.createElement("a");

  downloadLink.href = exportUrl;
  downloadLink.download = `altreurl-rules-${new Date().toISOString().slice(0, 10)}.json`;
  downloadLink.click();
  URL.revokeObjectURL(exportUrl);
  notify(`${rulesToExport.length} ${rulesToExport.length === 1 ? "rule" : "rules"} exported`, "success");
}

async function importRules(file) {
  if (!file) {
    return;
  }

  try {
    const parsedData = JSON.parse(await file.text());
    const importedRules = Array.isArray(parsedData) ? parsedData : parsedData.rules;
    const draftRules = Array.isArray(importedRules)
      ? importedRules.map(normalizeImportedRule).filter(Boolean)
      : [];

    if (draftRules.length === 0) {
      throw new Error("No valid rules found in import file.");
    }

    rules = [...draftRules, ...rules];
    selectedRuleIds = new Set(draftRules.map((rule) => rule.id));
    selectedRuleId = draftRules[0].id;
    render();
    notify(`${draftRules.length} imported ${draftRules.length === 1 ? "rule" : "rules"} added as draft`, "success");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    importRulesFile.value = "";
  }
}

function touchSelectedRule() {
  const modifiedAt = new Date().toISOString();
  rules = rules.map((rule) => rule.id === selectedRuleId ? { ...rule, modifiedAt } : rule);
}

function addDraftRule() {
  updateSelectedRuleFromEditor();
  const blankRule = createBlankRule();
  rules = [blankRule, ...rules];
  selectedRuleId = blankRule.id;
  selectedRuleIds = new Set([blankRule.id]);
  render();
  notify("Rule added");
}

addRuleButton.addEventListener("click", addDraftRule);

selectVisibleRules.addEventListener("change", () => {
  const visibleRules = getFilteredRules();

  if (selectVisibleRules.checked) {
    visibleRules.forEach((rule) => selectedRuleIds.add(rule.id));
  } else {
    visibleRules.forEach((rule) => selectedRuleIds.delete(rule.id));
  }

  renderRuleList();
});

bulkEnable.addEventListener("click", async () => {
  await updateSelectedRules((rule) => ({ ...rule, enabled: true }), "Selected rules enabled");
});

bulkDisable.addEventListener("click", async () => {
  await updateSelectedRules((rule) => ({ ...rule, enabled: false }), "Selected rules disabled");
});

bulkMoveGroup.addEventListener("click", async () => {
  const group = bulkGroupName.value.trim();

  await updateSelectedRules((rule) => ({ ...rule, group }), "Selected rules moved");
});

bulkDuplicate.addEventListener("click", duplicateSelectedRules);
bulkExport.addEventListener("click", exportRules);
bulkRemove.addEventListener("click", removeSelectedRules);

importRulesButton.addEventListener("click", () => {
  importRulesFile.click();
});

importRulesFile.addEventListener("change", async () => {
  await importRules(importRulesFile.files[0]);
});

[ruleSearch, statusFilter, groupFilter, credentialFilter].forEach((control) => {
  control.addEventListener("input", renderRuleList);
  control.addEventListener("change", renderRuleList);
});

toggleRuleControls.addEventListener("click", () => {
  const isHidden = ruleListControls.hidden;

  ruleListControls.hidden = !isHidden;
  toggleRuleControls.setAttribute("aria-expanded", String(isHidden));
  filterToggleLabel.textContent = isHidden ? "Hide search and filters" : "Show search and filters";
  filterToggleStateIcon.src = isHidden
    ? "../shared/imgs/icons/icons8-eye-close-32.png"
    : "../shared/imgs/icons/icons8-eye-32.png";
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[STORAGE_KEYS.applyError]?.newValue?.message) {
    notify(changes[STORAGE_KEYS.applyError].newValue.message, "error");
  }

  if (changes.redirectRules) {
    const persistedRules = Array.isArray(changes.redirectRules.newValue) ? changes.redirectRules.newValue : [];
    savedRuleIds = new Set(persistedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(persistedRules);
    selectedRuleId = rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : "";
    render();
  }
});

render();
