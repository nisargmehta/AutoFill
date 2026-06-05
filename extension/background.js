const extensionApi = typeof browser !== "undefined" ? browser : chrome;
const usesPromiseApi = typeof browser !== "undefined";

function storageGet(key) {
  if (usesPromiseApi) {
    return extensionApi.storage.local.get(key);
  }

  return new Promise((resolve) => {
    extensionApi.storage.local.get(key, resolve);
  });
}

function storageSet(value) {
  if (usesPromiseApi) {
    return extensionApi.storage.local.set(value);
  }

  return new Promise((resolve) => {
    extensionApi.storage.local.set(value, resolve);
  });
}

extensionApi.runtime.onInstalled.addListener(async () => {
  const result = await storageGet("autofillVault");
  if (result.autofillVault) {
    return;
  }

  await storageSet({
    autofillVault: {
      schemaVersion: 1,
      entries: [],
      dismissedFieldFingerprints: [],
      updatedAt: new Date().toISOString()
    }
  });
});
