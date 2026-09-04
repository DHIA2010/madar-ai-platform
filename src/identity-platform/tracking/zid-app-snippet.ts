import { LOAD_SDK_FRAGMENT_JS } from "./loader-fragment"

// Hand-written, unbundled, unminified ES5-safe vanilla JS -- served as-is at
// GET /v1/tracking/zid-app-snippet.js. Distinct from snippet.ts: a merchant never installs this
// themselves -- it's the ONE script URL registered once in the Zid Partner Dashboard (App
// Scripts / Custom Snippets), which Zid then injects app-wide into every merchant storefront
// where the Madar app is installed. Since Zid has no confirmed client-side API exposing the
// current store's own ID (unlike Salla's documented salla.config.get('store.id')), this resolves
// itself via the storefront's own hostname instead -- matched server-side against
// zid_oauth_connections.store_domain (captured from Zid's real /managers/account/profile `url`
// field during OAuth connect, see zid-oauth/service.ts). No polling needed here, unlike
// salla-app-snippet.ts: window.location.hostname is available immediately, with no SDK object
// that needs to finish initializing first.
export const ZID_APP_SNIPPET_JS = `(function () {
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

  var hostname = window.location.hostname;
  if (!hostname) return;

  fetch(apiOrigin + "/v1/tracking/resolve/zid/" + encodeURIComponent(hostname))
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
})();
`
