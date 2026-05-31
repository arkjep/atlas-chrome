const DEFAULT_API_BASE_URL = "https://atlas-api.arktechnology.dev";
const ATLAS_LOGO_URL = "assets/logo.png";
const clientButton = document.querySelector("#client-button");
const clientIcon = document.querySelector("#client-icon");
const clientName = document.querySelector("#client-name");
const zapButton = document.querySelector("#zap-button");
const status = document.querySelector("#status");

let settings = {};
let clients = [];
let pendingCapture = null;
let selectedClientIndex = 0;

function normalizeApiBaseUrl(value) {
  return String(value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
}

function storageGet(keys) {
  return chrome.storage.sync.get(keys);
}

function storageSet(values) {
  return chrome.storage.sync.set(values);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown ATLAS extension error.");
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

function renderClient() {
  const client = clients[selectedClientIndex] || null;
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

  clients = [{ id: null, name: "No client", color: "#111a24", logoData: ATLAS_LOGO_URL }, ...(body.clients || []).filter((client) => client.status !== "archived")];
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

  if (!pendingCapture?.selectedText) {
    throw new Error(pendingCapture?.selectionError || "Select text on the page before creating an ATLAS task.");
  }

  const client = clients[selectedClientIndex] || null;
  const response = await fetch(`${normalizeApiBaseUrl(settings.apiBaseUrl)}/browser/tasks`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${settings.authToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: pendingCapture.url,
      pageTitle: pendingCapture.pageTitle,
      selectedText: pendingCapture.selectedText,
      clientId: client?.id || undefined,
      capturedAt: pendingCapture.capturedAt || new Date().toISOString()
    })
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
  status.textContent = "Creating task...";

  try {
    const task = await createTask();
    status.textContent = `Created: ${task.title || task.id}`;
    window.setTimeout(() => window.close(), 900);
  } catch (error) {
    const message = errorMessage(error);
    status.textContent = message;
    await rememberLastResult({ ok: false, message });
    zapButton.disabled = false;
  }
});

async function init() {
  const stored = await storageGet(["apiBaseUrl", "authToken", "selectedClientId", "pendingCapture"]);
  settings = stored;
  pendingCapture = stored.pendingCapture || null;
  status.textContent = settings.authToken ? "" : "Set token in options.";
  if (pendingCapture?.selectionError) {
    status.textContent = pendingCapture.selectionError;
  }
  await loadClients();
}

init().catch((error) => {
  status.textContent = errorMessage(error);
  zapButton.disabled = true;
});
