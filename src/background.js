function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown ATLAS extension error.");
}

function storageSet(values) {
  return chrome.storage.sync.set(values);
}

async function selectedPageContext(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const pageTitle = document.title || "";
      const selectedText = String(window.getSelection()?.toString() || "").trim();

      if (selectedText) {
        return { selectedText, pageTitle, selectionMethod: "dom" };
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

async function captureActiveTab(tab) {
  if (!tab.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error("Open an http or https page before creating an ATLAS task.");
  }

  const context = await selectedPageContext(tab.id);

  if (!context.selectedText) {
    throw new Error(context.selectionError || "Select text on the page before creating an ATLAS task.");
  }

  await storageSet({
    pendingCapture: {
      ...context,
      url: tab.url,
      capturedAt: new Date().toISOString()
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await captureActiveTab(tab);
  } catch (error) {
    await storageSet({
      pendingCapture: {
        selectedText: "",
        pageTitle: tab.title || "",
        url: tab.url || "",
        capturedAt: new Date().toISOString(),
        selectionError: errorMessage(error)
      }
    });
  }

  await chrome.action.openPopup();
});
