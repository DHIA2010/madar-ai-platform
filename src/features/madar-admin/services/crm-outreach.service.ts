import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// WhatsApp messages sent by hand from Madar Admin's CRM (/v1/platform-admin/crm/outreach/*).
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "platform-admin", "crm", "outreach"].join(PATH_SEPARATOR)
const at = (...parts: string[]) => [ENDPOINT, ...parts.map(encodeURIComponent)].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export interface OutreachCampaignInput {
  name: string
  message: string
  linkUrl: string
  linkTitle: string | null
  linkDescription: string | null
  imageUrl: string | null
  dailyLimit: number
}
export interface OutreachCampaign extends OutreachCampaignInput {
  id: string
  createdAt: string
  stats: {
    sent: number
    sentToday: number
    clicked: number
    clicks: number
    replied: number
    advanced: number
  }
}
export interface OutreachLead {
  leadId: string
  companyName: string
  contactName: string | null
  phone: string | null
  reachable: boolean
  stage: string
  source: string
  tags: string[]
  send: {
    sentAt: string
    sentBy: string | null
    clicks: number
    lastClickedAt: string | null
    repliedAt: string | null
  } | null
}
export type OutreachStatus = "pending" | "sent" | "all"

export const crmOutreachService = {
  async list(): Promise<OutreachCampaign[]> {
    return (await client.get<{ items: OutreachCampaign[] }>(ENDPOINT)).items
  },
  create(input: OutreachCampaignInput): Promise<OutreachCampaign> {
    return client.post(ENDPOINT, input)
  },
  update(id: string, input: OutreachCampaignInput): Promise<OutreachCampaign> {
    return client.put(at(id), input)
  },
  remove(id: string): Promise<{ ok: true }> {
    return client.delete(at(id))
  },
  leads(
    id: string,
    filter: { tag: string | null; source: string | null; status: OutreachStatus }
  ): Promise<{ items: OutreachLead[]; tags: string[]; pending: number }> {
    const query = new URLSearchParams({ status: filter.status })
    if (filter.tag) query.set("tag", filter.tag)
    if (filter.source) query.set("source", filter.source)
    return client.get(`${at(id, "leads")}?${query.toString()}`)
  },
  send(
    id: string,
    leadId: string
  ): Promise<{ message: string; phone: string; whatsappUrl: string; trackedUrl: string }> {
    return client.post(at(id, "leads", leadId, "send"), {})
  },
  undo(id: string, leadId: string): Promise<{ ok: true }> {
    return client.post(at(id, "leads", leadId, "undo"), {})
  },
  setReplied(id: string, leadId: string, replied: boolean): Promise<{ ok: true }> {
    return client.post(at(id, "leads", leadId, "replied"), { replied })
  },
  // The message's picture (PNG, JPG or WebP up to 5 MB): answers with its public address.
  async uploadImage(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ""
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    }
    return (
      await client.post<{ contentType: string; dataBase64: string }, { url: string }>(
        at("images"),
        { contentType: file.type, dataBase64: btoa(binary) }
      )
    ).url
  },
}
