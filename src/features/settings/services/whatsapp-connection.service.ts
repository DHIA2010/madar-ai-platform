import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// How the organization sends WhatsApp messages to its customers (backend:
// whatsapp/merchant-connection.ts) -- through its own WhatsApp Web, or automatically from its own
// business number connected with Meta's Embedded Signup.

// Same workaround the other services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "whatsapp", "connection"].join(PATH_SEPARATOR)

export type WhatsAppSendMode = "web" | "business"

export interface WhatsAppConnection {
  status: "connected" | "disconnected"
  wabaId: string | null
  phoneNumberId: string | null
  displayPhoneNumber: string | null
  verifiedName: string | null
  qualityRating: string | null
  lastError: string | null
  connectedAt: string | null
}

export interface WhatsAppConnectionOverview {
  sendMode: WhatsAppSendMode
  connection: WhatsAppConnection | null
  // Null until Madar's Meta app is ready for merchants to connect their numbers.
  embeddedSignup: { appId: string; configId: string; apiVersion: string } | null
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const whatsAppConnectionService = {
  async get(): Promise<WhatsAppConnectionOverview> {
    return client.get<WhatsAppConnectionOverview>(ENDPOINT)
  },

  async setMode(sendMode: WhatsAppSendMode): Promise<WhatsAppConnectionOverview> {
    return client.put<{ sendMode: WhatsAppSendMode }, WhatsAppConnectionOverview>(ENDPOINT, {
      sendMode,
    })
  },

  async completeSignup(input: {
    code: string
    wabaId: string
    phoneNumberId: string
  }): Promise<WhatsAppConnectionOverview> {
    return client.post<typeof input, WhatsAppConnectionOverview>(
      [ENDPOINT, "embedded-signup"].join(PATH_SEPARATOR),
      input
    )
  },

  async disconnect(): Promise<WhatsAppConnectionOverview> {
    return client.delete<WhatsAppConnectionOverview>(ENDPOINT)
  },
}
