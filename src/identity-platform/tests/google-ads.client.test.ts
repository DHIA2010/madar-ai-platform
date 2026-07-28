// @vitest-environment node

import { describe, expect, it, vi } from "vitest"

import { GoogleAdsClient } from "../google-ads/client"
import { GoogleAdsIntegrationError } from "../google-ads/errors"

describe("google ads client", () => {
  it("handles pagination and retries transient errors", async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return new Response("temporary", { status: 500 })
      }

      if (calls === 2) {
        return new Response(JSON.stringify({ results: [{ a: 1 }], nextPageToken: "next" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      return new Response(JSON.stringify({ results: [{ b: 2 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const client = new GoogleAdsClient(
      {
        async getAccessToken() {
          return "token"
        },
      },
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        developerToken: "dev-token",
        maxRetries: 2,
        minRequestIntervalMs: 0,
      },
      fetchMock as unknown as typeof fetch
    )

    const rows = await client.queryAllRows({
      connectionId: "conn",
      customerId: "123",
      query: "SELECT campaign.id FROM campaign",
    })

    expect(rows).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("maps quota exceeded and invalid customer errors", async () => {
    const client = new GoogleAdsClient(
      {
        async getAccessToken() {
          return "token"
        },
      },
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        developerToken: "dev-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch
    )

    await expect(
      client.queryAllRows({
        connectionId: "conn",
        customerId: "123",
        query: "SELECT campaign.id FROM campaign",
      })
    ).rejects.toMatchObject({
      code: "GOOGLE_ADS_QUOTA_EXCEEDED",
    } satisfies Partial<GoogleAdsIntegrationError>)

    const notFoundClient = new GoogleAdsClient(
      {
        async getAccessToken() {
          return "token"
        },
      },
      {
        apiBaseUrl: "https://googleads.googleapis.com/v17",
        developerToken: "dev-token",
        maxRetries: 0,
        minRequestIntervalMs: 0,
      },
      (async () => new Response("not-found", { status: 404 })) as unknown as typeof fetch
    )

    await expect(
      notFoundClient.queryAllRows({
        connectionId: "conn",
        customerId: "missing",
        query: "SELECT campaign.id FROM campaign",
      })
    ).rejects.toMatchObject({
      code: "GOOGLE_ADS_INVALID_CUSTOMER",
    } satisfies Partial<GoogleAdsIntegrationError>)
  })
})
