/**
 * Runs before the page's own scripts on every load: if a service worker controls the page, unregisters it, drops its
 * caches and reloads the same address. The managed Chromium is shared, and a `vite preview` that once ran on a port
 * leaves the production build's worker there; a dev server later on that port then serves that cached production build
 * (no echo engine, no dev flags) and every check fails against the wrong app. The dev server registers no worker itself,
 * so the reload is never controlled again.
 */
export const dropServiceWorker = `if (navigator.serviceWorker?.controller) {
  const href = location.href;
  navigator.serviceWorker.getRegistrations()
    .then((all) => Promise.all(all.map((registration) => registration.unregister())))
    .then(() => caches.keys()).then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .then(() => location.replace(href));
}`;

/**
 * Opens a browser check's tab on the hidden managed Chromium (never the person's own browser), signed out. A session a test account left on the same
 * origin (`dev/test-account.mjs`) would otherwise load that account's workspace instead of `?fresh`'s, or fail with
 * HTTP 409 once the account is deleted. The caller owns the tab and closes it.
 */
export async function openCheckTab(browser, name, viewport = { width: 1440, height: 900 }) {
  const tab = await browser.open({ name: `${name}-${Date.now()}`, url: "about:blank", app: "chromium", viewport });
  await tab.addInitScript(dropServiceWorker);
  await tab.addInitScript(`localStorage.removeItem("atlaswork.auth");`);
  return tab;
}
