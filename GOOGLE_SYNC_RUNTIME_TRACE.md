# GOOGLE_SYNC_RUNTIME_TRACE

Connection verified:
YES
Runtime log: [sync-runtime] connection-verified with status=connected for connectionId=2aa80279-419e-4b3d-8c32-2d9dea234e51.

First Google API called:
Google Ads Search (googleAds:search), during customers stage (customer information fetch via customer_client query).

Request URL:
https://googleads.googleapis.com/v17/customers/google-ads-1/googleAds:search

Customer ID sent:
google-ads-1

Access token present:
YES (length 253)

Google HTTP status:
404

Google response body:
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
  <p>The requested URL <code>/v17/customers/google-ads-1/googleAds:search</code> was not found on this server.  <ins>That’s all we know.</ins>

First exception:
GoogleAdsIntegrationError message "Google Ads customer not found." (originating from toGoogleAdsError mapping of HTTP 404).

File:
src/identity-platform/google-ads/errors.ts

Line:
38
