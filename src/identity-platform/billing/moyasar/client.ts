import type { MoyasarPaymentObject } from "./types"

const MOYASAR_API_BASE_URL = "https://api.moyasar.com/v1"

export class MoyasarApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = "MoyasarApiError"
  }
}

// Moyasar auth is HTTP Basic with the secret key as the username and an empty password --
// https://docs.moyasar.com/api/api-introduction#authentication. Secret-key only: this client is
// never given the publishable key, which the frontend uses directly against Moyasar's hosted
// widget and never passes through this backend.
export class MoyasarApiClient {
  constructor(private readonly secretKey: string) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`
  }

  async fetchPayment(moyasarPaymentId: string): Promise<MoyasarPaymentObject> {
    const response = await fetch(`${MOYASAR_API_BASE_URL}/payments/${moyasarPaymentId}`, {
      headers: { Authorization: this.authHeader() },
    })
    const body = (await response.json()) as MoyasarPaymentObject & { message?: string }
    if (!response.ok) {
      throw new MoyasarApiError(body.message ?? "Moyasar payment lookup failed.", response.status)
    }
    return body
  }
}
