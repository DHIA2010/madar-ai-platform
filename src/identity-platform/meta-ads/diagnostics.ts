import type { MetaApiErrorDetail } from "./client"
import { MetaGraphApiClient } from "./client"

export interface MetaDiagnosticAdAccount {
  id: string
  name: string | null
  account_status: number | null
  campaigns_access: boolean
  adsets_access: boolean
  ads_access: boolean
  insights_access: boolean
  errors: MetaApiErrorDetail[]
}

export interface MetaConnectionDiagnosticResult {
  connection: boolean
  user: { id: string; name: string } | null
  ad_accounts: MetaDiagnosticAdAccount[]
  // Failures that aren't scoped to a single ad account (token invalid, /me/adaccounts itself
  // failing, etc). The per-account shape in the ticket only carries an `errors` array inside
  // each account -- this top-level array is an addition so a total connection failure isn't
  // silently represented as an empty ad_accounts list with no explanation.
  errors: MetaApiErrorDetail[]
}

interface MetaAdAccountApiRow {
  id: string
  name?: string
  account_status?: number
}

// A minimal Insights request, as specified: campaign-level fields only, no date_preset/breakdowns,
// so a failure here is attributable to insights access itself rather than a report-shape issue.
const INSIGHTS_FIELDS = "campaign_id,campaign_name,impressions,clicks,spend"
const CAMPAIGN_FIELDS = "id,name,status"
const ADSET_FIELDS = "id,name,status"
const AD_FIELDS = "id,name,status"

export async function runMetaConnectionDiagnostics(
  client: MetaGraphApiClient
): Promise<MetaConnectionDiagnosticResult> {
  const topLevelErrors: MetaApiErrorDetail[] = []

  // Step 1: validate the token itself.
  const meResult = await client.get<{ id: string; name: string }>("/me", { fields: "id,name" })
  if (!meResult.ok) {
    return {
      connection: false,
      user: null,
      ad_accounts: [],
      errors: [meResult.error],
    }
  }

  // Step 2 + 3: retrieve ad accounts and extract their ids. Token is valid past this point,
  // so `connection` is true even if the ad-account listing itself then fails.
  const adAccountsResult = await client.getAllPages<MetaAdAccountApiRow>("/me/adaccounts", {
    fields: "id,name,account_status",
  })

  if (!adAccountsResult.ok) {
    topLevelErrors.push(adAccountsResult.error)
    return {
      connection: true,
      user: meResult.data,
      ad_accounts: [],
      errors: topLevelErrors,
    }
  }

  // Steps 4-7: per ad account, test campaigns / adsets / ads / insights access. A failure on
  // one endpoint or one account never stops the remaining checks (per the "continue testing
  // other endpoints" requirement) -- each call is independently awaited and recorded.
  const adAccounts: MetaDiagnosticAdAccount[] = []
  for (const account of adAccountsResult.data) {
    adAccounts.push(await diagnoseAdAccount(client, account))
  }

  return {
    connection: true,
    user: meResult.data,
    ad_accounts: adAccounts,
    errors: topLevelErrors,
  }
}

async function diagnoseAdAccount(
  client: MetaGraphApiClient,
  account: MetaAdAccountApiRow
): Promise<MetaDiagnosticAdAccount> {
  const errors: MetaApiErrorDetail[] = []

  const campaignsResult = await client.get(`/${account.id}/campaigns`, { fields: CAMPAIGN_FIELDS })
  if (!campaignsResult.ok) errors.push(campaignsResult.error)

  const adsetsResult = await client.get(`/${account.id}/adsets`, { fields: ADSET_FIELDS })
  if (!adsetsResult.ok) errors.push(adsetsResult.error)

  const adsResult = await client.get(`/${account.id}/ads`, { fields: AD_FIELDS })
  if (!adsResult.ok) errors.push(adsResult.error)

  const insightsResult = await client.get(`/${account.id}/insights`, { fields: INSIGHTS_FIELDS })
  if (!insightsResult.ok) errors.push(insightsResult.error)

  return {
    id: account.id,
    name: account.name ?? null,
    account_status: account.account_status ?? null,
    campaigns_access: campaignsResult.ok,
    adsets_access: adsetsResult.ok,
    ads_access: adsResult.ok,
    insights_access: insightsResult.ok,
    errors,
  }
}

export function createMetaGraphApiClient(input: {
  accessToken: string
  apiBaseUrl: string
  maxRetries?: number
  minRequestIntervalMs?: number
}): MetaGraphApiClient {
  return new MetaGraphApiClient(input.accessToken, {
    apiBaseUrl: input.apiBaseUrl,
    maxRetries: input.maxRetries ?? 2,
    minRequestIntervalMs: input.minRequestIntervalMs ?? 250,
  })
}
