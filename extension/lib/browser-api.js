(function () {
  const runtime = typeof browser !== "undefined" ? browser : chrome;

  function callbackToPromise(fn, context, args) {
    return new Promise((resolve, reject) => {
      fn.call(context, ...args, (result) => {
        const error = runtime.runtime && runtime.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(result);
      });
    });
  }

  function isPromiseLike(value) {
    return value && typeof value.then === "function";
  }

  function storageGet(keys) {
    const result = runtime.storage.local.get(keys);
    if (isPromiseLike(result)) {
      return result;
    }

    return callbackToPromise(runtime.storage.local.get, runtime.storage.local, [keys]);
  }

  function storageSet(value) {
    const result = runtime.storage.local.set(value);
    if (isPromiseLike(result)) {
      return result;
    }

    return callbackToPromise(runtime.storage.local.set, runtime.storage.local, [value]);
  }

  function storageRemove(keys) {
    const result = runtime.storage.local.remove(keys);
    if (isPromiseLike(result)) {
      return result;
    }

    return callbackToPromise(runtime.storage.local.remove, runtime.storage.local, [keys]);
  }

  function sendMessage(message) {
    const result = runtime.runtime.sendMessage(message);
    if (isPromiseLike(result)) {
      return result;
    }

    return callbackToPromise(runtime.runtime.sendMessage, runtime.runtime, [message]);
  }

  window.AutoFillBrowser = {
    runtime,
    storage: {
      get: storageGet,
      set: storageSet,
      remove: storageRemove
    },
    sendMessage
  };
})();
