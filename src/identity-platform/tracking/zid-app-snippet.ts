import { LOAD_SDK_FRAGMENT_JS } from "./loader-fragment"

// Hand-written, unbundled, unminified ES5-safe vanilla JS -- served as-is at
// GET /v1/tracking/zid-app-snippet.js. Distinct from snippet.ts: a merchant never installs this
// themselves -- it's the ONE script URL registered once in the Zid Partner Dashboard (App Scripts
// / Custom Snippets), which Zid then injects app-wide into every merchant storefront where the
// Madar app is installed.
//
// Resolves its own tenant two ways, in order:
//
//  1. The Zid store ID, which Zid's Custom Snippets expose to the installing partner as the
//     {{store.id}} snippet parameter. The registering snippet passes it through as either a
//     data-madar-zid-store attribute on this script tag or a window.__madarZid.storeId global
//     (two forms because the Partner Dashboard's snippet field validates its input, and which
//     shape it accepts is a property of that editor, not of this file). Matched server-side
//     against zid_oauth_connections.provider_account_id, which is populated for every connection
//     at OAuth connect time.
//
//  2. Failing that, the storefront's own hostname, matched against
//     zid_oauth_connections.store_domain (captured from Zid's real /managers/account/profile
//     `url` field during OAuth connect, see zid-oauth/service.ts).
//
// The store ID is tried first because it is strictly more reliable: store_domain arrived later
// (migration 044, nullable) so it is null on every older connection, and domain matching breaks
// on custom domains and www./bare/*.zid.store variants. The hostname path stays as a fallback for
// any store whose snippet can't pass the ID through.
//
// No polling anywhere here, unlike salla-app-snippet.ts: both the attribute and
// window.location.hostname are available immediately, with no SDK object that has to finish
// initializing first.
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

  // An unsubstituted "{{store.id}}" means Zid didn't expand the parameter in this snippet
  // location -- treat that as absent rather than resolving against a literal template string.
  function cleanStoreId(value) {
    if (typeof value !== "string") return null;
    if (value === "") return null;
    if (value.indexOf("{{") !== -1) return null;
    return value;
  }

  function readStoreId() {
    var fromAttribute = null;
    try {
      fromAttribute = scriptEl ? scriptEl.getAttribute("data-madar-zid-store") : null;
    } catch (e) {}
    var cleaned = cleanStoreId(fromAttribute);
    if (cleaned) return cleaned;

    try {
      if (window.__madarZid) return cleanStoreId(window.__madarZid.storeId);
    } catch (e) {}
    return null;
  }

  function resolveAndLoad(path, onFailure) {
    fetch(apiOrigin + path)
      .then(function (response) {
        if (!response.ok) throw new Error("resolve_failed");
        return response.json();
      })
      .then(function (data) {
        if (data && data.siteKey) {
          madarFetchConfigAndLoadSdk(apiOrigin, data.siteKey);
          return;
        }
        if (onFailure) onFailure();
      })
      .catch(function () {
        if (onFailure) onFailure();
      });
  }

  function resolveByHostname() {
    var hostname = window.location.hostname;
    if (!hostname) return;
    resolveAndLoad("/v1/tracking/resolve/zid/" + encodeURIComponent(hostname), null);
  }

  var storeId = readStoreId();
  if (storeId) {
    // A store ID that doesn't resolve (e.g. the merchant connected Zid to MADAR under a
    // different store) still falls through to the hostname lookup rather than giving up -- the
    // two identify the same tenant by independent means, so either succeeding is enough.
    resolveAndLoad("/v1/tracking/resolve/zid/store/" + encodeURIComponent(storeId), resolveByHostname);
    return;
  }

  resolveByHostname();
})();
`
