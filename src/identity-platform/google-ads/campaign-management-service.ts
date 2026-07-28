import { randomUUID } from "node:crypto"

import type { IntegrationConnectionView } from "../integrations/provider-models"

import type { MarketingCampaignRecord, GoogleAdsRepository } from "./repository"
import type { Campaign } from "./models"

interface CampaignRetriever {
  listCampaigns(input: { connectionId: string; customerId: string }): Promise<Campaign[]>
}

export interface GoogleAdsCampaignSyncSummary {
  discoveredCount: number
  insertedCount: number
  updatedCount: number
  unchangedCount: number
  inactiveCount: number
  syncedAt: string
}

function normalizeDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  return value.slice(0, 10)
}

function recordsEqual(current: MarketingCampaignRecord, next: MarketingCampaignRecord) {
  return current.providerAccountId === next.providerAccountId
    && current.externalCustomerId === next.externalCustomerId
    && current.providerEntityId === next.providerEntityId
    && current.name === next.name
    && current.status === next.status
    && current.channel === next.channel
    && current.objective === next.objective
    && current.budgetMicros === next.budgetMicros
    && current.currencyCode === next.currencyCode
    && current.startDate === next.startDate
    && current.endDate === next.endDate
    && current.sourceUpdatedAt === next.sourceUpdatedAt
}

export class GoogleAdsCampaignManagementService {
  constructor(
    private readonly repository: GoogleAdsRepository,
    private readonly retriever: CampaignRetriever
  ) {}

  async synchronizeCampaigns(input: {
    connection: IntegrationConnectionView
    customerId: string
    currencyCode: string | null
    actorUserId: string
  }) {
    const syncedAt = new Date().toISOString()
    await this.repository.ensureIntegrationConnectionExists({
      connectionId: input.connection.id,
      organizationId: input.connection.organizationId,
      workspaceId: input.connection.workspaceId,
      projectId: input.connection.projectId,
      dataSourceId: input.connection.dataSourceId,
      status: input.connection.status,
      connectionReference: input.connection.connectionReference,
      actorUserId: input.actorUserId,
      nowIso: syncedAt,
    })

    const discoveredCampaigns = await this.retriever.listCampaigns({
      connectionId: input.connection.id,
      customerId: input.customerId,
    })

    const existing = await this.repository.listMarketingCampaigns({
      connectionId: input.connection.id,
      externalCustomerId: input.customerId,
    })
    const existingByProviderEntityId = new Map(existing.map((campaign) => [campaign.providerEntityId, campaign]))

    let insertedCount = 0
    let updatedCount = 0
    let unchangedCount = 0

    const normalized = discoveredCampaigns.map((campaign) => {
      const current = existingByProviderEntityId.get(campaign.id)
      const nextRecord: MarketingCampaignRecord = {
        id: current?.id ?? randomUUID(),
        integrationConnectionId: input.connection.id,
        organizationId: input.connection.organizationId,
        workspaceId: input.connection.workspaceId,
        projectId: input.connection.projectId,
        providerId: "google-ads",
        providerFamily: "google",
        providerAccountId: input.customerId,
        externalCustomerId: input.customerId,
        providerEntityId: campaign.id,
        name: campaign.name,
        status: campaign.status,
        channel: campaign.channelType ?? null,
        objective: campaign.biddingStrategyType ?? null,
        budgetMicros: campaign.budgetMicros,
        currencyCode: input.currencyCode,
        startDate: normalizeDate(campaign.startDate),
        endDate: normalizeDate(campaign.endDate),
        sourceUpdatedAt: null,
        syncedAt,
        createdAt: current?.createdAt ?? syncedAt,
        updatedAt: syncedAt,
      }

      if (!current) {
        insertedCount += 1
      } else if (recordsEqual(current, nextRecord)) {
        unchangedCount += 1
      } else {
        updatedCount += 1
      }

      return nextRecord
    })

    for (const campaign of normalized) {
      await this.repository.upsertMarketingCampaign(campaign)
    }

    let inactiveCount = 0
    const activeIds = new Set(normalized.map((campaign) => campaign.providerEntityId))
    for (const current of existing) {
      if (activeIds.has(current.providerEntityId)) {
        continue
      }
      if (current.status === "INACTIVE") {
        continue
      }

      inactiveCount += 1
      await this.repository.markMarketingCampaignInactive({
        campaignId: current.id,
        syncedAt,
      })
    }

    await this.repository.touchIntegrationConnectionSynced({
      connectionId: input.connection.id,
      syncedAt,
    })

    const summary: GoogleAdsCampaignSyncSummary = {
      discoveredCount: discoveredCampaigns.length,
      insertedCount,
      updatedCount,
      unchangedCount,
      inactiveCount,
      syncedAt,
    }

    console.info("[google-ads][campaign-sync] synchronized", {
      connectionId: input.connection.id,
      customerId: input.customerId,
      ...summary,
    })

    return {
      campaigns: discoveredCampaigns,
      summary,
    }
  }
}