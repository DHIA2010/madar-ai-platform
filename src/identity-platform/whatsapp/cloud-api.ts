// Thin client for Meta's Graph API -- the WhatsApp Business Platform's Cloud API, called directly
// (no third-party provider). Every call takes the access token and the API version to use (the
// one in Madar's WhatsApp secret, e.g. "v26.0").
export const DEFAULT_GRAPH_API_VERSION = "v26.0"

export interface GraphAuth {
  token: string
  version?: string
}

function graphBaseUrl(version?: string): string {
  const pinned = (version || DEFAULT_GRAPH_API_VERSION).trim()
  return `https://graph.facebook.com/${pinned.startsWith("v") ? pinned : `v${pinned}`}`
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message)
    this.name = "WhatsAppApiError"
  }
}

// Meta's own explanation of a refused call.
export function whatsAppErrorMessage(body: unknown): string | null {
  const error = (body as { error?: { message?: string; error_user_msg?: string } } | null)?.error
  return error?.error_user_msg || error?.message || null
}

export async function graphRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  auth: GraphAuth,
  params: Record<string, unknown> = {}
): Promise<T> {
  const url = new URL(`${graphBaseUrl(auth.version)}${path}`)
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${auth.token}` } }
  if (method === "GET" || method === "DELETE") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" }
    init.body = JSON.stringify(params)
  }
  const response = await fetch(url, init)
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON error page -- surfaced as is.
  }
  if (!response.ok) {
    throw new WhatsAppApiError(
      whatsAppErrorMessage(parsed) ?? `Meta API request to ${path} failed (${response.status})`,
      response.status,
      parsed
    )
  }
  return parsed as T
}

export interface WhatsAppPhoneNumber {
  id: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
  code_verification_status?: string
  name_status?: string
  messaging_limit_tier?: string
  status?: string
}

export function listPhoneNumbers(wabaId: string, auth: GraphAuth) {
  return graphRequest<{ data: WhatsAppPhoneNumber[] }>(
    "GET",
    `/${encodeURIComponent(wabaId)}/phone_numbers`,
    auth,
    {
      fields:
        "display_phone_number,verified_name,quality_rating,code_verification_status,name_status,messaging_limit_tier,status",
    }
  )
}

export function getWhatsAppBusinessAccount(wabaId: string, auth: GraphAuth) {
  return graphRequest<{ id: string; name?: string; account_review_status?: string }>(
    "GET",
    `/${encodeURIComponent(wabaId)}`,
    auth,
    { fields: "id,name,account_review_status" }
  )
}

// Who the token belongs to (the System User).
export function getTokenOwner(auth: GraphAuth) {
  return graphRequest<{ id: string; name?: string }>("GET", "/me", auth, { fields: "id,name" })
}

export function getTokenPermissions(auth: GraphAuth) {
  return graphRequest<{ data: Array<{ permission: string; status: string }> }>(
    "GET",
    "/me/permissions",
    auth
  )
}

// What Meta knows about a token: its kind (SYSTEM_USER, USER...), when it expires (0 = never) and
// its scopes. Asked with the app access token.
export function debugToken(input: {
  appId: string
  appSecret: string
  token: string
  version?: string
}) {
  return graphRequest<{
    data: { type?: string; is_valid?: boolean; expires_at?: number; scopes?: string[] }
  }>(
    "GET",
    "/debug_token",
    { token: `${input.appId}|${input.appSecret}`, version: input.version },
    { input_token: input.token }
  )
}

// Points the app's WhatsApp webhook at Madar (App Dashboard -> WhatsApp -> Configuration does the
// same). Needs the app access token ("<app id>|<app secret>").
export function subscribeAppWebhook(input: {
  appId: string
  appSecret: string
  callbackUrl: string
  verifyToken: string
  version?: string
}) {
  return graphRequest<{ success: boolean }>(
    "POST",
    `/${encodeURIComponent(input.appId)}/subscriptions`,
    { token: `${input.appId}|${input.appSecret}`, version: input.version },
    {
      object: "whatsapp_business_account",
      callback_url: input.callbackUrl,
      verify_token: input.verifyToken,
      fields: "messages,message_template_status_update",
    }
  )
}

// Makes a WhatsApp Business Account send its events to the app's webhook.
export function subscribeWabaToApp(wabaId: string, auth: GraphAuth) {
  return graphRequest<{ success: boolean }>(
    "POST",
    `/${encodeURIComponent(wabaId)}/subscribed_apps`,
    auth
  )
}

// Embedded Signup hands the browser a short-lived code; Madar swaps it (with the app secret) for
// the business token that acts on the merchant's own WhatsApp account.
export function exchangeSignupCode(input: {
  appId: string
  appSecret: string
  code: string
  version?: string
}) {
  return graphRequest<{ access_token: string; token_type?: string }>(
    "GET",
    "/oauth/access_token",
    { token: `${input.appId}|${input.appSecret}`, version: input.version },
    { client_id: input.appId, client_secret: input.appSecret, code: input.code }
  )
}

// Turns a number on for the Cloud API. The 6-digit pin becomes its two-step verification pin.
export function registerPhoneNumber(phoneNumberId: string, pin: string, auth: GraphAuth) {
  return graphRequest<{ success: boolean }>(
    "POST",
    `/${encodeURIComponent(phoneNumberId)}/register`,
    auth,
    { messaging_product: "whatsapp", pin }
  )
}

export function getPhoneNumber(phoneNumberId: string, auth: GraphAuth) {
  return graphRequest<WhatsAppPhoneNumber>("GET", `/${encodeURIComponent(phoneNumberId)}`, auth, {
    fields: "display_phone_number,verified_name,quality_rating,name_status,messaging_limit_tier",
  })
}
