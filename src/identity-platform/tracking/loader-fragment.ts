// Shared ES5-safe JS fragment: given an apiOrigin and a resolved siteKey, fetches remote config
// and injects the versioned SDK script tag. Interpolated into both snippet.ts (the
// merchant-installed loader, which already knows its siteKey from its own <script> tag's
// data-madar-site attribute) and salla-app-snippet.ts (Salla's app-wide injected loader, which
// has to resolve its siteKey from a store ID first) -- one implementation, so the two loaders
// can't silently drift apart on how they talk to /v1/tracking/config and /v1/tracking/sdk-v*.js.
export const LOAD_SDK_FRAGMENT_JS = `
  var MADAR_DEFAULT_SDK_VERSION = "1.0.0";

  function madarLoadSdk(apiOrigin, siteKey, config) {
    try {
      window.__madarConfig = config || null;
    } catch (e) {}

    var sdkVersion = (config && config.sdk_version) || MADAR_DEFAULT_SDK_VERSION;
    var sdkScript = document.createElement("script");
    sdkScript.src = apiOrigin + "/v1/tracking/sdk-v" + sdkVersion + ".js";
    sdkScript.setAttribute("data-madar-site", siteKey);
    sdkScript.async = true;
    (document.head || document.documentElement).appendChild(sdkScript);
  }

  // Tracking must never block page rendering or break the merchant's site: a failed/slow config
  // fetch still falls through to loading the default SDK version with no remote overrides,
  // rather than tracking silently never starting at all.
  function madarFetchConfigAndLoadSdk(apiOrigin, siteKey) {
    try {
      fetch(apiOrigin + "/v1/tracking/config/" + encodeURIComponent(siteKey))
        .then(function (response) {
          if (!response.ok) throw new Error("config_fetch_failed");
          return response.json();
        })
        .then(function (config) {
          madarLoadSdk(apiOrigin, siteKey, config);
        })
        .catch(function () {
          madarLoadSdk(apiOrigin, siteKey, null);
        });
    } catch (e) {
      madarLoadSdk(apiOrigin, siteKey, null);
    }
  }
`
