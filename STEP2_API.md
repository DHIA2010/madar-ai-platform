# STEP2_API

## Endpoints

### POST /v1/integrations/google-ads/sync
Triggers an idempotent Google Ads sync run.

Request body:
- `connectionId` (uuid)
- `customerId` (string)
- `startDate` (YYYY-MM-DD)
- `endDate` (YYYY-MM-DD)
- `idempotencyKey` (string)

Behavior:
- Validates actor authorization (`owner`/`admin`).
- Validates connection ownership and connected status.
- Creates or reuses sync run by idempotency key.
- Pulls Google Ads datasets and persists normalized records.
- Returns completed sync run summary.

Typical statuses:
- 200 success
- 400 validation error
- 403 forbidden
- 404 connection/customer not found
- 409 connection not ready
- 429 provider quota exceeded
- 502 provider failure
- 503 transient provider failure

### GET /v1/integrations/google-ads/records
Lists normalized records produced by sync.

Query params:
- `connectionId` (uuid)
- `customerId` (string)
- `entityType` (optional)
- `startDate` (optional YYYY-MM-DD)
- `endDate` (optional YYYY-MM-DD)
- `pageSize` (optional int 1..1000)

Behavior:
- Validates actor authorization and tenant ownership.
- Returns provider-independent records from persisted normalized store.

Response shape:
- `{ items: GoogleAdsRecordView[] }`

## Data Model Notes
Entity types persisted:
- customer_account
- campaign
- campaign_metric
- ad_group
- ad_group_metric
- ad
- ad_metric
- keyword
- keyword_metric
- search_term
- geo_metric
- device_metric
- conversion_action

## Environment Variables
Added:
- `IDENTITY_PLATFORM_GOOGLE_ADS_API_BASE_URL`
- `IDENTITY_PLATFORM_GOOGLE_ADS_TOKEN_ENDPOINT`
- `IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN`
- `IDENTITY_PLATFORM_GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- `IDENTITY_PLATFORM_GOOGLE_ADS_MAX_RETRIES`
- `IDENTITY_PLATFORM_GOOGLE_ADS_RATE_LIMIT_MS`
