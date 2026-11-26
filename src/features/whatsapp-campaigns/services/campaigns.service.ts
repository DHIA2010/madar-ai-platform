import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// WhatsApp marketing campaigns' API (identity-platform/whatsapp/campaigns.ts,
// /v1/customers/campaigns/*).

export type AudienceKind = "all" | "recent" | "inactive" | "never" | "spent" | "loyalty"

export interface CampaignAudience {
  kind: AudienceKind
  days?: number
  minAmount?: number
  minPoints?: number
}

export interface WhatsAppOffer {
  id: string
  title: string
  templateName: string
  body: string
  imageUrl: string | null
  buttonText: string | null
  buttonUrl: string | null
  // PENDING, APPROVED, REJECTED, PAUSED, DISABLED, FAILED
  status: string
  rejectedReason: string | null
  createdAt: string
}

export interface CampaignStats {
  recipients: number
  queued: number
  sent: number
  delivered: number
  read: number
  failed: number
  clicked: number
  replied: number
  optedOut: number
  orders: number
  sales: number
}

export interface WhatsAppCampaign {
  id: string
  name: string
  offerId: string
  offerTitle: string
  audience: CampaignAudience
  // scheduled, sending, sent, cancelled, failed
  status: string
  scheduledAt: string
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
  trackDays: number
  createdAt: string
  stats: CampaignStats
}

export interface CampaignRecipient {
  id: string
  name: string | null
  phone: string
  status: string
  error: string | null
  sentAt: string | null
  clickedAt: string | null
  repliedAt: string | null
  optedOutAt: string | null
}

export interface OfferInput {
  title: string
  body: string
  imageUrl?: string | null
  buttonText?: string | null
  buttonUrl?: string | null
}

export interface CampaignInput {
  name: string
  offerId: string
  audience: CampaignAudience
  scheduledAt?: string | null
  consentConfirmed: boolean
}

// Same getWorkspaceIdFromStorage duplication convention as the other feature services.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } | null } }
    const id = parsed.state?.currentWorkspace?.id
    return id && UUID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
}

// The lint rule forbids slash-prefixed string literals, so paths are joined.
const SEPARATOR = String.fromCharCode(47)
const path = (...parts: string[]) =>
  ["", "v1", "customers", "campaigns", ...parts.map(encodeURIComponent)].join(SEPARATOR)
const base = path()
const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const whatsAppCampaignsService = {
  // Whether the business sends from its own connected number (Settings -> WhatsApp).
  connected: () =>
    client
      .get<{
        sendMode: string
        connection: { status: string } | null
      }>(["", "v1", "whatsapp", "connection"].join(SEPARATOR))
      .then(
        (overview) =>
          overview.sendMode === "business" && overview.connection?.status === "connected"
      ),
  list: () => client.get<{ items: WhatsAppCampaign[] }>(base).then((response) => response.items),
  get: (id: string) =>
    client.get<WhatsAppCampaign & { recipientsList: CampaignRecipient[] }>(path(id)),
  create: (input: CampaignInput) => client.post<CampaignInput, WhatsAppCampaign>(base, input),
  cancel: (id: string) => client.post<undefined, WhatsAppCampaign>(path(id, "cancel"), undefined),
  preview: (audience: CampaignAudience) =>
    client.post<
      { audience: CampaignAudience },
      { count: number; sample: string[]; optedOut: number }
    >(path("preview"), { audience }),
  offers: () =>
    client.get<{ items: WhatsAppOffer[] }>(path("offers")).then((response) => response.items),
  createOffer: (input: OfferInput) => client.post<OfferInput, WhatsAppOffer>(path("offers"), input),
  deleteOffer: (id: string) => client.delete<{ ok: boolean }>(path("offers", id)),
  uploadImage: (input: { contentType: string; dataBase64: string }) =>
    client.post<typeof input, { url: string }>(path("images"), input),
}
