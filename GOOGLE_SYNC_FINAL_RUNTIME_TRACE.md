# GOOGLE_SYNC_FINAL_RUNTIME_TRACE

Run metadata
- Reproduced exactly ONE sync request
- idempotencyKey: sync-final-1782898413
- endpoint: POST /v1/integrations/google-ads/sync

Captured runtime values

- Final request URL:
https://googleads.googleapis.com/v17/customers/109241329109033021812/googleAds:search

- HTTP method:
POST

- Authorization header present (YES/NO):
YES

- OAuth access token length:
254

- Developer Token present (YES/NO):
NO

- Login Customer ID header value (if any):
null

- Customer ID used:
109241329109033021812

- Google HTTP status:
404

- Google response headers:
{
  "alt-svc": "h3=\":443\"; ma=2592000,h3-29=\":443\"; ma=2592000",
  "content-length": "1613",
  "content-type": "text/html; charset=UTF-8",
  "date": "Wed, 01 Jul 2026 09:33:34 GMT",
  "server": "ESF",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "x-xss-protection": "0"
}

- Google response body (RAW):
<!DOCTYPE html>
<html lang=en>
  <meta charset=utf-8>
  <meta name=viewport content="initial-scale=1, minimum-scale=1, width=device-width">
  <title>Error 404 (Not Found)!!1</title>
  <style>
    *{margin:0;padding:0}html,code{font:15px/22px arial,sans-serif}html{background:#fff;color:#222;padding:15px}body{margin:7% auto 0;max-width:390px;min-height:180px;padding:30px 0 15px}* > body{background:url(//www.google.com/images/errors/robot.png) 100% 5px no-repeat;padding-right:205px}p{margin:11px 0 22px;overflow:hidden}ins{color:#777;text-decoration:none}a img{border:0}@media screen and (max-width:772px){body{background:none;margin-top:0;max-width:none;padding-right:0}}#logo{background:url(//www.google.com/images/branding/googlelogo/1x/googlelogo_color_150x54dp.png) no-repeat;margin-left:-5px}@media only screen and (min-resolution:192dpi){#logo{background:url(//www.google.com/images/branding/googlelogo/2x/googlelogo_color_150x54dp.png) no-repeat 0% 0%/100% 100%;-moz-border-image:url(//www.google.com/images/branding/googlelogo/2x/googlelogo_color_150x54dp.png) 0}}@media only screen and (-webkit-min-device-pixel-ratio:2){#logo{background:url(//www.google.com/images/branding/googlelogo/2x/googlelogo_color_150x54dp.png) no-repeat;-webkit-background-size:100% 100%}}#logo{display:inline-block;height:54px;width:150px}
  </style>
  <a href=//www.google.com/><span id=logo aria-label=Google></span></a>
  <p><b>404.</b> <ins>That’s an error.</ins>
  <p>The requested URL <code>/v17/customers/109241329109033021812/googleAds:search</code> was not found on this server.  <ins>That’s all we know.</ins>

- First exception type:
GoogleAdsIntegrationError

- First exception message:
Google Ads customer not found.

- First throw file:
src/identity-platform/google-ads/errors.ts

- First throw line:
38

Database verification
- Was sync_run inserted?
YES. Row exists in google_ads_sync_runs:
  id=981144cc-9629-4aee-b4f5-c133fb065fba
  idempotency_key=sync-final-1782898413
  status=failed
  error_code=GOOGLE_ADS_INVALID_CUSTOMER

- Was sync_history inserted?
No backend table named google_ads_sync_history exists (to_regclass returned null).

- Was database transaction committed or rolled back?
For this failure path, no sync persistence transaction started before the first Google failure.
  databaseTransactionStarted=false
  databaseTransactionCommitted=false
  databaseTransactionRolledBack=false

Original exception before INTERNAL_ERROR wrapping
Captured before HTTP layer wrapping:
- type: GoogleAdsIntegrationError
- message: Google Ads customer not found.
- source: toGoogleAdsError(...) in src/identity-platform/google-ads/errors.ts:38
