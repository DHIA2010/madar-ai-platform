import type {
  IntegrationEvent,
  SyncJob,
  SyncResult,
} from "@/application/contracts/integration.contracts"

import { GoogleAdsGateway } from "./google-ads.gateway"
import { GoogleAdsMapper } from "./google-ads.mapper"

function nowIso() {
  return new Date().toISOString()
}

export interface GoogleAdsSyncOutput {
  result: SyncResult
  integrationEvents: IntegrationEvent[]
  summary: {
    mode: "initial" | "incremental" | "manual"
    accounts: number
    campaigns: number
    adGroups: number
    ads: number
    keywords: number
    performanceMetrics: number
  }
}

export class GoogleAdsSync {
  constructor(private readonly gateway: GoogleAdsGateway) {}

  async run(
    connectionId: string,
    job: SyncJob,
    lastSyncedAt?: string
  ): Promise<GoogleAdsSyncOutput> {
    const mode: GoogleAdsSyncOutput["summary"]["mode"] =
      job.trigger === "manual" ? "manual" : lastSyncedAt ? "incremental" : "initial"

    const fetchMode = mode === "initial" ? "initial" : "incremental"

    const [accountsRaw, campaignsRaw, adGroupsRaw, adsRaw, keywordsRaw, performanceRaw] =
      await Promise.all([
        this.gateway.fetchAccounts(fetchMode),
        this.gateway.fetchCampaigns(fetchMode),
        this.gateway.fetchAdGroups(fetchMode),
        this.gateway.fetchAds(fetchMode),
        this.gateway.fetchKeywords(fetchMode),
        this.gateway.fetchPerformanceMetrics(fetchMode),
      ])

    const accounts = accountsRaw.map((item) => GoogleAdsMapper.mapAccount(item))
    const campaigns = campaignsRaw.map((item) => GoogleAdsMapper.mapCampaign(item))
    const adGroups = adGroupsRaw.map((item) => GoogleAdsMapper.mapAdGroup(item))
    const ads = adsRaw.map((item) => GoogleAdsMapper.mapAd(item))
    const keywords = keywordsRaw.map((item) => GoogleAdsMapper.mapKeyword(item))
    const performance = performanceRaw.map((item) => GoogleAdsMapper.mapPerformance(item))

    const startedAt = nowIso()
    const finishedAt = nowIso()

    const integrationEvents: IntegrationEvent[] = [
      {
        eventId: `google_ads_evt_${Date.now()}_accounts`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.accounts.synced:${accounts.length}`,
      },
      {
        eventId: `google_ads_evt_${Date.now()}_campaigns`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.campaigns.synced:${campaigns.length}`,
      },
      {
        eventId: `google_ads_evt_${Date.now()}_ad_groups`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.ad_groups.synced:${adGroups.length}`,
      },
      {
        eventId: `google_ads_evt_${Date.now()}_ads`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.ads.synced:${ads.length}`,
      },
      {
        eventId: `google_ads_evt_${Date.now()}_keywords`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.keywords.synced:${keywords.length}`,
      },
      {
        eventId: `google_ads_evt_${Date.now()}_performance`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.performance.synced:${performance.length}`,
      },
    ]

    return {
      result: {
        recordsRead:
          accountsRaw.length +
          campaignsRaw.length +
          adGroupsRaw.length +
          adsRaw.length +
          keywordsRaw.length +
          performanceRaw.length,
        recordsWritten:
          accounts.length +
          campaigns.length +
          adGroups.length +
          ads.length +
          keywords.length +
          performance.length,
        recordsFailed: 0,
        durationMs: 1800,
        startedAt,
        finishedAt,
        message: `Google Ads ${mode} sync completed`,
      },
      integrationEvents,
      summary: {
        mode,
        accounts: accounts.length,
        campaigns: campaigns.length,
        adGroups: adGroups.length,
        ads: ads.length,
        keywords: keywords.length,
        performanceMetrics: performance.length,
      },
    }
  }
}
