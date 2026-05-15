import { STORAGE_KEYS } from "./storage.js";

const RELEASES_API_URL = "https://api.github.com/repos/aryajava/altreurl/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/aryajava/altreurl/releases";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function checkForUpdates(options = {}) {
  const currentVersion = chrome.runtime.getManifest().version;
  const cachedUpdate = await getCachedUpdateCheck();

  if (!options.force && cachedUpdate && Date.now() - Date.parse(cachedUpdate.checkedAt || "") < CACHE_TTL_MS) {
    return { ...cachedUpdate, currentVersion };
  }

  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    });

    if (response.status === 404) {
      return saveUpdateCheck({
        status: "unavailable",
        currentVersion,
        latestVersion: "",
        releaseUrl: RELEASES_PAGE_URL,
        message: "Belum ada GitHub release untuk dicek.",
        checkedAt: new Date().toISOString()
      });
    }

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}.`);
    }

    const release = await response.json();
    const latestVersion = normalizeVersion(release.tag_name || release.name || "");
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return saveUpdateCheck({
      status: hasUpdate ? "available" : "current",
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url || RELEASES_PAGE_URL,
      message: hasUpdate
        ? `Update tersedia: ${latestVersion}`
        : `Versi ${currentVersion} sudah terbaru.`,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return saveUpdateCheck({
      status: "error",
      currentVersion,
      latestVersion: cachedUpdate?.latestVersion || "",
      releaseUrl: cachedUpdate?.releaseUrl || RELEASES_PAGE_URL,
      message: `Gagal cek update: ${error.message}`,
      checkedAt: new Date().toISOString()
    });
  }
}

export function renderUpdateStatus(container, updateStatus) {
  if (!container || !updateStatus) {
    return;
  }

  container.hidden = false;
  container.dataset.status = updateStatus.status;
  container.replaceChildren();

  const message = document.createElement("span");
  message.textContent = updateStatus.message || "Update status tidak tersedia.";
  container.append(message);

  if (updateStatus.releaseUrl && ["available", "unavailable", "error"].includes(updateStatus.status)) {
    const link = document.createElement("a");
    link.href = updateStatus.releaseUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = updateStatus.status === "available" ? "Open release" : "GitHub releases";
    container.append(link);
  }
}

async function getCachedUpdateCheck() {
  const result = await chrome.storage.local.get({ [STORAGE_KEYS.updateCheck]: null });
  return result[STORAGE_KEYS.updateCheck];
}

async function saveUpdateCheck(updateCheck) {
  await chrome.storage.local.set({ [STORAGE_KEYS.updateCheck]: updateCheck });
  return updateCheck;
}

function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "");
}

function compareVersions(leftVersion, rightVersion) {
  const leftParts = normalizeVersion(leftVersion).split(/[.-]/).map(toVersionPart);
  const rightParts = normalizeVersion(rightVersion).split(/[.-]/).map(toVersionPart);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function toVersionPart(part) {
  const numberPart = Number.parseInt(part, 10);
  return Number.isNaN(numberPart) ? 0 : numberPart;
}
