import { describe, expect, it, vi } from "vitest"

import { createApiClient } from "./http-client"

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("createApiClient onUnauthorized retry", () => {
  it("refreshes once and retries the request when the first attempt comes back 401", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "authorization_error" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    const onUnauthorized = vi.fn().mockResolvedValue(true)

    const client = createApiClient({ baseUrl: "https://api.test", fetchImpl, onUnauthorized })
    const result = await client.get<{ ok: boolean }>("/v1/thing")

    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it("surfaces the original 401 without retrying when refresh fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { code: "authorization_error" }))
    const onUnauthorized = vi.fn().mockResolvedValue(false)

    const client = createApiClient({ baseUrl: "https://api.test", fetchImpl, onUnauthorized })

    await expect(client.get("/v1/thing")).rejects.toMatchObject({ status: 401 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it("does not retry a second time if the retried request is also unauthorized", async () => {
    // mockImplementation (not mockResolvedValue) so each call gets its own Response instance --
    // a Response body can only be read once, and this path legitimately fetches twice.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(401, { code: "authorization_error" }))
    const onUnauthorized = vi.fn().mockResolvedValue(true)

    const client = createApiClient({ baseUrl: "https://api.test", fetchImpl, onUnauthorized })

    await expect(client.get("/v1/thing")).rejects.toMatchObject({ status: 401 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it("never calls onUnauthorized when the request succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    const onUnauthorized = vi.fn().mockResolvedValue(true)

    const client = createApiClient({ baseUrl: "https://api.test", fetchImpl, onUnauthorized })
    await client.get("/v1/thing")

    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it("does not retry a non-401 failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { code: "internal_error" }))
    const onUnauthorized = vi.fn().mockResolvedValue(true)

    const client = createApiClient({ baseUrl: "https://api.test", fetchImpl, onUnauthorized })

    await expect(client.get("/v1/thing")).rejects.toMatchObject({ status: 500 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
