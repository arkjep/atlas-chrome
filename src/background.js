const DEFAULT_API_BASE_URL = "https://atlas-api.arktechnology.dev";

function normalizeApiBaseUrl(value) {
  return String(value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
}

function storageGet(keys) {
  return chrome.storage.sync.get(keys);
}

async function badge(tabId, text, color) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }, 2500);
}

async function selectedPageContext(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      selectedText: String(window.getSelection()?.toString() || "").trim(),
      pageTitle: document.title || ""
    })
  });

  return result?.result || { selectedText: "", pageTitle: "" };
}

async function createAtlasTask(tab) {
  if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error("Open an http or https page before creating an ATLAS task.");
  }

  const settings = await storageGet(["apiBaseUrl", "authToken"]);
  const authToken = String(settings.authToken || "").trim();

  if (!authToken) {
    await chrome.runtime.openOptionsPage();
    throw new Error("Set your ATLAS API token in extension options.");
  }

  const context = await selectedPageContext(tab.id);

  if (!context.selectedText) {
    throw new Error("Select text on the page before clicking the ATLAS extension.");
  }

  const response = await fetch(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/browser/tasks`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${authToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: tab.url,
      pageTitle: context.pageTitle,
      selectedText: context.selectedText,
      capturedAt: new Date().toISOString()
    })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.task) {
    throw new Error(body.error || `ATLAS returned HTTP ${response.status}.`);
  }

  return body.task;
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    await badge(tab.id, "...", "#2f6fed");
    await createAtlasTask(tab);
    await badge(tab.id, "OK", "#15803d");
  } catch (error) {
    console.error(error);
    await badge(tab.id, "ERR", "#b91c1c");
  }
});
