const CAPTURE_MAX_AGE_MS = 2 * 60 * 1000;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function topUrl() {
  try {
    return window.top?.location?.href || window.location.href;
  } catch {
    return window.location.href;
  }
}

function topTitle() {
  try {
    return window.top?.document?.title || document.title || "";
  } catch {
    return document.title || "";
  }
}

function storeCapture(input) {
  if (!input.selectedText) {
    return;
  }

  chrome.storage.local.set({
    pendingCapture: {
      selectedText: input.selectedText,
      pageTitle: input.pageTitle || topTitle(),
      url: input.url || topUrl(),
      capturedAt: new Date().toISOString(),
      selectionMethod: input.selectionMethod
    }
  }).catch(() => {});
}

function captureDomSelection() {
  const selectedText = cleanText(window.getSelection()?.toString());

  if (!selectedText) {
    return false;
  }

  storeCapture({
    selectedText,
    selectionMethod: "dom"
  });
  return true;
}

async function captureCopySelection() {
  if (captureDomSelection()) {
    return true;
  }

  try {
    const copied = document.execCommand("copy");

    if (!copied) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 40));
    const selectedText = cleanText(await navigator.clipboard.readText());

    if (!selectedText) {
      return false;
    }

    storeCapture({
      selectedText,
      selectionMethod: "clipboard"
    });
    return true;
  } catch {
    return false;
  }
}

let selectionTimer = 0;

function scheduleDomCapture() {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(captureDomSelection, 60);
}

document.addEventListener("selectionchange", scheduleDomCapture, true);
document.addEventListener("mouseup", scheduleDomCapture, true);
document.addEventListener("keyup", scheduleDomCapture, true);

window.addEventListener("blur", () => {
  void captureCopySelection();
}, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "atlas:capture-selection") {
    return false;
  }

  captureCopySelection()
    .then((ok) => sendResponse({ ok }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.storage.local.get(["pendingCapture"]).then((stored) => {
  const capturedAt = stored.pendingCapture?.capturedAt ? Date.parse(stored.pendingCapture.capturedAt) : 0;

  if (capturedAt && Date.now() - capturedAt > CAPTURE_MAX_AGE_MS) {
    chrome.storage.local.remove(["pendingCapture"]).catch(() => {});
  }
}).catch(() => {});
