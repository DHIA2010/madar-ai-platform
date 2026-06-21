import type {
  IntegrationEvent,
  SyncJob,
  SyncResult,
} from "@/application/contracts/integration.contracts"

import { MetaAdsGateway } from "./meta-ads.gateway"
import { MetaAdsMapper } from "./meta-ads.mapper"

function nowIso() {
  return new Date().toISOString()
}

export interface MetaAdsSyncOutput {
  result: SyncResult
  integrationEvents: IntegrationEvent[]
  summary: {
    mode: "initial" | "incremental" | "manual"
    accounts: number
    campaigns: number
    adSets: number
    ads: number
    performanceMetrics: number
    conversionMetrics: number
  }
}

export class MetaAdsSync {
  constructor(private readonly gateway: MetaAdsGateway) {}

  async run(connectionId: string, job: SyncJob, lastSyncedAt?: string): Promise<MetaAdsSyncOutput> {
    const mode: MetaAdsSyncOutput["summary"]["mode"] =
      job.trigger === "manual" ? "manual" : lastSyncedAt ? "incremental" : "initial"

    const fetchMode = mode === "initial" ? "initial" : "incremental"

    const [accountsRaw, campaignsRaw, adSetsRaw, adsRaw, performanceRaw, conversionRaw] =
      await Promise.all([
        this.gateway.fetchAccounts(fetchMode),
        this.gateway.fetchCampaigns(fetchMode),
        this.gateway.fetchAdSets(fetchMode),
        this.gateway.fetchAds(fetchMode),
        this.gateway.fetchPerformanceMetrics(fetchMode),
        this.gateway.fetchConversionMetrics(fetchMode),
      ])

    const accounts = accountsRaw.map((item) => MetaAdsMapper.mapAccount(item))
    const campaigns = campaignsRaw.map((item) => MetaAdsMapper.mapCampaign(item))
    const adSets = adSetsRaw.map((item) => MetaAdsMapper.mapAdSet(item))
    const ads = adsRaw.map((item) => MetaAdsMapper.mapAd(item))
    const performance = performanceRaw.map((item) => MetaAdsMapper.mapPerformance(item))
    const conversion = conversionRaw.map((item) => MetaAdsMapper.mapConversion(item))

    const startedAt = nowIso()
    const finishedAt = nowIso()

    const integrationEvents: IntegrationEvent[] = [
      {
        eventId: `meta_evt_${Date.now()}_accounts`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.accounts.synced:${accounts.length}`,
      },
      {
        eventId: `meta_evt_${Date.now()}_campaigns`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.campaigns.synced:${campaigns.length}`,
      },
      {
        eventId: `meta_evt_${Date.now()}_adsets`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.ad_sets.synced:${adSets.length}`,
      },
      {
        eventId: `meta_evt_${Date.now()}_ads`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.ads.synced:${ads.length}`,
      },
      {
        eventId: `meta_evt_${Date.now()}_performance`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.performance.synced:${performance.length}`,
      },
      {
        eventId: `meta_evt_${Date.now()}_conversion`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.ads.conversion.synced:${conversion.length}`,
      },
    ]

    return {
      result: {
        recordsRead:
          accountsRaw.length +
          campaignsRaw.length +
          adSetsRaw.length +
          adsRaw.length +
          performanceRaw.length +
          conversionRaw.length,
        recordsWritten:
          accounts.length +
          campaigns.length +
          adSets.length +
          ads.length +
          performance.length +
          conversion.length,
        recordsFailed: 0,
        durationMs: 1700,
        startedAt,
        finishedAt,
        message: `Meta Ads ${mode} sync completed`,
      },
      integrationEvents,
      summary: {
        mode,
        accounts: accounts.length,
        campaigns: campaigns.length,
        adSets: adSets.length,
        ads: ads.length,
        performanceMetrics: performance.length,
        conversionMetrics: conversion.length,
      },
    }
  }
}
