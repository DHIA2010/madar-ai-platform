// Hand-written, unbundled, unminified vanilla JS -- this deployable runs via `tsx` directly with
// no build step, and the file is served as-is at GET /v1/tracking/snippet.js. Keep it plain
// ES5-safe JS a merchant's theme can execute unmodified in any browser.
//
// Mirrors src/identity-platform/tracking/platform-macros.ts's param names -- if that file's
// CLICK_ID_PARAM_BY_PLATFORM/ENTITY_ID_PARAMS ever change, update the two lists below to match.
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

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, maxAgeSeconds) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      name + "=" + encodeURIComponent(value) +
      "; Max-Age=" + maxAgeSeconds +
      "; Path=/; SameSite=Lax" + secure;
  }

  var visitorId = getCookie("madar_snip_visitor") || randomId();
  setCookie("madar_snip_visitor", visitorId, 31536000);

  var sessionId = getCookie("madar_snip_session") || randomId();
  setCookie("madar_snip_session", sessionId, 1800);

  var CLICK_ID_PARAMS = [
    { param: "gclid", platform: "google_ads" },
    { param: "fbclid", platform: "meta_ads" },
    { param: "ttclid", platform: "tiktok_ads" },
    { param: "ScCid", platform: "snapchat_ads" }
  ];
  var ENTITY_ID_PARAMS = {
    campaignId: "madar_ad_campaign_id",
    adgroupId: "madar_ad_adgroup_id",
    keyword: "madar_ad_keyword",
    creativeId: "madar_ad_creative_id"
  };

  var params = new URLSearchParams(location.search);

  var clickId = null;
  var clickIdPlatform = null;
  for (var i = 0; i < CLICK_ID_PARAMS.length; i++) {
    var value = params.get(CLICK_ID_PARAMS[i].param);
    if (value) {
      clickId = value;
      clickIdPlatform = CLICK_ID_PARAMS[i].platform;
      break;
    }
  }

  function bestEffortEmail() {
    try {
      if (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.email) {
        return window.Shopify.checkout.email;
      }
      if (
        window.ShopifyAnalytics &&
        window.ShopifyAnalytics.meta &&
        window.ShopifyAnalytics.meta.page &&
        window.ShopifyAnalytics.meta.page.customerEmail
      ) {
        return window.ShopifyAnalytics.meta.page.customerEmail;
      }
    } catch (e) {}
    return null;
  }

  var payload = {
    siteKey: siteKey,
    visitorId: visitorId,
    sessionId: sessionId,
    pageUrl: location.href,
    referrerUrl: document.referrer || null,
    utmSource: params.get("utm_source") || null,
    utmMedium: params.get("utm_medium") || null,
    utmCampaign: params.get("utm_campaign") || null,
    utmContent: params.get("utm_content") || null,
    utmTerm: params.get("utm_term") || null,
    clickId: clickId,
    clickIdPlatform: clickIdPlatform,
    platformCampaignId: params.get(ENTITY_ID_PARAMS.campaignId) || null,
    platformAdgroupId: params.get(ENTITY_ID_PARAMS.adgroupId) || null,
    platformKeyword: params.get(ENTITY_ID_PARAMS.keyword) || null,
    platformCreativeId: params.get(ENTITY_ID_PARAMS.creativeId) || null,
    customerEmail: bestEffortEmail()
  };

  fetch(apiOrigin + "/v1/tracking/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(function () {});

  try {
    fetch("/cart/update.js", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attributes: { madar_session_id: sessionId } }),
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
})();
`
