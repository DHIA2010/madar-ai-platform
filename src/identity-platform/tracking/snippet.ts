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

  var DEFAULT_SDK_VERSION = "1.0.0";

  function loadSdk(config) {
    try {
      window.__madarConfig = config || null;
    } catch (e) {}

    var sdkVersion = (config && config.sdk_version) || DEFAULT_SDK_VERSION;
    var sdkScript = document.createElement("script");
    sdkScript.src = apiOrigin + "/v1/tracking/sdk-v" + sdkVersion + ".js";
    sdkScript.setAttribute("data-madar-site", siteKey);
    sdkScript.async = true;
    (document.head || document.documentElement).appendChild(sdkScript);
  }

  // Tracking must never block page rendering or break the merchant's site: a failed/slow config
  // fetch still falls through to loading the default SDK version with no remote overrides,
  // rather than tracking silently never starting at all.
  try {
    fetch(apiOrigin + "/v1/tracking/config/" + encodeURIComponent(siteKey))
      .then(function (response) {
        if (!response.ok) throw new Error("config_fetch_failed");
        return response.json();
      })
      .then(loadSdk)
      .catch(function () {
        loadSdk(null);
      });
  } catch (e) {
    loadSdk(null);
  }
})();
`
