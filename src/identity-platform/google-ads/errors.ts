import { IntegrationProviderError } from "../integrations/provider-error"

export class GoogleAdsIntegrationError extends IntegrationProviderError {
  constructor(
    message: string,
    public readonly code:
      | "GOOGLE_ADS_FORBIDDEN"
      | "GOOGLE_ADS_CONNECTION_NOT_FOUND"
      | "GOOGLE_ADS_CONNECTION_NOT_READY"
      | "GOOGLE_ADS_INVALID_CUSTOMER"
      | "GOOGLE_ADS_PERMISSION_DENIED"
      | "GOOGLE_ADS_QUOTA_EXCEEDED"
      | "GOOGLE_ADS_TRANSIENT_FAILURE"
      | "GOOGLE_ADS_PROVIDER_FAILURE"
      | "GOOGLE_ADS_TOKEN_UNAVAILABLE"
      | "GOOGLE_ADS_SYNC_IN_PROGRESS"
      | "GOOGLE_ADS_SYNC_FAILED",
    public readonly retryable: boolean = false,
    public readonly status: number = 400,
    public readonly details?: unknown
  ) {
    super(message, code, retryable, status, details)
  }
}

export function isGoogleAdsSyncInProgressError(error: unknown) {
  return error instanceof GoogleAdsIntegrationError && error.code === "GOOGLE_ADS_SYNC_IN_PROGRESS"
}

export function toGoogleAdsError(input: { status: number; body: string }) {
  if (input.status === 401 || input.status === 403) {
    return new GoogleAdsIntegrationError(
      "Google Ads permission denied.",
      "GOOGLE_ADS_PERMISSION_DENIED",
      false,
      403
    )
  }

  if (input.status === 404) {
    return new GoogleAdsIntegrationError(
      "Google Ads customer not found.",
      "GOOGLE_ADS_INVALID_CUSTOMER",
      false,
      404
    )
  }

  if (input.status === 429) {
    return new GoogleAdsIntegrationError(
      "Google Ads quota exceeded.",
      "GOOGLE_ADS_QUOTA_EXCEEDED",
      true,
      429
    )
  }

  if (input.status >= 500) {
    return new GoogleAdsIntegrationError(
      "Google Ads temporary failure.",
      "GOOGLE_ADS_TRANSIENT_FAILURE",
      true,
      503
    )
  }

  return new GoogleAdsIntegrationError(
    `Google Ads provider failure: ${input.body.slice(0, 120)}`,
    "GOOGLE_ADS_PROVIDER_FAILURE",
    false,
    502
  )
}
