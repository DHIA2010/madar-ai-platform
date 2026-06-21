import type {
  IntegrationEvent,
  SyncJob,
  SyncResult,
} from "@/application/contracts/integration.contracts"

import { SnapchatAdsGateway } from "./snapchat-ads.gateway"
import { SnapchatAdsMapper } from "./snapchat-ads.mapper"

function nowIso() {
  return new Date().toISOString()
}

export interface SnapchatAdsSyncOutput {
  result: SyncResult
  integrationEvents: IntegrationEvent[]
  summary: {
    mode: "initial" | "incremental" | "manual"
    adAccounts: number
    organizations: number
    campaigns: number
    adSquads: number
    ads: number
    creatives: number
    performanceMetrics: number
    conversionMetrics: number
  }
}

export class SnapchatAdsSync {
  constructor(private readonly gateway: SnapchatAdsGateway) {}

  async run(
    connectionId: string,
    job: SyncJob,
    lastSyncedAt?: string
  ): Promise<SnapchatAdsSyncOutput> {
    const mode: SnapchatAdsSyncOutput["summary"]["mode"] =
      job.trigger === "manual" ? "manual" : lastSyncedAt ? "incremental" : "initial"

    const fetchMode = mode === "initial" ? "initial" : "incremental"

    const [
      adAccountsRaw,
      organizationsRaw,
      campaignsRaw,
      adSquadsRaw,
      adsRaw,
      creativesRaw,
      performanceRaw,
      conversionsRaw,
    ] = await Promise.all([
      this.gateway.fetchAdAccounts(fetchMode),
      this.gateway.fetchOrganizations(fetchMode),
      this.gateway.fetchCampaigns(fetchMode),
      this.gateway.fetchAdSquads(fetchMode),
      this.gateway.fetchAds(fetchMode),
      this.gateway.fetchCreatives(fetchMode),
      this.gateway.fetchPerformanceMetrics(fetchMode),
      this.gateway.fetchConversionMetrics(fetchMode),
    ])

    const adAccounts = adAccountsRaw.map((item) => SnapchatAdsMapper.mapAdAccount(item))
    const organizations = organizationsRaw.map((item) => SnapchatAdsMapper.mapOrganization(item))
    const campaigns = campaignsRaw.map((item) => SnapchatAdsMapper.mapCampaign(item))
    const adSquads = adSquadsRaw.map((item) => SnapchatAdsMapper.mapAdSquad(item))
    const ads = adsRaw.map((item) => SnapchatAdsMapper.mapAd(item))
    const creatives = creativesRaw.map((item) => SnapchatAdsMapper.mapCreative(item))
    const performance = performanceRaw.map((item) => SnapchatAdsMapper.mapPerformance(item))
    const conversions = conversionsRaw.map((item) => SnapchatAdsMapper.mapConversion(item))

    const startedAt = nowIso()
    const finishedAt = nowIso()

    const integrationEvents: IntegrationEvent[] = [
      {
        eventId: `snapchat_ads_evt_${Date.now()}_ad_accounts`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.ad_accounts.synced:${adAccounts.length}`,
      },
      {
        eventId: `snapchat_ads_evt_${Date.now()}_organizations`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.organizations.synced:${organizations.length}`,
      },
      {
        eventId: `snapchat_ads_evt_${Date.now()}_campaigns`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.campaigns.synced:${campaigns.length}`,
      },
      {
        eventId: `snapchat_ads_evt_${Date.now()}_ad_squads`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.ad_squads.synced:${adSquads.length}`,
      },
      {
        eventId: `snapchat_ads_evt_${Date.now()}_ads`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.ads.synced:${ads.length}`,
      },
      {
        eventId: `snapchat_ads_evt_${Date.now()}_creatives`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.creatives.synced:${creatives.length}`,
      },
      {
        eventId: `snapchat_ads_evt_${Date.now()}_performance`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.performance.synced:${performance.length}`,
      },
      {
        eventId: `snapchat_ads_evt_${Date.now()}_conversion`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.conversion.synced:${conversions.length}`,
      },
    ]

    return {
      result: {
        recordsRead:
          adAccountsRaw.length +
          organizationsRaw.length +
          campaignsRaw.length +
          adSquadsRaw.length +
          adsRaw.length +
          creativesRaw.length +
          performanceRaw.length +
          conversionsRaw.length,
        recordsWritten:
          adAccounts.length +
          organizations.length +
          campaigns.length +
          adSquads.length +
          ads.length +
          creatives.length +
          performance.length +
          conversions.length,
        recordsFailed: 0,
        durationMs: 1900,
        startedAt,
        finishedAt,
        message: `Snapchat Ads ${mode} sync completed`,
      },
      integrationEvents,
      summary: {
        mode,
        adAccounts: adAccounts.length,
        organizations: organizations.length,
        campaigns: campaigns.length,
        adSquads: adSquads.length,
        ads: ads.length,
        creatives: creatives.length,
        performanceMetrics: performance.length,
        conversionMetrics: conversions.length,
      },
    }
  }
}
