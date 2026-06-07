const extensionApi = typeof browser !== "undefined" ? browser : chrome;
const usesPromiseApi = typeof browser !== "undefined";
const MENU_ROOT_ID = "easyfill-root";
const MENU_FILL_ALL_ID = "easyfill-fill-all";
const MENU_RECENT_PREFIX = "easyfill-recent:";
const COMMAND_STORAGE_KEY = "easyfillCommand";
const RECENT_LIMIT = 5;

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

function callbackToPromise(fn, context, args) {
  if (usesPromiseApi) {
    return fn.call(context, ...args);
  }

  return new Promise((resolve) => {
    fn.call(context, ...args, resolve);
  });
}

function contextMenusRemoveAll() {
  if (!extensionApi.contextMenus) {
    return Promise.resolve();
  }

  return callbackToPromise(extensionApi.contextMenus.removeAll, extensionApi.contextMenus, []);
}

function contextMenusCreate(options) {
  if (!extensionApi.contextMenus) {
    return Promise.resolve();
  }

  if (usesPromiseApi) {
    return extensionApi.contextMenus.create(options);
  }

  return new Promise((resolve) => {
    extensionApi.contextMenus.create(options, resolve);
  });
}

async function ensureVault() {
  const result = await storageGet("autofillVault");
  if (result.autofillVault) {
    return result.autofillVault;
  }

  const vault = {
    schemaVersion: 1,
    entries: [],
    dismissedFieldFingerprints: [],
    updatedAt: new Date().toISOString()
  };

  await storageSet({
    autofillVault: vault
  });

  return vault;
}

function recentEntries(vault) {
  return (vault.entries || [])
    .filter((entry) => entry && entry.id && entry.label && entry.value)
    .slice()
    .sort((a, b) => {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    })
    .slice(0, RECENT_LIMIT);
}

function truncateTitle(value) {
  const text = String(value || "");
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
}

async function rebuildContextMenus() {
  if (!extensionApi.contextMenus) {
    return;
  }

  const vault = await ensureVault();
  const entries = recentEntries(vault);

  await contextMenusRemoveAll();
  await contextMenusCreate({
    id: MENU_ROOT_ID,
    title: "EasyFill",
    contexts: ["editable", "page"]
  });
  await contextMenusCreate({
    id: MENU_FILL_ALL_ID,
    parentId: MENU_ROOT_ID,
    title: "Autofill available fields",
    contexts: ["editable", "page"]
  });

  if (entries.length) {
    await contextMenusCreate({
      id: "easyfill-separator",
      parentId: MENU_ROOT_ID,
      type: "separator",
      contexts: ["editable", "page"]
    });
  }

  await Promise.all(entries.map((entry) => {
    return contextMenusCreate({
      id: `${MENU_RECENT_PREFIX}${entry.id}`,
      parentId: MENU_ROOT_ID,
      title: `${entry.label}: ${truncateTitle(entry.value)}`,
      contexts: ["editable"]
    });
  }));
}

function sendTabMessage(tabId, message, options) {
  if (!tabId || !extensionApi.tabs) {
    return Promise.resolve();
  }

  if (usesPromiseApi) {
    return extensionApi.tabs.sendMessage(tabId, message, options).catch(() => {});
  }

  return new Promise((resolve) => {
    extensionApi.tabs.sendMessage(tabId, message, options || {}, resolve);
  });
}

async function dispatchCommand(command) {
  await storageSet({
    [COMMAND_STORAGE_KEY]: {
      ...command,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString()
    }
  });
}

function targetUrlFromContext(info) {
  return info.frameUrl || info.pageUrl || "";
}

function shouldUseStorageFallback(command, response) {
  if (!response || response.skipped) {
    return true;
  }

  return command.type === "easyfill:fill-entry" && response.filled === 0;
}

extensionApi.runtime.onInstalled.addListener(async () => {
  await ensureVault();
  await rebuildContextMenus();
});

if (extensionApi.runtime.onStartup) {
  extensionApi.runtime.onStartup.addListener(rebuildContextMenus);
}

if (extensionApi.storage && extensionApi.storage.onChanged) {
  extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.autofillVault) {
      rebuildContextMenus();
    }
  });
}

if (extensionApi.contextMenus) {
  extensionApi.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id) {
      return;
    }

    const frameOptions = typeof info.frameId === "number" ? { frameId: info.frameId } : undefined;
    const targetUrl = targetUrlFromContext(info) || tab.url || "";

    if (info.menuItemId === MENU_FILL_ALL_ID) {
      const command = { type: "easyfill:fill-all", targetUrl };
      const response = await sendTabMessage(tab.id, command, frameOptions);
      if (shouldUseStorageFallback(command, response)) {
        await dispatchCommand(command);
      }
      return;
    }

    if (String(info.menuItemId).startsWith(MENU_RECENT_PREFIX)) {
      const entryId = String(info.menuItemId).slice(MENU_RECENT_PREFIX.length);
      const command = {
        type: "easyfill:fill-entry",
        entryId,
        targetUrl
      };
      const response = await sendTabMessage(tab.id, command, frameOptions);
      if (shouldUseStorageFallback(command, response)) {
        await dispatchCommand(command);
      }
    }
  });
}

ensureVault().then(rebuildContextMenus);
