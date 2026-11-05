// @vitest-environment node
//
// ZATCA's gateways: each device's calls go to the environment its CSR was made for, and a refusal
// carries ZATCA's own reason.

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  submitZatcaComplianceCsid,
  ZatcaApiError,
  zatcaErrorMessage,
} from "../zatca/zatca-api-client"

const CSR = "-----BEGIN CERTIFICATE REQUEST-----\nQUJD\n-----END CERTIFICATE REQUEST-----"

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ZATCA_API_BASE_URL
})

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("ZATCA gateways", () => {
  it.each([
    ["sandbox", "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance"],
    ["simulation", "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/compliance"],
    ["production", "https://gw-fatoora.zatca.gov.sa/e-invoicing/core/compliance"],
  ] as const)("sends a %s device's OTP to its own gateway", async (environment, url) => {
    const fetchMock = stubFetch(200, { binarySecurityToken: "T", secret: "S", requestID: 7 })
    await submitZatcaComplianceCsid(environment, CSR, "123345")
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "POST" }))
  })

  it("surfaces ZATCA's reason when it refuses", async () => {
    stubFetch(400, { errors: [{ code: "Invalid-OTP", message: "Invalid OTP" }] })
    const failure = await submitZatcaComplianceCsid("production", CSR, "000000").catch((e) => e)
    expect(failure).toBeInstanceOf(ZatcaApiError)
    expect(zatcaErrorMessage((failure as ZatcaApiError).body)).toBe("Invalid OTP")
    expect(zatcaErrorMessage({ message: "Not allowed" })).toBe("Not allowed")
    expect(zatcaErrorMessage(null)).toBeNull()
  })
})
