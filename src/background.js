const DEFAULT_API_BASE_URL = "https://atlas-api.arktechnology.dev";

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
    func: async () => {
      const pageTitle = document.title || "";
      const selectedText = String(window.getSelection()?.toString() || "").trim();

      if (selectedText) {
        return {
          selectedText,
          pageTitle,
          selectionMethod: "dom"
        };
      }

      try {
        const copied = document.execCommand("copy");

        if (!copied) {
          return {
            selectedText: "",
            pageTitle,
            selectionMethod: "clipboard",
            selectionError: "The page did not expose a copyable selection."
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 80));

        return {
          selectedText: String(await navigator.clipboard.readText()).trim(),
          pageTitle,
          selectionMethod: "clipboard"
        };
      } catch (error) {
        return {
          selectedText: "",
          pageTitle,
          selectionMethod: "clipboard",
          selectionError: error instanceof Error ? error.message : String(error || "Unable to read copied selection.")
        };
      }
    }
  });

  return result?.result || { selectedText: "", pageTitle: "" };
}

async function createAtlasTask(tab) {
  if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error("Open an http or https page before creating an ATLAS task.");
  }

  const settings = await storageGet(["apiBaseUrl", "authToken"]);
  const authToken = String(settings.authToken || "").trim();
  const apiBaseUrl = normalizeApiBaseUrl(settings.apiBaseUrl);

  if (!authToken) {
    await chrome.runtime.openOptionsPage();
    throw new Error("Set your ATLAS API token in extension options.");
  }

  const context = await selectedPageContext(tab.id);

  if (!context.selectedText) {
    if (context.selectionError) {
      throw new Error(`Select text on the page before clicking the ATLAS extension. ${context.selectionError}`);
    }

    throw new Error("Select text on the page before clicking the ATLAS extension.");
  }

  let response;

  try {
    response = await fetch(`${apiBaseUrl}/browser/tasks`, {
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
  } catch (error) {
    throw new Error(`Could not reach ATLAS at ${apiBaseUrl}. ${errorMessage(error)}`);
  }

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
    const task = await createAtlasTask(tab);
    await chrome.action.setTitle({ tabId: tab.id, title: `Created ATLAS task: ${task.title || task.id}` });
    await rememberLastResult({
      ok: true,
      message: `Created ATLAS task: ${task.title || task.id}`,
      taskId: task.id,
      taskTitle: task.title,
      pageUrl: tab.url
    });
    await badge(tab.id, "OK", "#15803d");
  } catch (error) {
    const message = errorMessage(error);
    console.error("ATLAS task creation failed:", error);
    await chrome.action.setTitle({ tabId: tab.id, title: `ATLAS error: ${message}` });
    await rememberLastResult({
      ok: false,
      message,
      pageUrl: tab.url
    });
    await badge(tab.id, "ERR", "#b91c1c");
    await chrome.runtime.openOptionsPage();
  }
});
