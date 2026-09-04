import { LOAD_SDK_FRAGMENT_JS } from "./loader-fragment"

// Hand-written, unbundled, unminified ES5-safe vanilla JS -- this deployable runs via `tsx`
// directly with no build step, and the file is served as-is at GET /v1/tracking/snippet.js.
//
// This is the ONLY file a merchant ever installs (<script data-madar-site="mtk_...">). It stays
// deliberately thin and rarely changes: fetch remote config, then load the actual versioned SDK
// (tracking/sdk.ts) it names. New tracking capabilities ship by adding a new SDK version and/or
// changing an organization's tracking_config -- never by asking the merchant to touch this tag
// again.
export const TRACKING_SNIPPET_JS = `(function () {
  "use strict";
  var scriptEl = document.currentScript;
  if (!scriptEl) return;
  var siteKey = scriptEl.getAttribute("data-madar-site");
  if (!siteKey) return;

  var apiOrigin;
  try {
    apiOrigin = new URL(scriptEl.src).origin;
  } catch (e) {
    return;
  }

  ${LOAD_SDK_FRAGMENT_JS}

  madarFetchConfigAndLoadSdk(apiOrigin, siteKey);
})();
`
