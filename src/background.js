async function openTaskPopup() {
  if (chrome.action.openPopup) {
    try {
      await chrome.action.openPopup();
      return;
    } catch (error) {
      console.warn("Unable to open native action popup, falling back to popup window.", error);
    }
  }

  await chrome.windows.create({
    focused: true,
    height: 170,
    type: "popup",
    url: chrome.runtime.getURL("popup.html"),
    width: 150
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await openTaskPopup();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "atlas:debug-log") {
    return false;
  }

  console.log("[ATLAS] Capture debug", message.payload);
  return false;
});
