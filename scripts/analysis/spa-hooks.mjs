/** Injected before navigation — tracks SPA routing without full page loads. */
export const SPA_HOOKS_INIT = `
(() => {
  if (window.__sitescopeHooks) return;
  window.__sitescopeHooks = true;
  window.__sitescopeNavLog = [];
  window.__sitescopeNetworkDelta = [];

  const logNav = (type, detail) => {
    window.__sitescopeNavLog.push({
      type,
      url: location.href,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      at: Date.now(),
      detail: detail || null,
    });
  };

  const wrap = (name) => {
    const orig = history[name];
    if (!orig) return;
    history[name] = function (...args) {
      const ret = orig.apply(this, args);
      logNav(name, args[2] || null);
      return ret;
    };
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", () => logNav("popstate"));
  window.addEventListener("hashchange", () => logNav("hashchange"));

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      window.__sitescopeNetworkDelta.push({
        kind: "fetch",
        url: String(args[0]),
        at: Date.now(),
      });
      return origFetch.apply(this, args);
    };
  }
})();
`;

export async function installSpaHooks(page) {
  await page.addInitScript(SPA_HOOKS_INIT);
}

export async function readNavLog(page) {
  return page.evaluate(() => {
    const log = window.__sitescopeNavLog || [];
    window.__sitescopeNavLog = [];
    return log;
  });
}

export async function readNetworkDelta(page) {
  return page.evaluate(() => {
    const log = window.__sitescopeNetworkDelta || [];
    window.__sitescopeNetworkDelta = [];
    return log;
  });
}

export async function clearSpaLogs(page) {
  return page.evaluate(() => {
    window.__sitescopeNavLog = [];
    window.__sitescopeNetworkDelta = [];
  });
}
