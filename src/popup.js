const DEFAULT_API_BASE_URL = "https://atlas-api.arktechnology.dev";
const ATLAS_LOGO_URL = "assets/logo.png";
const clientButton = document.querySelector("#client-button");
const clientIcon = document.querySelector("#client-icon");
const clientName = document.querySelector("#client-name");
const zapButton = document.querySelector("#zap-button");
const status = document.querySelector("#status");
const popupRoot = document.querySelector("main");

let settings = {};
let clients = [];
let pendingCapture = null;
let selectedClientIndex = 0;

function normalizeApiBaseUrl(value) {
  return String(value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function storageGet(keys) {
  return chrome.storage.sync.get(keys);
}

function storageSet(values) {
  return chrome.storage.sync.set(values);
}

function localStorageGet(keys) {
  return chrome.storage.local.get(keys);
}

function localStorageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function requestFreshCapture(tab = null) {
  tab ||= await getActiveTab();

  if (!tab?.id) {
    return null;
  }

  return chrome.tabs.sendMessage(tab.id, { type: "atlas:capture-selection" }).catch(() => null);
}

async function requestInjectedCapture(tab = null) {
  tab ||= await getActiveTab();

  if (!tab?.id) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const selectedText = cleanText(window.getSelection?.().toString());

        if (selectedText) {
          return {
            capture: {
              selectedText,
              pageTitle: document.title || "",
              url: location.href,
              capturedAt: new Date().toISOString(),
              selectionMethod: "injected-dom"
            },
            copied: false
          };
        }

        return {
          capture: null,
          copied: Boolean(document.execCommand?.("copy"))
        };
      }
    });

    return results.map((result) => result.result).find((result) => result?.capture || result?.copied) || null;
  } catch {
    return null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown ATLAS extension error.");
}

function logCaptureDebug(stage, details = {}) {
  const payload = {
    stage,
    at: new Date().toISOString(),
    ...details
  };

  console.log("[ATLAS] Capture debug", payload);
  chrome.storage.local.set({ lastCaptureDebug: payload }).catch(() => {});
  chrome.runtime.sendMessage({ type: "atlas:debug-log", payload }).catch(() => {});
}

function isProbablyPageMetadata(text, tab = null, capture = null) {
  const selectedText = cleanText(text).toLowerCase();
  const pageTitle = cleanText(capture?.pageTitle || tab?.title).toLowerCase();
  const pageUrl = cleanText(capture?.url || tab?.url).toLowerCase();

  return Boolean(selectedText && (selectedText === pageTitle || selectedText === pageUrl));
}

function isUsableCapture(capture, tab = null) {
  const selectedText = cleanText(capture?.selectedText);

  return Boolean(selectedText && !isProbablyPageMetadata(selectedText, tab, capture));
}

function captureFromClipboard(text, tab = null) {
  const selectedText = cleanText(text);

  if (!selectedText || isProbablyPageMetadata(selectedText, tab)) {
    return null;
  }

  return {
    ...(pendingCapture || {}),
    pageTitle: pendingCapture?.pageTitle || tab?.title || "",
    url: pendingCapture?.url || tab?.url || "",
    selectedText,
    capturedAt: new Date().toISOString(),
    selectionMethod: "extension-clipboard"
  };
}

async function readClipboardCapture(tab = null) {
  try {
    return captureFromClipboard(await navigator.clipboard.readText(), tab);
  } catch {
    return null;
  }
}

async function refreshPendingCapture() {
  const tab = await getActiveTab();
  let captureSource = "content-script";
  let response = await requestFreshCapture(tab);

  if (!response?.capture && !response?.copied) {
    captureSource = "injected";
    response = await requestInjectedCapture(tab);
  }

  logCaptureDebug("fresh-capture-response", {
    captureSource,
    copied: Boolean(response?.copied),
    responseText: response?.capture?.selectedText || "",
    responseMethod: response?.capture?.selectionMethod || "",
    tabTitle: tab?.title || "",
    tabUrl: tab?.url || ""
  });

  if (isUsableCapture(response?.capture, tab)) {
    pendingCapture = response.capture;
    return pendingCapture;
  }

  if (response?.copied) {
    const clipboardCapture = await readClipboardCapture(tab);

    if (clipboardCapture) {
      pendingCapture = clipboardCapture;
      logCaptureDebug("clipboard-after-copy", {
        selectedText: pendingCapture.selectedText,
        selectionMethod: pendingCapture.selectionMethod,
        pageTitle: pendingCapture.pageTitle,
        url: pendingCapture.url,
        capturedAt: pendingCapture.capturedAt
      });
      return pendingCapture;
    }

    logCaptureDebug("clipboard-after-copy-empty", {
      tabTitle: tab?.title || "",
      tabUrl: tab?.url || ""
    });
    pendingCapture = null;
    await localStorageRemove(["pendingCapture"]);
    return null;
  }

  const local = await localStorageGet(["pendingCapture"]);
  pendingCapture = local.pendingCapture || pendingCapture;

  if (isUsableCapture(pendingCapture, tab)) {
    return pendingCapture;
  }

  return pendingCapture;
}

