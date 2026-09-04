import { LOAD_SDK_FRAGMENT_JS } from "./loader-fragment"

// Hand-written, unbundled, unminified ES5-safe vanilla JS -- served as-is at
// GET /v1/tracking/salla-app-snippet.js. Distinct from snippet.ts: a merchant never installs
// this themselves -- it's the ONE script URL registered once in the Salla Partners Portal
// (App -> Snippet), which Salla then injects app-wide into every merchant storefront where the
// Madar app is installed. Since Salla's injection carries no data-madar-site attribute (there is
// no per-merchant configuration in that Partners Portal field), this script has to work out its
// own site key at runtime by reading the store ID Salla's own Twilight JS SDK exposes
// (salla.config.get('store.id'), confirmed real/documented) and resolving it server-side via
// GET /v1/tracking/resolve/salla/:storeId.
export const SALLA_APP_SNIPPET_JS = `(function () {
  "use strict";
  var scriptEl = document.currentScript;
  var apiOrigin;
  try {
    apiOrigin = scriptEl ? new URL(scriptEl.src).origin : null;
  } catch (e) {
    apiOrigin = null;
  }
  if (!apiOrigin) return;

  ${LOAD_SDK_FRAGMENT_JS}

  // Salla's own snippet injection timing relative to the Twilight SDK's readiness isn't
  // documented precisely, so this polls briefly rather than assuming window.salla is already
  // configured on the first tick. Gives up silently after ~5s -- consistent with the rest of
  // this system's fail-open discipline; a storefront where salla.config never becomes available
  // just never starts tracking, it never breaks the page.
  var MAX_ATTEMPTS = 20;
  var RETRY_DELAY_MS = 250;
  var attempts = 0;

  function readStoreId() {
    try {
      if (window.salla && window.salla.config && typeof window.salla.config.get === "function") {
        return window.salla.config.get("store.id");
      }
    } catch (e) {}
    return null;
  }

  function resolveSiteKeyAndLoad(storeId) {
    fetch(apiOrigin + "/v1/tracking/resolve/salla/" + encodeURIComponent(storeId))
      .then(function (response) {
        if (!response.ok) throw new Error("resolve_failed");
        return response.json();
      })
      .then(function (data) {
        if (data && data.siteKey) {
          madarFetchConfigAndLoadSdk(apiOrigin, data.siteKey);
        }
      })
      .catch(function () {});
  }

  function tick() {
    var storeId = readStoreId();
    if (storeId) {
      resolveSiteKeyAndLoad(storeId);
      return;
    }

    attempts += 1;
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(tick, RETRY_DELAY_MS);
    }
  }

  tick();
})();
`
