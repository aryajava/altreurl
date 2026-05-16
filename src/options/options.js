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
  isRegexPatternValid,
  isRegexSubstitutionValid,
  isWaitingForSyncCapture
} from "../shared/rules.js";
import { getRedirectRules, saveRedirectRules, STORAGE_KEYS } from "../shared/storage.js";
import { initThemeControl } from "../shared/theme.js";
import { createNotifier } from "../shared/notifications.js";
import { applyTranslations, t } from "../shared/i18n.js";

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
const bulkExportLabel = bulkExport.querySelector('[data-role="bulkExportLabel"]');

let rules = await getRedirectRules();
let selectedRuleId = "";
let isSavingRule = false;
let isRemovingRule = false;
let savedRuleIds = new Set(rules.map((rule) => rule.id));
let selectedRuleIds = new Set();
const BACKGROUND_SYNC_FIELDS = [
  "syncedHeaders",
  "syncedAuthorization",
  "syncedCookieHeader",
  "lastSyncedAt"
];

applyTranslations();
await initThemeControl(themePreference, { controlType: "toggle" });

function getSelectedRule() {
  return rules.find((rule) => rule.id === selectedRuleId);
}

function getDraftRules(persistedRules = []) {
  const persistedRuleIds = new Set(persistedRules.map((rule) => rule.id));
  return rules.filter((rule) => !savedRuleIds.has(rule.id) && !persistedRuleIds.has(rule.id));
}

function mergePersistedRulesWithDrafts(persistedRules = [], options = {}) {
  const committedRuleIds = options.committedRuleIds || new Set();
  const localRulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const mergedPersistedRules = persistedRules.map((persistedRule) => {
    const localRule = localRulesById.get(persistedRule.id);

    if (!localRule || committedRuleIds.has(persistedRule.id)) {
      return persistedRule;
    }

    return mergeLocalRuleWithBackgroundSync(localRule, persistedRule);
  });

  return [...mergedPersistedRules, ...getDraftRules(persistedRules)];
}

function mergeLocalRuleWithBackgroundSync(localRule, persistedRule) {
  const nextRule = { ...persistedRule, ...localRule };

  BACKGROUND_SYNC_FIELDS.forEach((field) => {
    nextRule[field] = persistedRule[field];
  });

  return nextRule;
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
    name: `${rule.name || t("options.rules.unnamed")} ${suffix}`.trim(),
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
  return String(rule.group || "").trim() || t("options.rules.ungrouped");
}

function getRuleStatus(rule) {
  rule = normalizeRuleCredentialCapabilities(rule);
  const ruleSetIssue = getRuleSetIssue(rule);

  if (isDraftRule(rule)) {
    if (ruleSetIssue) {
      return {
        key: "draft",
        label: t("options.status.draftConflict"),
        description: t("options.status.draftConflict.description", { issue: ruleSetIssue })
      };
    }

    return { key: "draft", label: t("common.draft") };
  }

  if (ruleSetIssue) {
    return { key: "conflict", label: t("common.conflict"), description: ruleSetIssue };
  }

  if (!rule.enabled) {
    return { key: "disabled", label: t("common.disabled") };
  }

  if (!isRuleConfigValid(rule)) {
    return { key: "invalid", label: t("common.invalid") };
  }

  if (isWaitingForSyncCapture(rule)) {
    return { key: "waiting", label: t("options.status.waiting") };
  }

  return { key: "ready", label: t("common.ready") };
}

function normalizeRuleCredentialCapabilities(rule) {
  if (rule?.credentialSource !== CREDENTIAL_SOURCES.cookie || !rule.syncHeaders) {
    return rule;
  }

  return {
    ...rule,
    syncHeaders: false,
    syncedHeaders: []
  };
}

function getRuleStatusDescription(ruleStatus) {
  if (ruleStatus.description) {
    return ruleStatus.description;
  }

  const descriptions = {
    conflict: t("options.status.conflict.description"),
    draft: t("options.status.draft.description"),
    disabled: t("options.status.disabled.description"),
    invalid: t("options.status.invalid.description"),
    waiting: t("options.status.waiting.description"),
    ready: t("options.status.ready.description")
  };

  return descriptions[ruleStatus.key] || t("options.status.label");
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
    return t("options.rules.dynamicCount", { count, noun: count === 1 ? t("common.rule") : t("common.rules") });
  } catch (_error) {
    return t("options.rules.dynamicInvalid");
  }
}

