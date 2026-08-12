// @vitest-environment node

import { describe, expect, it, vi } from "vitest"

import { MetaGraphApiClient } from "../meta-ads/client"
import { classifyMetaGraphApiError, requiredPermissionForEndpoint } from "../meta-ads/errors"
import { runMetaConnectionDiagnostics } from "../meta-ads/diagnostics"

const SECRET_TOKEN = "EAAtotally-secret-access-token-should-never-leak"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function metaError(code: number, message: string, extra: Record<string, unknown> = {}) {
  return { error: { message, type: "OAuthException", code, fbtrace_id: "AbCdEf123456", ...extra } }
}

describe("MetaGraphApiClient", () => {
  it("retries a transient 5xx and then succeeds", async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls === 1) return new Response("temporary", { status: 500 })
      return jsonResponse({ id: "1", name: "Test User" })
    })

    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 2, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    const result = await client.get("/me", { fields: "id,name" })
    expect(result).toEqual({ ok: true, data: { id: "1", name: "Test User" } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("never puts the access token in the request URL, only the Authorization header", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).not.toContain(SECRET_TOKEN)
      expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${SECRET_TOKEN}`)
      return jsonResponse({ id: "1", name: "Test User" })
    })

    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 0, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    await client.get("/me", { fields: "id,name" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("follows paging.next across multiple pages and strips any access_token it carries", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes("page=2")) {
        return jsonResponse({
          data: [{ id: "act_1", name: "Account 1", account_status: 1 }],
          paging: {
            next: "https://graph.facebook.com/v21.0/me/adaccounts?page=2&access_token=leaked",
          },
        })
      }
      expect(url).not.toContain("leaked")
      return jsonResponse({ data: [{ id: "act_2", name: "Account 2", account_status: 1 }] })
    })

    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 0, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    const result = await client.getAllPages<{ id: string }>("/me/adaccounts", {
      fields: "id,name,account_status",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(2)
      expect(result.data.map((row) => row.id)).toEqual(["act_1", "act_2"])
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("normalizes a Graph API OAuthException into a structured, non-retryable error detail", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(metaError(190, "Error validating access token", { error_subcode: 463 }), 401)
    )

    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 2, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    const result = await client.get("/me", { fields: "id,name" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.metaErrorCode).toBe(190)
      expect(result.error.errorSubcode).toBe(463)
      expect(result.error.httpStatus).toBe(401)
      expect(result.error.fbtraceId).toBe("AbCdEf123456")
      expect(result.error.likelyCause).toMatch(/expired/i)
      expect(JSON.stringify(result.error)).not.toContain(SECRET_TOKEN)
    }
    // 401/token-invalid is not retryable -- must not have retried.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("classifyMetaGraphApiError", () => {
  it("maps known permission error codes to a named required permission per endpoint", () => {
    const classification = classifyMetaGraphApiError({
      endpoint: "/me/businesses",
      httpStatus: 400,
      envelope: { code: 10, message: "permission denied" },
    })
    expect(classification.retryable).toBe(false)
    expect(requiredPermissionForEndpoint("/me/businesses")).toBe("business_management")
  })

  it("maps invalid-parameter code 100 to a wrong-ad-account-id style explanation", () => {
    const classification = classifyMetaGraphApiError({
      endpoint: "/act_123/campaigns",
      httpStatus: 400,
      envelope: { code: 100, message: "Invalid parameter" },
    })
    expect(classification.likelyCause).toMatch(/ad account/i)
  })

  it("maps subcode 33 (no access to object) distinctly from a generic 190", () => {
    const classification = classifyMetaGraphApiError({
      endpoint: "/act_999/campaigns",
      httpStatus: 400,
      envelope: { code: 200, error_subcode: 33, message: "not found" },
    })
    expect(classification.likelyCause).toMatch(/wrong ad account id|no access/i)
  })

  it("falls back to an explicit 'unrecognized' classification instead of guessing", () => {
    const classification = classifyMetaGraphApiError({
      endpoint: "/act_1/campaigns",
      httpStatus: 400,
      envelope: { code: 999999, message: "something new" },
    })
    expect(classification.likelyCause).toMatch(/unrecognized/i)
  })
})

describe("runMetaConnectionDiagnostics", () => {
  it("returns connection:false and stops at step 1 when the token itself is invalid", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(metaError(190, "Invalid OAuth access token"), 401)
    )
    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 0, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    const result = await runMetaConnectionDiagnostics(client)
    expect(result.connection).toBe(false)
    expect(result.user).toBeNull()
    expect(result.ad_accounts).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].metaErrorCode).toBe(190)
    // Only /me was ever called -- no point calling /me/adaccounts with a dead token.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("returns connection:true with a top-level error when /me/adaccounts itself fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/me/adaccounts")) {
        return jsonResponse(metaError(10, "App does not have permission for ads_read"), 400)
      }
      return jsonResponse({ id: "1", name: "Test User" })
    })
    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 0, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    const result = await runMetaConnectionDiagnostics(client)
    expect(result.connection).toBe(true)
    expect(result.user).toEqual({ id: "1", name: "Test User" })
    expect(result.ad_accounts).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].endpoint).toBe("/me/adaccounts")
    expect(result.errors[0].requiredPermission).toBe("ads_read or ads_management")
  })

  it("continues testing every remaining endpoint after one fails, per-account", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/me/adaccounts")) {
        return jsonResponse({
          data: [{ id: "act_111", name: "Account One", account_status: 1 }],
        })
      }
      if (url.includes("/me")) return jsonResponse({ id: "1", name: "Test User" })
      if (url.includes("/act_111/campaigns")) {
        return jsonResponse({ data: [{ id: "c1", name: "Campaign 1", status: "ACTIVE" }] })
      }
      if (url.includes("/act_111/adsets")) {
        // Simulate exactly the reported symptom: campaigns work but a sibling call OAuthExceptions.
        return jsonResponse(metaError(200, "Permissions error"), 400)
      }
      if (url.includes("/act_111/ads")) {
        return jsonResponse({ data: [{ id: "ad1", name: "Ad 1", status: "ACTIVE" }] })
      }
      if (url.includes("/act_111/insights")) {
        return jsonResponse(metaError(100, "Invalid parameter"), 400)
      }
      throw new Error(`unexpected request: ${url}`)
    })

    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 0, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    const result = await runMetaConnectionDiagnostics(client)
    expect(result.connection).toBe(true)
    expect(result.ad_accounts).toHaveLength(1)

    const account = result.ad_accounts[0]
    expect(account.id).toBe("act_111")
    expect(account.campaigns_access).toBe(true)
    expect(account.adsets_access).toBe(false)
    expect(account.ads_access).toBe(true)
    expect(account.insights_access).toBe(false)
    expect(account.errors).toHaveLength(2)
    expect(account.errors.map((e) => e.endpoint)).toEqual(["/act_111/adsets", "/act_111/insights"])

    // All 6 calls happened despite the two failures in between -- nothing short-circuited.
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(JSON.stringify(result)).not.toContain(SECRET_TOKEN)
  })

  it("produces the exact top-level shape requested: connection, user, ad_accounts[]", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/me/adaccounts")) {
        return jsonResponse({ data: [{ id: "act_1", name: "Acc", account_status: 1 }] })
      }
      if (url.includes("/me")) return jsonResponse({ id: "u1", name: "User One" })
      return jsonResponse({ data: [] })
    })
    const client = new MetaGraphApiClient(
      SECRET_TOKEN,
      { apiBaseUrl: "https://graph.facebook.com/v21.0", maxRetries: 0, minRequestIntervalMs: 0 },
      fetchMock as unknown as typeof fetch
    )

    const result = await runMetaConnectionDiagnostics(client)
    expect(result).toMatchObject({
      connection: true,
      user: { id: "u1", name: "User One" },
      ad_accounts: [
        {
          id: "act_1",
          name: "Acc",
          account_status: 1,
          campaigns_access: true,
          adsets_access: true,
          ads_access: true,
          insights_access: true,
          errors: [],
        },
      ],
    })
  })
})