async function rememberLastResult(result) {
  await storageSet({
    lastResult: {
      ...result,
      at: new Date().toISOString()
    }
  });
}

function clientInitials(client) {
  return String(client?.name || "Atlas")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("") || "A";
}

function normalizedClientId(client) {
  return client?.id || client?._id || client?.clientId || null;
}

function normalizeClient(client) {
  return {
    ...client,
    id: normalizedClientId(client)
  };
}

function selectedClient() {
  return clients[selectedClientIndex] || null;
}

function renderClient() {
  const client = selectedClient();
  clientName.textContent = client ? client.name : "No client";
  clientButton.title = client?.id ? `Client: ${client.name}` : "No client";
  clientIcon.style.background = client?.color || "#2f6fed";
  clientIcon.textContent = "";

  if (client?.logoData || !client?.id) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = client?.logoData || ATLAS_LOGO_URL;
    clientIcon.append(img);
  } else {
    clientIcon.textContent = clientInitials(client);
  }
}

async function loadClients() {
  if (!settings.authToken) {
    clientName.textContent = "Set token in options";
    return;
  }

  const response = await fetch(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/clients`, {
    headers: {
      "authorization": `Bearer ${settings.authToken}`
    }
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || `Unable to load clients: HTTP ${response.status}.`);
  }

  clients = [
    { id: null, name: "No client", color: "#111a24", logoData: ATLAS_LOGO_URL },
    ...(body.clients || [])
      .filter((client) => client.status !== "archived")
      .map(normalizeClient)
  ];
  selectedClientIndex = Math.max(0, clients.findIndex((client) => client.id === settings.selectedClientId));

  if (selectedClientIndex < 0) {
    selectedClientIndex = 0;
  }

  renderClient();
}

async function createTask() {
  if (!settings.authToken) {
    throw new Error("Set your ATLAS API token in extension options.");
  }

  await refreshPendingCapture();

  if (!isUsableCapture(pendingCapture)) {
    throw new Error(pendingCapture?.selectionError || "Select text on the page before creating an ATLAS task.");
  }

  const client = selectedClient();
  const clientId = normalizedClientId(client);
  const requestBody = {
    url: pendingCapture.url,
    pageTitle: pendingCapture.pageTitle,
    selectedText: pendingCapture.selectedText,
    clientId,
    clientName: client?.name || undefined
  };

  logCaptureDebug("create-task", {
    selectedText: requestBody.selectedText,
    selectionMethod: pendingCapture.selectionMethod,
    pageTitle: requestBody.pageTitle,
    url: requestBody.url,
    clientId: requestBody.clientId,
    clientName: requestBody.clientName || ""
  });

  const response = await fetch(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/browser/tasks`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${settings.authToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.task) {
    throw new Error(body.error || `ATLAS returned HTTP ${response.status}.`);
  }

  await rememberLastResult({
    ok: true,
    message: `Created ATLAS task: ${body.task.title || body.task.id}`,
    taskId: body.task.id,
    taskTitle: body.task.title,
    pageUrl: pendingCapture.url
  });
  await localStorageRemove(["pendingCapture"]);

  return body.task;
}

clientButton.addEventListener("click", async () => {
  if (clients.length === 0) {
    return;
  }

  selectedClientIndex = (selectedClientIndex + 1) % clients.length;
  await storageSet({ selectedClientId: clients[selectedClientIndex]?.id || null });
  renderClient();
});

zapButton.addEventListener("click", async () => {
  zapButton.disabled = true;
  popupRoot.classList.remove("is-success");
  zapButton.classList.remove("is-success");
  status.textContent = "";

  try {
    await createTask();
    popupRoot.classList.add("is-success");
    zapButton.classList.add("is-success");
    status.textContent = "Created";
    window.setTimeout(() => window.close(), 1200);
  } catch (error) {
    const message = errorMessage(error);
    popupRoot.classList.remove("is-success");
    zapButton.classList.remove("is-success");
    status.textContent = message;
    await rememberLastResult({ ok: false, message });
    zapButton.disabled = false;
  }
});

async function init() {
  await requestFreshCapture();
  const [stored, local] = await Promise.all([
    storageGet(["apiBaseUrl", "authToken", "selectedClientId"]),
    localStorageGet(["pendingCapture"])
  ]);
  settings = stored;
  pendingCapture = local.pendingCapture || null;
  status.textContent = "";
  await loadClients();
}

init().catch((error) => {
  status.textContent = errorMessage(error);
  zapButton.disabled = true;
});
