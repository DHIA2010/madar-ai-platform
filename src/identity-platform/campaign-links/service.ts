import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { writeAuditLog } from "../infrastructure/postgres/audit-log-writer"
import { appendUtmToUrl, normalizeUtmValue } from "../tracking/utm"

import type { CampaignRepository } from "../campaigns/repository"

import type { CampaignLinkRepository } from "./repository"
import type {
  CampaignLinkPreview,
  CampaignLinkView,
  CreateCampaignLinkInput,
  UpdateCampaignLinkInput,
  UtmInput,
} from "./types"

const CAMPAIGN_LINK_ERRORS = {
  notFound: () =>
    new IdentityError("CAMPAIGN_LINK_NOT_FOUND", 404, "business", "Campaign link not found."),
  campaignNotFound: () =>
    new IdentityError(
      "CAMPAIGN_LINK_CAMPAIGN_NOT_FOUND",
      422,
      "validation",
      "The referenced campaign does not exist."
    ),
}

function normalizedUtm(input: UtmInput) {
  return {
    utm_source: normalizeUtmValue(input.utmSource),
    utm_medium: normalizeUtmValue(input.utmMedium),
    utm_campaign: normalizeUtmValue(input.utmCampaign),
    utm_content: input.utmContent ? normalizeUtmValue(input.utmContent) : null,
    utm_term: input.utmTerm ? normalizeUtmValue(input.utmTerm) : null,
  }
}

export class CampaignLinkService {
  constructor(
    private readonly repository: CampaignLinkRepository,
    private readonly campaignRepository: CampaignRepository,
    private readonly database: PostgresDatabase,
    private readonly shortLinkBaseUrl: string,
    private readonly onLinkChanged?: (displayId: string) => Promise<void>
  ) {}

  async list(organizationId: string, workspaceId: string | null): Promise<CampaignLinkView[]> {
    return this.repository.list(organizationId, workspaceId)
  }

  async getById(organizationId: string, id: string): Promise<CampaignLinkView> {
    const link = await this.repository.findById(organizationId, id)
    if (!link) throw CAMPAIGN_LINK_ERRORS.notFound()
    return link
  }

  // Non-persisting: shows exactly what create() would produce (normalized UTM values, the
  // final destination URL) without consuming the display-id sequence or writing any row.
  preview(input: CreateCampaignLinkInput): CampaignLinkPreview {
    const utm = normalizedUtm(input)
    const finalUrl = appendUtmToUrl(input.destinationBaseUrl, utm)
    return {
      finalUrl,
      shortUrl: null,
      normalizedUtm: {
        utmSource: utm.utm_source,
        utmMedium: utm.utm_medium,
        utmCampaign: utm.utm_campaign,
        utmContent: utm.utm_content,
        utmTerm: utm.utm_term,
      },
    }
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    actorUserId: string,
    input: CreateCampaignLinkInput
  ): Promise<CampaignLinkView> {
    const campaign = await this.campaignRepository.findById(organizationId, input.campaignId)
    if (!campaign) throw CAMPAIGN_LINK_ERRORS.campaignNotFound()

    const utm = normalizedUtm(input)
    const finalUrl = appendUtmToUrl(input.destinationBaseUrl, utm)
    const displayId = await this.repository.nextDisplayId()
    const shortUrl =
      input.trackingType === "SHORT_LINK" ? `${this.shortLinkBaseUrl}/m/${displayId}` : null

    const link = await this.repository.create({
      organizationId,
      workspaceId,
      campaignId: input.campaignId,
      displayId,
      name: input.name,
      trackingType: input.trackingType,
      destinationBaseUrl: input.destinationBaseUrl,
      finalUrl,
      shortUrl,
      utmSource: utm.utm_source,
      utmMedium: utm.utm_medium,
      utmCampaign: utm.utm_campaign,
      utmContent: utm.utm_content,
      utmTerm: utm.utm_term,
      adGroupName: input.adGroupName ?? null,
      adName: input.adName ?? null,
      customParams: input.customParams ?? {},
      createdBy: actorUserId,
    })

    await writeAuditLog(this.database, {
      action: "campaign_link.created",
      actorUserId,
      organizationId,
      workspaceId,
      entityType: "campaign_link",
      entityId: link.id,
      metadata: { displayId: link.displayId, trackingType: link.trackingType },
    })

    return link
  }

  async update(
    organizationId: string,
    workspaceId: string | null,
    actorUserId: string,
    id: string,
    input: UpdateCampaignLinkInput
  ): Promise<CampaignLinkView> {
    const updated = await this.repository.update(organizationId, id, input)
    if (!updated) throw CAMPAIGN_LINK_ERRORS.notFound()

    await writeAuditLog(this.database, {
      action: "campaign_link.updated",
      actorUserId,
      organizationId,
      workspaceId,
      entityType: "campaign_link",
      entityId: updated.id,
    })
    await this.onLinkChanged?.(updated.displayId)

    return updated
  }

  async setEnabled(
    organizationId: string,
    workspaceId: string | null,
    actorUserId: string,
    id: string,
    enabled: boolean
  ): Promise<CampaignLinkView> {
    const updated = await this.repository.setEnabled(organizationId, id, enabled)
    if (!updated) throw CAMPAIGN_LINK_ERRORS.notFound()

    await writeAuditLog(this.database, {
      action: enabled ? "campaign_link.enabled" : "campaign_link.disabled",
      actorUserId,
      organizationId,
      workspaceId,
      entityType: "campaign_link",
      entityId: updated.id,
    })
    await this.onLinkChanged?.(updated.displayId)

    return updated
  }

  async archive(
    organizationId: string,
    workspaceId: string | null,
    actorUserId: string,
    id: string
  ): Promise<void> {
    const link = await this.repository.findById(organizationId, id)
    if (!link) throw CAMPAIGN_LINK_ERRORS.notFound()

    const archived = await this.repository.archive(organizationId, id)
    if (!archived) throw CAMPAIGN_LINK_ERRORS.notFound()

    await writeAuditLog(this.database, {
      action: "campaign_link.archived",
      actorUserId,
      organizationId,
      workspaceId,
      entityType: "campaign_link",
      entityId: link.id,
    })
    await this.onLinkChanged?.(link.displayId)
  }
}