function isRuleConfigValid(rule) {
  return getRuleValidationMessages(rule).length === 0;
}

function getRuleValidationMessages(rule) {
  const messages = [];

  if (!rule.sourcePattern || !rule.targetUrl) {
    if (!rule.sourcePattern) {
      messages.push({ field: "sourcePattern", message: t("options.validation.sourceRequired") });
    }

    if (!rule.targetUrl) {
      messages.push({ field: "targetUrl", message: t("options.validation.targetRequired") });
    }

    return messages;
  }

  if (rule.sourcePattern.includes("#")) {
    messages.push({ field: "sourcePattern", message: t("options.validation.sourceFragment") });
  }

  if (rule.targetUrl.includes("#")) {
    messages.push({ field: "targetUrl", message: t("options.validation.targetFragment") });
  }

  if (rule.patternType === PATTERN_TYPES.regex) {
    if (!isRegexPatternValid(rule.sourcePattern)) {
      messages.push({ field: "sourcePattern", message: t("options.validation.regexInvalid") });
      return messages;
    }

    if (!isRegexSubstitutionValid(rule.sourcePattern, rule.targetUrl)) {
      messages.push({ field: "targetUrl", message: t("options.validation.missingCaptureGroup") });
    }

    return messages;
  }

  const sourceWildcardCount = countWildcardCharacters(rule.sourcePattern);
  const targetWildcardCount = countWildcardCharacters(rule.targetUrl);

  if (targetWildcardCount > 0 && sourceWildcardCount === 0) {
    messages.push({ field: "targetUrl", message: t("options.validation.targetWildcardWithoutSource") });
    return messages;
  }

  if (sourceWildcardCount > 0 && targetWildcardCount > 0 && sourceWildcardCount !== targetWildcardCount) {
    messages.push({
      field: "targetUrl",
      message: t("options.validation.wildcardCount", {
        targetCount: targetWildcardCount,
        sourceCount: sourceWildcardCount
      })
    });
  }

  return messages;
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

    return normalizeRuleCredentialCapabilities({
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
    });
  });
}

