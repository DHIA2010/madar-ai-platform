# GOOGLE_CUSTOMER_ID_MAPPING_FIX

Current value used
- `google-ads-1`
- Source path before fix:
  - Frontend connection metadata field `connection.metadata.customerId` (set from internal account selector id in wizard)
  - Passed in sync payload as `input.customerId`
  - Used directly by sync service and sent to Google Ads client

Correct DB column
- `google_oauth_connections.provider_account_id`
- Persisted during OAuth callback from Google profile id:
  - `providerAccountId: profile.id ?? null` in `src/identity-platform/google-oauth/service.ts`.
- Mapped into connection view as:
  - `providerAccountId: row.provider_account_id` in `src/identity-platform/google-oauth/repository.ts`.

Mapping file
- `src/identity-platform/google-ads/sync-service.ts`

Old mapping
```ts
// sync-service.ts (before)
// customerId came from client payload (frontend internal alias)
const syncRun = await this.repository.createOrLoadSyncRun({
  ...,
  customerId: input.customerId,
  ...,
})

// stages and checkpoints also used input.customerId
this.customerService.listCustomerAccounts({ connectionId: connection.id, customerId: input.customerId })
```

New mapping
```ts
// sync-service.ts (after)
// customerId resolved from OAuth-persisted connection field first
const customerId = connection.providerAccountId ?? input.customerId

const syncRun = await this.repository.createOrLoadSyncRun({
  ...,
  customerId,
  ...,
})

this.customerService.listCustomerAccounts({ connectionId: connection.id, customerId })
```

Verification after fix
- Reproduced `POST /v1/integrations/google-ads/sync` with payload still containing `customerId: "google-ads-1"`.
- Temporary runtime verification logs showed effective outbound request now uses DB-mapped value from `provider_account_id`:
  - Request URL: `https://googleads.googleapis.com/v17/customers/109241329109033021812/googleAds:search`
  - Effective customerId sent: `109241329109033021812`
  - Access token present (length 253)
- This confirms mapping replacement worked: request path no longer uses `/customers/google-ads-1/`.

Notes
- OAuth flow was not modified.
- Sync algorithm/stages were not changed; only customerId source mapping was replaced.
- HTTP client behavior was not changed.
