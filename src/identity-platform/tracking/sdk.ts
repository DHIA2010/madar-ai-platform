// Hand-written, unbundled, unminified ES5-safe vanilla JS -- same no-build-step constraint as
// snippet.ts (this deployable runs via `tsx` directly). Served at GET /v1/tracking/sdk-v{n}.js,
// selected by TRACKING_SDK_JS_BY_VERSION below. snippet.ts is the thin, rarely-changing loader;
// this file is the actual tracking implementation, versioned so a new release never requires a
// merchant to touch their <script> tag again.
export const TRACKING_SDK_JS_V1 = `(function () {
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

  // The loader (snippet.js) fetches remote config once and stashes it here before injecting
  // this script tag, so the SDK never needs a second network round trip on the common path.
  // If this file is somehow included directly (bypassing the loader), fall back to the same
  // defaults tracking/config.ts's DEFAULT_TRACKING_CONFIG defines server-side.
  var DEFAULT_CONFIG = {
    heartbeat_interval: 30000,
    session_timeout: 1800000,
    tracking: {
      page_view: true,
      product_view: true,
      add_to_cart: true,
      checkout: true,
      purchase: true
    }
  };
  var config = window.__madarConfig || DEFAULT_CONFIG;

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
      "; Max-Age=" + Math.max(1, Math.round(maxAgeSeconds)) +
      "; Path=/; SameSite=Lax" + secure;
  }

  // -------------------------------------------------------------------------------------------
  // Visitor / session identity -- no login required for either. visitor_id is a 1-year cookie;
  // session_id is a sliding window re-armed on every event, so an active shopper's session never
  // expires mid-visit even past the configured session_timeout.
  // -------------------------------------------------------------------------------------------
  var visitorId = getCookie("madar_visitor_id") || randomId();
  setCookie("madar_visitor_id", visitorId, 31536000);

  var sessionId = getCookie("madar_session_id") || randomId();
  function touchSession() {
    setCookie("madar_session_id", sessionId, (config.session_timeout || 1800000) / 1000);
  }
  touchSession();

  // Madar.identify(customerId) preserves the anonymous visitor's history -- it associates, it
  // never replaces visitorId. Persisted in localStorage (survives longer than a session) rather
  // than a cookie, since it's read client-side only, never needed server-side outside a request.
  var identity = { customerId: null };
  try {
    identity.customerId = window.localStorage.getItem("madar_customer_id") || null;
  } catch (e) {}

  // -------------------------------------------------------------------------------------------
  // Device / page context -- no navigator.geolocation, ever. Non-sensitive fields only.
  // -------------------------------------------------------------------------------------------
  function detectBrowser(ua) {
    var m;
    if (/edg\\//i.test(ua)) {
      m = ua.match(/edg\\/([\\d.]+)/i);
      return { name: "Edge", version: m ? m[1] : null };
    }
    if (/chrome|crios/i.test(ua) && !/edg\\//i.test(ua)) {
      m = ua.match(/(?:chrome|crios)\\/([\\d.]+)/i);
      return { name: "Chrome", version: m ? m[1] : null };
    }
    if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
      m = ua.match(/version\\/([\\d.]+)/i);
      return { name: "Safari", version: m ? m[1] : null };
    }
    if (/firefox|fxios/i.test(ua)) {
      m = ua.match(/(?:firefox|fxios)\\/([\\d.]+)/i);
      return { name: "Firefox", version: m ? m[1] : null };
    }
    return { name: "Unknown", version: null };
  }

  function detectOS(ua) {
    if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
    if (/android/i.test(ua)) return "Android";
    if (/windows/i.test(ua)) return "Windows";
    if (/mac os x/i.test(ua)) return "macOS";
    if (/linux/i.test(ua)) return "Linux";
    return "Unknown";
  }

  function deviceContext() {
    var ua = navigator.userAgent || "";
    var browser = detectBrowser(ua);
    var timezone = null;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (e) {}
    return {
      type: /mobile/i.test(ua) ? "mobile" : (/tablet|ipad/i.test(ua) ? "tablet" : "desktop"),
      browser: browser.name,
      browserVersion: browser.version,
      os: detectOS(ua),
      screenWidth: window.screen ? window.screen.width : null,
      screenHeight: window.screen ? window.screen.height : null,
      language: navigator.language || null,
      timezone: timezone
    };
  }

  function pageContext() {
    return {
      url: location.href,
      title: document.title || null,
      referrer: document.referrer || null
    };
  }

  // -------------------------------------------------------------------------------------------
  // UTM + ad click-id capture. Persisted to sessionStorage on first sight so the original
  // acquisition source survives subsequent page views that carry no query params at all.
  // -------------------------------------------------------------------------------------------
  var CLICK_ID_PARAMS = [
    { param: "gclid", platform: "google_ads" },
    { param: "gbraid", platform: "google_ads" },
    { param: "wbraid", platform: "google_ads" },
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
  var ATTRIBUTION_STORAGE_KEY = "madar_attribution_v1";

  function readAttribution() {
    var params = new URLSearchParams(location.search);
    var hasNewSource = params.get("utm_source") || params.get("utm_campaign");

    if (hasNewSource) {
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

      var attribution = {
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
        platformCreativeId: params.get(ENTITY_ID_PARAMS.creativeId) || null
      };
      try {
        sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
      } catch (e) {}
      return attribution;
    }

    try {
      var stored = sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {}

    return {
      utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null,
      clickId: null, clickIdPlatform: null,
      platformCampaignId: null, platformAdgroupId: null, platformKeyword: null, platformCreativeId: null
    };
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

  // -------------------------------------------------------------------------------------------
  // Transport: a tiny in-memory queue, flushed on a short interval and immediately on page
  // hide/unload via sendBeacon (falls back to a keepalive fetch where sendBeacon is unavailable).
  // Never blocks page rendering; every failure is swallowed -- tracking must never break the
  // merchant's storefront.
  // -------------------------------------------------------------------------------------------
  var queue = [];
  var MAX_ATTEMPTS = 3;
  var FLUSH_INTERVAL_MS = 2000;
  var BATCH_SIZE = 5;

  function requeue(payload) {
    payload.__attempts = (payload.__attempts || 0) + 1;
    if (payload.__attempts < MAX_ATTEMPTS) {
      queue.push(payload);
    }
  }

  function sendOne(payload, useBeacon) {
    var toSend = {};
    for (var key in payload) {
      if (key !== "__attempts") toSend[key] = payload[key];
    }
    var body = JSON.stringify(toSend);

    if (useBeacon && navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(apiOrigin + "/v1/tracking/capture", blob)) return;
      } catch (e) {}
    }

    try {
      fetch(apiOrigin + "/v1/tracking/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body,
        keepalive: true
      }).catch(function () {
        requeue(payload);
      });
    } catch (e) {
      requeue(payload);
    }
  }

  function flush(useBeacon) {
    if (queue.length === 0) return;
    var pending = queue;
    queue = [];
    for (var i = 0; i < pending.length; i++) sendOne(pending[i], useBeacon);
  }

  setInterval(function () {
    flush(false);
  }, FLUSH_INTERVAL_MS);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", function () {
    flush(true);
  });

  // -------------------------------------------------------------------------------------------
  // Core event construction + the public Madar.* surface.
  // -------------------------------------------------------------------------------------------
  function buildPayload(eventName, properties) {
    var attribution = readAttribution();
    var page = pageContext();
    return {
      siteKey: siteKey,
      visitorId: visitorId,
      sessionId: sessionId,
      event: eventName,
      eventId: randomId(),
      pageUrl: page.url,
      pageTitle: page.title,
      referrerUrl: page.referrer,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmContent: attribution.utmContent,
      utmTerm: attribution.utmTerm,
      clickId: attribution.clickId,
      clickIdPlatform: attribution.clickIdPlatform,
      platformCampaignId: attribution.platformCampaignId,
      platformAdgroupId: attribution.platformAdgroupId,
      platformKeyword: attribution.platformKeyword,
      platformCreativeId: attribution.platformCreativeId,
      customerEmail: bestEffortEmail(),
      customerId: identity.customerId,
      properties: properties || {},
      device: deviceContext()
    };
  }

  function enqueue(eventName, properties) {
    touchSession();
    queue.push(buildPayload(eventName, properties));
    if (queue.length >= BATCH_SIZE) flush(false);
  }

  // Internal implementation (queue, cookies, context collectors) stays closured -- this object
  // is the entire public surface, matching spec section 16's "don't expose internals".
  window.Madar = {
    track: function (name, properties) {
      if (!name) return;
      enqueue(String(name), properties || {});
    },
    identify: function (customerId) {
      if (!customerId) return;
      identity.customerId = String(customerId);
      try {
        window.localStorage.setItem("madar_customer_id", identity.customerId);
      } catch (e) {}
      enqueue("identify", {});
    },
    page: function () {
      enqueue("page_view", {});
    },
    getVisitorId: function () {
      return visitorId;
    },
    getSessionId: function () {
      return sessionId;
    }
  };

  // -------------------------------------------------------------------------------------------
  // Auto page-view tracking, including SPA-style pushState/replaceState navigation.
  // -------------------------------------------------------------------------------------------
  var trackingFlags = config.tracking || DEFAULT_CONFIG.tracking;
  if (trackingFlags.page_view !== false) {
    window.Madar.page();
  }

  function onNavigate() {
    if (trackingFlags.page_view !== false) window.Madar.page();
  }
  window.addEventListener("popstate", onNavigate);
  window.addEventListener("hashchange", onNavigate);
  if (window.history) {
    var originalPushState = window.history.pushState.bind(window.history);
    var originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = function () {
      originalPushState.apply(window.history, arguments);
      onNavigate();
    };
    window.history.replaceState = function () {
      originalReplaceState.apply(window.history, arguments);
      onNavigate();
    };
  }

  // -------------------------------------------------------------------------------------------
  // Heartbeat -- only while the tab is actually visible, so a backgrounded tab doesn't keep a
  // visitor looking "live" forever.
  // -------------------------------------------------------------------------------------------
  setInterval(function () {
    if (document.visibilityState === "visible") {
      enqueue("heartbeat", {});
    }
  }, config.heartbeat_interval || DEFAULT_CONFIG.heartbeat_interval);

  // -------------------------------------------------------------------------------------------
  // Platform adapters -- feature-detected, each mapping the platform's own real events onto the
  // generic Madar.track() surface. Only implemented against publicly documented hooks; never a
  // guessed API shape.
  // -------------------------------------------------------------------------------------------

  // Shopify: /cart/add.js, /cart/change.js, /cart/update.js are Shopify's own documented Ajax
  // Cart API -- every theme's cart interaction goes through one of these regardless of markup,
  // so patching fetch here catches it without depending on theme-specific DOM selectors.
  (function shopifyAdapter() {
    if (!window.Shopify) return;
    try {
      var originalFetch = window.fetch;
      window.fetch = function (input) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        var isCartAdd = /\\/cart\\/add(\\.js)?(\\?|$)/.test(url);
        var result = originalFetch.apply(this, arguments);
        if (isCartAdd && trackingFlags.add_to_cart !== false) {
          result.then(function (response) {
            if (response && response.ok) window.Madar.track("add_to_cart", {});
          }).catch(function () {});
        }
        return result;
      };
    } catch (e) {}
  })();

  // Salla: the \`salla\` global is Salla's own published Twilight theme JS SDK (docs.salla.dev).
  // salla.cart.event.onItemAdded/onItemDeleted are the real, confirmed methods (exact code
  // samples in Salla's own docs and npm package listing) -- deliberately NOT the generic
  // salla.event.on("cart::added", ...) form an earlier version of this file used, which was
  // never verified against real docs and turned out to be wrong (so it silently never fired).
  // Product-view/checkout/purchase Salla-native events are intentionally NOT wired here: no real
  // event name for those was found despite searching, and guessing one would repeat the exact
  // mistake being fixed.
  (function sallaAdapter() {
    if (!window.salla || !window.salla.cart || !window.salla.cart.event) return;
    try {
      if (typeof window.salla.cart.event.onItemAdded === "function") {
        window.salla.cart.event.onItemAdded(function (response, productId) {
          if (trackingFlags.add_to_cart === false) return;
          window.Madar.track("add_to_cart", {
            product_id: productId !== undefined && productId !== null ? String(productId) : null
          });
        });
      }
      if (typeof window.salla.cart.event.onItemDeleted === "function") {
        window.salla.cart.event.onItemDeleted(function () {
          if (trackingFlags.add_to_cart === false) return;
          window.Madar.track("remove_from_cart", {});
        });
      }
    } catch (e) {}
  })();

  // WooCommerce: "added_to_cart" is a long-standing, documented jQuery event WooCommerce core
  // itself triggers on document.body -- real and stable since WooCommerce 2.x, not guessed.
  (function wooCommerceAdapter() {
    if (!window.jQuery) return;
    try {
      window.jQuery(document.body).on("added_to_cart", function () {
        if (trackingFlags.add_to_cart === false) return;
        window.Madar.track("add_to_cart", {});
      });
    } catch (e) {}
  })();

  // Zid: deliberately does NOT call a guessed zid.* event-bus method -- Zid's exact theme JS
  // event API was not independently verified against current docs.zid.sa at implementation
  // time, and fabricating one would violate this adapter's own reliability promise. Instead it
  // reads schema.org Product structured data (a platform-agnostic, standard mechanism many
  // storefronts -- including Zid's -- publish for SEO) to auto-fire product_view on real
  // product pages. A genuine Zid cart-event adapter should replace this once Zid's current
  // theme event API is confirmed.
  (function zidStructuredDataAdapter() {
    if (!window.zid) return;
    if (trackingFlags.product_view === false) return;
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < scripts.length; i++) {
        var data;
        try {
          data = JSON.parse(scripts[i].textContent || "{}");
        } catch (e) {
          continue;
        }
        if (data && data["@type"] === "Product") {
          window.Madar.track("product_view", {
            product_id: data.sku || data.productID || null,
            product_name: data.name || null,
            price:
              data.offers && data.offers.price !== undefined ? Number(data.offers.price) : null,
            currency: data.offers ? data.offers.priceCurrency || null : null
          });
          break;
        }
      }
    } catch (e) {}
  })();
})();
`

export const TRACKING_SDK_JS_BY_VERSION: Record<string, string> = {
  "1.0.0": TRACKING_SDK_JS_V1,
}
