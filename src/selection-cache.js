const CAPTURE_MAX_AGE_MS = 2 * 60 * 1000;
const CLIPBOARD_COPY_TIMEOUT_MS = 400;

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

function extensionStorageLocal() {
  try {
    return chrome?.storage?.local || null;
  } catch {
    return null;
  }
}

function safeLocalSet(values) {
  try {
    extensionStorageLocal()?.set(values)?.catch(() => {});
  } catch {
    // Existing pages can retain stale content scripts after the extension reloads.
  }
}

function safeLocalGet(keys) {
  try {
    return extensionStorageLocal()?.get(keys) || Promise.resolve({});
  } catch {
    return Promise.resolve({});
  }
}

function safeLocalRemove(keys) {
  try {
    extensionStorageLocal()?.remove(keys)?.catch(() => {});
  } catch {
    // Existing pages can retain stale content scripts after the extension reloads.
  }
}

function storeCapture(input) {
  const selectedText = cleanText(input.selectedText);

  if (!selectedText) {
    return null;
  }

  const capture = {
    selectedText,
    pageTitle: input.pageTitle || topTitle(),
    url: input.url || topUrl(),
    capturedAt: new Date().toISOString(),
    selectionMethod: input.selectionMethod
  };

  safeLocalSet({ pendingCapture: capture });
  return capture;
}

function captureDomSelection() {
  const selectedText = cleanText(window.getSelection()?.toString());

  if (!selectedText) {
    return null;
  }

  return storeCapture({
    selectedText,
    selectionMethod: "dom"
  });
}

async function readClipboardText() {
  return cleanText(await navigator.clipboard.readText().catch(() => ""));
}

async function waitForClipboardChange(previousText) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CLIPBOARD_COPY_TIMEOUT_MS) {
    const selectedText = await readClipboardText();

    if (selectedText && selectedText !== previousText) {
      return selectedText;
    }

    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  return "";
}

async function captureCopySelection() {
  const domCapture = captureDomSelection();

  if (domCapture) {
    return { capture: domCapture, copied: false, clipboardChanged: false };
  }

  let copyEventText = "";
  const captureCopyEventText = (event) => {
    copyEventText = cleanText(event.clipboardData?.getData("text/plain"));
  };

  try {
    const previousClipboardText = await readClipboardText();
    document.addEventListener("copy", captureCopyEventText, false);
    window.addEventListener("copy", captureCopyEventText, false);
    const copied = document.execCommand("copy");
    document.removeEventListener("copy", captureCopyEventText, false);
    window.removeEventListener("copy", captureCopyEventText, false);

    if (!copied) {
      return { capture: null, copied: false, clipboardChanged: false };
    }

    if (copyEventText) {
      return {
        capture: storeCapture({
          selectedText: copyEventText,
          selectionMethod: "copy-event"
        }),
        copied: true,
        clipboardChanged: true
      };
    }

    const selectedText = await waitForClipboardChange(previousClipboardText);

    if (!selectedText) {
      return { capture: null, copied: true, clipboardChanged: false };
    }

    return {
      capture: storeCapture({
        selectedText,
        selectionMethod: "clipboard"
      }),
      copied: true,
      clipboardChanged: true
    };
  } catch {
    document.removeEventListener("copy", captureCopyEventText, false);
    window.removeEventListener("copy", captureCopyEventText, false);
    return { capture: null, copied: false, clipboardChanged: false };
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

try {
  chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "atlas:capture-selection") {
      return false;
    }

    captureCopySelection()
      .then((result) => {
        const capture = result?.capture || null;
        sendResponse({
          ok: Boolean(capture),
          capture,
          copied: Boolean(result?.copied),
          clipboardChanged: Boolean(result?.clipboardChanged)
        });
      })
      .catch(() => sendResponse({ ok: false, capture: null }));
    return true;
  });
} catch {
  // Existing pages can retain stale content scripts after the extension reloads.
}

safeLocalGet(["pendingCapture"]).then((stored) => {
  const capturedAt = stored.pendingCapture?.capturedAt ? Date.parse(stored.pendingCapture.capturedAt) : 0;

  if (capturedAt && Date.now() - capturedAt > CAPTURE_MAX_AGE_MS) {
    safeLocalRemove(["pendingCapture"]);
  }
}).catch(() => {});
