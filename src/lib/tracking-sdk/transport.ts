import type { ResolvedTrackingSdkConfiguration } from "./configuration"
import type {
  TrackingApiRequest,
  TrackingApiResponse,
  TrackingAuthMode,
  TrackingEndpointPath,
} from "./contracts"

export class Transport {
  constructor(
    private readonly config: ResolvedTrackingSdkConfiguration,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send<TResponse = unknown>(
    path: TrackingEndpointPath,
    payload: unknown,
    authMode: TrackingAuthMode = this.config.authMode
  ): Promise<TrackingApiResponse<TResponse>> {
    const body: TrackingApiRequest = {
      tenantId: this.config.tenantId,
      workspaceId: this.config.workspaceId,
      trackingKey: this.config.trackingKey,
      timestamp: new Date().toISOString(),
      payload,
    }

    const requestBody = JSON.stringify(body)
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-tracking-auth-mode": authMode,
    }

    if (authMode === "signed" && this.config.signatureProvider) {
      const signature = await this.config.signatureProvider(requestBody)
      headers["x-tracking-signature"] = signature
    }

    const url = `${this.config.apiUrl.replace(/\/$/, "")}${path}`

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: requestBody,
      })
    } catch (error) {
      throw new Error(`transport_failed:${String(error)}`)
    }

    const parsed = (await response.json()) as TrackingApiResponse<TResponse>

    if (!response.ok || !parsed.success) {
      throw new Error(parsed.error?.message ?? `tracking_api_error:${response.status}`)
    }

    return parsed
  }
}
