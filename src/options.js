const DEFAULT_API_BASE_URL = "https://atlas-api.arktechnology.dev";
const form = document.querySelector("#settings-form");
const apiBaseUrlInput = document.querySelector("#api-base-url");
const authTokenInput = document.querySelector("#auth-token");
const status = document.querySelector("#status");
const lastResult = document.querySelector("#last-result");
const lastResultStatus = document.querySelector("#last-result-status");
const lastResultTime = document.querySelector("#last-result-time");
const lastResultMessage = document.querySelector("#last-result-message");
const lastResultPage = document.querySelector("#last-result-page");

function storageGet(keys) {
  return chrome.storage.sync.get(keys);
}

function storageSet(values) {
  return chrome.storage.sync.set(values);
}

async function loadSettings() {
  const settings = await storageGet(["apiBaseUrl", "authToken", "lastResult"]);
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_API_BASE_URL;
  authTokenInput.value = settings.authToken || "";

  if (settings.lastResult) {
    lastResult.hidden = false;
    lastResultStatus.textContent = settings.lastResult.ok ? "OK" : "Error";
    lastResultTime.textContent = settings.lastResult.at || "";
    lastResultMessage.textContent = settings.lastResult.message || "";
    lastResultPage.textContent = settings.lastResult.pageUrl || "";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await storageSet({
    apiBaseUrl: apiBaseUrlInput.value.trim().replace(/\/+$/, "") || DEFAULT_API_BASE_URL,
    authToken: authTokenInput.value.trim()
  });

  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

loadSettings().catch((error) => {
  status.textContent = error instanceof Error ? error.message : "Unable to load settings.";
});
