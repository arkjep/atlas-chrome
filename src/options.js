const DEFAULT_API_BASE_URL = "https://atlas-api.arktechnology.dev";
const form = document.querySelector("#settings-form");
const apiBaseUrlInput = document.querySelector("#api-base-url");
const authTokenInput = document.querySelector("#auth-token");
const status = document.querySelector("#status");

function storageGet(keys) {
  return chrome.storage.sync.get(keys);
}

function storageSet(values) {
  return chrome.storage.sync.set(values);
}

async function loadSettings() {
  const settings = await storageGet(["apiBaseUrl", "authToken"]);
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_API_BASE_URL;
  authTokenInput.value = settings.authToken || "";
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
