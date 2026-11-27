import { createSign } from "node:crypto"

// Google Search Console, read with a service account (a "robot" Google account that Madar Admin
// added to the madar.my property with view access). Signs its own sign-in token with the key,
// so no Google sign-in screen or OAuth review is involved.

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const API_BASE = "https://www.googleapis.com/webmasters/v3"
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"

export interface ServiceAccountKey {
  client_email: string
  private_key: string
}

export interface SearchConsoleRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchConsoleFilter {
  dimension: "country" | "device" | "query" | "page"
  operator: "equals" | "includingRegex" | "contains"
  expression: string
}

export interface SearchConsoleQuery {
  startDate: string
  endDate: string
  dimensions?: Array<"date" | "query" | "page" | "country" | "device">
  filters?: SearchConsoleFilter[]
  rowLimit?: number
}

type Fetch = typeof fetch
type Json = Record<string, unknown>

// Reads the key Google gives as a JSON file; throws a plain reason when it isn't one.
export function parseServiceAccountKey(text: string): ServiceAccountKey {
  let parsed: Json
  try {
    parsed = JSON.parse(text) as Json
  } catch {
    throw new Error("The key isn't valid JSON. Paste the whole file Google downloaded.")
  }
  const email = typeof parsed.client_email === "string" ? parsed.client_email.trim() : ""
  const key = typeof parsed.private_key === "string" ? parsed.private_key : ""
  if (!email || !key.includes("PRIVATE KEY")) {
    throw new Error("This isn't a service account key (client_email / private_key are missing).")
  }
  return { client_email: email, private_key: key }
}

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")

export class SearchConsoleClient {
  private token: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly key: ServiceAccountKey,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = () => Date.now()
  ) {}

  private assertion(): string {
    const issuedAt = Math.floor(this.now() / 1000)
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    const claims = base64url(
      JSON.stringify({
        iss: this.key.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600,
      })
    )
    const signer = createSign("RSA-SHA256")
    signer.update(`${header}.${claims}`)
    return `${header}.${claims}.${base64url(signer.sign(this.key.private_key))}`
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) return this.token.value
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: this.assertion(),
      }).toString(),
    })
    const json = (await response.json().catch(() => ({}))) as Json
    if (!response.ok || typeof json.access_token !== "string") {
      throw new Error(
        String(json.error_description ?? json.error ?? "Google refused the service account key.")
      )
    }
    this.token = {
      value: json.access_token,
      expiresAt: this.now() + Number(json.expires_in ?? 3600) * 1000,
    }
    return json.access_token
  }

  private async call(path: string, init: RequestInit = {}): Promise<Json> {
    const response = await this.fetchImpl(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: `Bearer ${await this.accessToken()}`,
        "content-type": "application/json",
      },
    })
    const json = (await response.json().catch(() => ({}))) as Json
    if (!response.ok) {
      const error = (json.error ?? {}) as Json
      throw new Error(String(error.message ?? `Search Console answered ${response.status}.`))
    }
    return json
  }

  // The properties this robot can read.
  async sites(): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
    const json = await this.call("/sites")
    const entries = Array.isArray(json.siteEntry) ? (json.siteEntry as Json[]) : []
    return entries
      .map((entry) => ({
        siteUrl: String(entry.siteUrl ?? ""),
        permissionLevel: String(entry.permissionLevel ?? ""),
      }))
      .filter((entry) => entry.siteUrl && entry.permissionLevel !== "siteUnverifiedUser")
  }

  async query(siteUrl: string, query: SearchConsoleQuery): Promise<SearchConsoleRow[]> {
    const body: Json = {
      startDate: query.startDate,
      endDate: query.endDate,
      dimensions: query.dimensions ?? [],
      rowLimit: query.rowLimit ?? 1000,
    }
    if (query.filters?.length) body.dimensionFilterGroups = [{ filters: query.filters }]
    const json = await this.call(`/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    const rows = Array.isArray(json.rows) ? (json.rows as Json[]) : []
    return rows.map((row) => ({
      keys: Array.isArray(row.keys) ? (row.keys as unknown[]).map(String) : [],
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      position: Number(row.position ?? 0),
    }))
  }
}