function renderRuleList() {
  renderGroupFilter();
  const filteredRules = getFilteredRules();
  ruleCount.textContent = t("options.rules.count", { shown: filteredRules.length, total: rules.length });
  renderBulkToolbar(filteredRules);

  if (filteredRules.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "rule-list-empty";
    emptyState.textContent = t("options.rules.empty");
    rulesList.replaceChildren(emptyState);
    return;
  }

  rulesList.replaceChildren(...filteredRules.map((rule) => {
    const fragment = ruleListItemTemplate.content.cloneNode(true);
    applyTranslations(fragment);
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
    item.querySelector('[data-role="ruleName"]').textContent = rule.name || t("options.rules.unnamed");
    const statusBadge = item.querySelector('[data-role="statusBadge"]');
    statusBadge.textContent = ruleStatus.label;
    statusBadge.dataset.status = ruleStatus.key;
    statusBadge.title = getRuleStatusDescription(ruleStatus);
    item.title = t("options.rules.itemTooltip", {
      source: rule.sourcePattern || t("options.rules.noSource"),
      target: rule.targetUrl || t("options.rules.noTarget")
    });
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
    ? t("options.rules.selected", { count: selectedCount })
    : t("options.rules.visible", { count: visibleRules.length });
  selectVisibleRules.checked = visibleRules.length > 0 && selectedVisibleCount === visibleRules.length;
  selectVisibleRules.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRules.length;
  bulkActions.hidden = selectedCount === 0;

  [bulkEnable, bulkDisable, bulkMoveGroup, bulkDuplicate, bulkRemove].forEach((button) => {
    button.disabled = selectedCount === 0;
  });
  bulkGroupName.disabled = selectedCount === 0;
  bulkExportLabel.textContent = t(selectedCount > 0 ? "options.actions.exportSelected" : "options.actions.exportAll");
}

function renderGroupFilter() {
  const selectedGroup = groupFilter.value || "all";
  const groups = [...new Set(rules.map((rule) => getRuleGroup(rule)))].sort((leftGroup, rightGroup) => {
    if (leftGroup === t("options.rules.ungrouped")) {
      return 1;
    }

    if (rightGroup === t("options.rules.ungrouped")) {
      return -1;
    }

    return leftGroup.localeCompare(rightGroup);
  });
  const options = [
    new Option(t("options.rules.filter.allGroups"), "all"),
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
  applyTranslations(fragment);
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

function renderInlineValidation(rule, card) {
  const messagesByField = new Map();

  getRuleValidationMessages(rule).forEach((validation) => {
    const messages = messagesByField.get(validation.field) || [];
    messages.push(validation.message);
    messagesByField.set(validation.field, messages);
  });

  card.querySelectorAll("[data-feedback-for]").forEach((feedback) => {
    const field = feedback.dataset.feedbackFor;
    const messages = messagesByField.get(field) || [];
    const input = card.querySelector(`[data-field="${field}"]`);

    feedback.textContent = messages.join(" ");
    feedback.hidden = messages.length === 0;
    input?.classList.toggle("is-invalid", messages.length > 0);
    input?.setAttribute("aria-invalid", String(messages.length > 0));
  });
}

function renderEditor() {
  let rule = getSelectedRule();

  if (!rule) {
    const fragment = emptyEditorTemplate.content.cloneNode(true);
    applyTranslations(fragment);
    fragment.querySelectorAll('[data-action="addEmptyRule"]').forEach((button) => {
      button.addEventListener("click", addDraftRule);
    });
    editorPanel.replaceChildren(fragment);
    return;
  }

  const normalizedRule = normalizeRuleCredentialCapabilities(rule);
  if (normalizedRule !== rule) {
    rule = normalizedRule;
    rules = rules.map((currentRule) => currentRule.id === rule.id ? rule : currentRule);
  }

  const fragment = ruleTemplate.content.cloneNode(true);
  applyTranslations(fragment);
  const card = fragment.querySelector(".rule-editor");
  const headersContainer = card.querySelector('[data-role="headers"]');
  const patternTypeInput = card.querySelector('[data-field="patternType"]');
  const credentialModeInput = card.querySelector('[data-field="credentialMode"]');
  const sourcePatternInput = card.querySelector('[data-field="sourcePattern"]');
  const targetUrlInput = card.querySelector('[data-field="targetUrl"]');
  const credentialSourceInput = card.querySelector('[data-field="credentialSource"]');
  const syncHeadersInput = card.querySelector('[data-field="syncHeaders"]');
  const syncAuthorizationInput = card.querySelector('[data-field="syncAuthorization"]');
  const syncCookiesInput = card.querySelector('[data-field="syncCookies"]');
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
  syncHeadersInput.checked = Boolean(rule.syncHeaders);
  syncAuthorizationInput.checked = Boolean(rule.syncAuthorization);
  syncCookiesInput.checked = Boolean(rule.syncCookies);
  credentialSourceInput.value = rule.credentialSource || CREDENTIAL_SOURCES.request;
  card.querySelector('[data-field="storageArea"]').value = rule.storageArea || STORAGE_AREAS.localStorage;
  card.querySelector('[data-field="authorizationKey"]').value = rule.authorizationKey || "";
  card.querySelector('[data-field="authorizationPrefix"]').value = rule.authorizationPrefix || "";
  card.querySelector('[data-field="headersKey"]').value = rule.headersKey || "";
  card.querySelector('[data-field="cookieNames"]').value = rule.cookieNames || "";
  card.querySelector('[data-role="syncStatus"]').textContent = getSyncStatus(rule);
  updateCredentialModeVisibility(credentialModeInput.value, manualAuthorization, manualHeaders, syncOptions);
  updateCredentialSourceVisibility(credentialSourceInput.value, sourceFields, syncHeadersInput);
  renderInlineValidation(rule, card);
  renderSyncPreview(rule, syncPreview, syncTabs, syncPreviewContent);

  card.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => {
      if (input === patternTypeInput || input === credentialModeInput || input === credentialSourceInput) {
        return;
      }

      updateSelectedRuleFromEditor();
      renderInlineValidation(getSelectedRule(), card);
      renderRuleList();
      renderSyncPreview(getSelectedRule(), syncPreview, syncTabs, syncPreviewContent);
    });
    input.addEventListener("change", () => {
      if (input === patternTypeInput || input === credentialModeInput || input === credentialSourceInput) {
        return;
      }

      updateSelectedRuleFromEditor();
      renderInlineValidation(getSelectedRule(), card);
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
    renderInlineValidation(getSelectedRule(), card);
    renderRuleList();
    notify(t("options.toast.patternConverted", { type: toType }));
  });

  credentialModeInput.addEventListener("change", () => {
    updateCredentialModeVisibility(credentialModeInput.value, manualAuthorization, manualHeaders, syncOptions);
    updateSelectedRuleFromEditor();
    renderInlineValidation(getSelectedRule(), card);
    renderRuleList();
    renderSyncPreview(getSelectedRule(), syncPreview, syncTabs, syncPreviewContent);
  });

  credentialSourceInput.addEventListener("change", () => {
    updateCredentialSourceVisibility(credentialSourceInput.value, sourceFields, syncHeadersInput);
    updateSelectedRuleFromEditor();
    renderInlineValidation(getSelectedRule(), card);
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
      label: t("common.headers"),
      title: t("options.sync.headers.title"),
      emptyText: t("options.sync.headers.empty"),
      rows: headers
    });
  }

  if (rule.syncAuthorization) {
    tabs.push({
      key: "authorization",
      label: t("common.authorization"),
      title: t("options.sync.authorization.title"),
      emptyText: t("options.sync.authorization.empty"),
      rows: rule.syncedAuthorization
        ? [{ name: "Authorization", value: rule.syncedAuthorization }]
        : []
    });
  }

  if (rule.syncCookies) {
    tabs.push({
      key: "cookies",
      label: t("options.editor.sessionCookies"),
      title: t("options.sync.cookies.title"),
      emptyText: t("options.sync.cookies.empty"),
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
    return t("options.sync.status.disabled");
  }

  if (isWaitingForSyncCapture(rule)) {
    return rule.credentialSource && rule.credentialSource !== CREDENTIAL_SOURCES.request
      ? t("options.sync.status.waitingCredentialSource")
      : t("options.sync.status.waitingSource");
  }

  return rule.lastSyncedAt
    ? t("options.sync.status.lastSynced", { time: new Date(rule.lastSyncedAt).toLocaleString() })
    : t("common.ready");
}

function updateCredentialModeVisibility(credentialMode, manualAuthorization, manualHeaders, syncOptions) {
  const isSyncMode = credentialMode === CREDENTIAL_MODES.sync;

  manualAuthorization.hidden = isSyncMode;
  manualHeaders.hidden = isSyncMode;
  syncOptions.hidden = !isSyncMode;
}

function updateCredentialSourceVisibility(credentialSource, sourceFields, syncHeadersInput) {
  const isRequestSource = credentialSource === CREDENTIAL_SOURCES.request;
  const isStorageSource = credentialSource === CREDENTIAL_SOURCES.storage;
  const isCookieSource = credentialSource === CREDENTIAL_SOURCES.cookie;

  sourceFields.storageArea.hidden = !isStorageSource;
  sourceFields.authorizationKey.hidden = isRequestSource;
  sourceFields.authorizationPrefix.hidden = isRequestSource;
  sourceFields.headersKey.hidden = !isStorageSource;
  sourceFields.cookieNames.hidden = !isCookieSource;

  if (syncHeadersInput) {
    syncHeadersInput.disabled = isCookieSource;
    syncHeadersInput.title = isCookieSource
      ? t("options.sync.cookieSourceHeaders.title")
      : t("options.sync.headersInput.title");

    if (isCookieSource && syncHeadersInput.checked) {
      syncHeadersInput.checked = false;
    }
  }
}

async function applyRules(savedRules) {
  const response = await chrome.runtime.sendMessage({
    type: "APPLY_RULES",
    rules: savedRules
  });

  if (!response?.ok) {
    throw new Error(response?.error || t("runtime.error.apply"));
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
    saveButtonLabel.textContent = t("options.actions.saving");
    updateSelectedRuleFromEditor();
    touchSelectedRule();
    const selectedRule = getSelectedRule();
    const persistedRules = await getRedirectRules();
    const savedRules = upsertRule(persistedRules, selectedRule);
    const appliedRules = await applyRules(savedRules);

    savedRuleIds = new Set(appliedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(appliedRules, { committedRuleIds: new Set([selectedRule.id]) });
    await saveRedirectRules(appliedRules);
    render();
    notify(t("options.toast.ruleSaved"), "success");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    isSavingRule = false;
    saveButton.disabled = false;
    saveButtonLabel.textContent = t("options.actions.saveRule");
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
      notify(t("options.toast.draftRemoved"));
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
    notify(t("options.toast.ruleRemoved"), "success");
  } catch (error) {
    notify(error.message, "error");
    removeButton.disabled = false;
  } finally {
    isRemovingRule = false;
  }
}

async function savePersistedRules(nextRules, committedRuleIds) {
  const persistedRules = await getRedirectRules();
  const nextRulesById = new Map(nextRules.map((rule) => [rule.id, rule]));
  const savedRules = persistedRules.map((rule) => (
    committedRuleIds.has(rule.id) && nextRulesById.has(rule.id)
      ? nextRulesById.get(rule.id)
      : rule
  ));
  const appliedRules = await applyRules(savedRules);

  savedRuleIds = new Set(appliedRules.map((rule) => rule.id));
  rules = mergePersistedRulesWithDrafts(appliedRules, {
    committedRuleIds
  });
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
    const committedRuleIds = new Set([...selectedRuleIds].filter((ruleId) => savedRuleIds.has(ruleId)));
    rules = rules.map((rule) => selectedRuleIds.has(rule.id)
      ? mutator({ ...rule, modifiedAt })
      : rule);

    if (committedRuleIds.size > 0) {
      await savePersistedRules(rules, committedRuleIds);
    }

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

  if (!window.confirm(t("options.dialog.removeSelected", {
    count: selectedCount,
    noun: selectedCount === 1 ? t("common.rule") : t("common.rules")
  }))) {
    return;
  }

  const previousRules = rules;
  const previousSavedRuleIds = new Set(savedRuleIds);
  const previousSelectedRuleIds = new Set(selectedRuleIds);
  const previousSelectedRuleId = selectedRuleId;

  try {
    const ruleIdsToRemove = new Set(selectedRuleIds);
    const persistedRules = await getRedirectRules();
    rules = rules.filter((rule) => !selectedRuleIds.has(rule.id));
    savedRuleIds = new Set(rules.filter((rule) => savedRuleIds.has(rule.id)).map((rule) => rule.id));
    selectedRuleIds = new Set();
    selectedRuleId = rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : "";
    const savedRules = persistedRules.filter((rule) => !ruleIdsToRemove.has(rule.id));
    const appliedRules = await applyRules(savedRules);

    savedRuleIds = new Set(appliedRules.map((rule) => rule.id));
    rules = mergePersistedRulesWithDrafts(appliedRules);
    await saveRedirectRules(appliedRules);
    render();
    notify(t("options.toast.selectedRemoved"), "success");
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
  notify(t("options.toast.duplicated", {
    count: duplicatedRules.length,
    noun: duplicatedRules.length === 1 ? t("common.rule") : t("common.rules")
  }));
}

function exportRules() {
  const rulesToExport = selectedRuleIds.size > 0 ? getSelectedRules() : getPersistedRulesFromMemory();

  if (rulesToExport.length === 0) {
    notify(t("options.toast.noExport"), "error");
    return;
  }

  if (hasExportableCredentials(rulesToExport) &&
    !window.confirm(t("options.dialog.exportSensitive"))) {
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
  notify(t("options.toast.exported", {
    count: rulesToExport.length,
    noun: rulesToExport.length === 1 ? t("common.rule") : t("common.rules")
  }), "success");
}

function hasExportableCredentials(rulesToExport = []) {
  return rulesToExport.some((rule) => Boolean(
    rule.authorization ||
    normalizeExportHeaders(rule.headers).length > 0 ||
    normalizeExportHeaders(rule.syncedHeaders).length > 0 ||
    rule.syncedAuthorization ||
    rule.syncedCookieHeader
  ));
}

function normalizeExportHeaders(headers = []) {
  return Array.isArray(headers)
    ? headers.filter((header) => header?.name || header?.value)
    : [];
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
      throw new Error(t("options.import.noValidRules"));
    }

    rules = [...draftRules, ...rules];
    selectedRuleIds = new Set(draftRules.map((rule) => rule.id));
    selectedRuleId = draftRules[0].id;
    render();
    notify(t("options.toast.imported", {
      count: draftRules.length,
      noun: draftRules.length === 1 ? t("common.rule") : t("common.rules")
    }), "success");
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
  notify(t("options.toast.ruleAdded"));
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
  await updateSelectedRules((rule) => ({ ...rule, enabled: true }), t("options.toast.selectedEnabled"));
});

bulkDisable.addEventListener("click", async () => {
  await updateSelectedRules((rule) => ({ ...rule, enabled: false }), t("options.toast.selectedDisabled"));
});

bulkMoveGroup.addEventListener("click", async () => {
  const group = bulkGroupName.value.trim();

  await updateSelectedRules((rule) => ({ ...rule, group }), t("options.toast.selectedMoved"));
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
  filterToggleLabel.textContent = t(isHidden ? "options.actions.hideFilters" : "options.actions.showFilters");
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
