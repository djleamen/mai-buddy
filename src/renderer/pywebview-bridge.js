/*
 * pywebview ↔ renderer bridge.
 *
 * Installs a `window.ipcRenderer` shim that mirrors the contextBridge surface
 * exposed by the Electron preload script, but routes calls to
 * `window.pywebview.api.invoke(channel, args)`.
 *
 * Intentionally a no-op when Electron's preload bridge is already present, so
 * this file is safe to load in either runtime.
 */
(function () {
  'use strict';

  if (window.ipcRenderer && typeof window.ipcRenderer.invoke === 'function') {
    return; // Electron path already provided the bridge.
  }

  // Queue invocations until pywebview's JS API is injected.
  const pending = [];
  let ready = false;

  function flush() {
    ready = true;
    while (pending.length) {
      const job = pending.shift();
      callApi(job.channel, job.args).then(job.resolve, job.reject);
    }
  }

  function whenReady() {
    if (ready) return Promise.resolve();
    if (window.pywebview && window.pywebview.api && window.pywebview.api.invoke) {
      flush();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const onReady = () => { flush(); resolve(); };
      window.addEventListener('pywebviewready', onReady, { once: true });
      // Defensive poll in case the event already fired before this listener.
      const poll = setInterval(() => {
        if (window.pywebview && window.pywebview.api && window.pywebview.api.invoke) {
          clearInterval(poll);
          window.removeEventListener('pywebviewready', onReady);
          flush();
          resolve();
        }
      }, 50);
    });
  }

  function callApi(channel, args) {
    return window.pywebview.api.invoke(channel, args).then((res) => {
      // pywebview serialises return values as JSON strings sometimes; tolerate both.
      if (typeof res === 'string') {
        try { return JSON.parse(res); } catch (_) { return res; }
      }
      return res;
    });
  }

  const listeners = {};

  window.ipcRenderer = {
    invoke(channel, ...args) {
      if (ready) return callApi(channel, args);
      return new Promise((resolve, reject) => {
        pending.push({ channel, args, resolve, reject });
        whenReady().catch(reject);
      });
    },
    on(channel, listener) {
      (listeners[channel] = listeners[channel] || []).push(listener);
    },
    send(channel, ...args) {
      // Fire-and-forget; reuse invoke.
      this.invoke(channel, ...args).catch(() => {});
    }
  };

  // Allow the Python side to push events into the renderer.
  window.__maibuddyEmit = function (channel, payload) {
    const subs = listeners[channel] || [];
    for (const fn of subs) {
      try { fn({}, payload); } catch (e) { console.error(e); }
    }
  };

  // Eagerly start waiting so the queue drains as soon as possible.
  whenReady();
})();
