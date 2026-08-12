import { IntegrationProviderError } from "../integrations/provider-error"

export class MetaAdsIntegrationError extends IntegrationProviderError {
  constructor(
    message: string,
    public readonly code:
      | "META_ADS_TOKEN_MISSING"
      | "META_ADS_TOKEN_INVALID"
      | "META_ADS_PERMISSION_DENIED"
      | "META_ADS_INVALID_PARAMETER"
      | "META_ADS_RATE_LIMITED"
      | "META_ADS_TRANSIENT_FAILURE"
      | "META_ADS_PROVIDER_FAILURE",
    public readonly retryable: boolean = false,
    public readonly status: number = 400,
    public readonly details?: unknown
  ) {
    super(message, code, retryable, status, details)
  }
}

// Meta's Graph API error envelope: { error: { message, type, code, error_subcode, fbtrace_id } }.
// Codes below are Meta's own documented values (developers.facebook.com/docs/graph-api/guides/error-handling),
// not guesses -- kept as a lookup table so the "likely cause" in a diagnostic result is traceable to a real,
// citable meaning rather than an inference from HTTP status alone (Graph API returns 400 for most error kinds).
export interface MetaGraphApiErrorEnvelope {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

export interface MetaErrorClassification {
  likelyCause: string
  requiredPermission: string | null
  retryable: boolean
}

const KNOWN_ERROR_CODES: Record<number, MetaErrorClassification> = {
  190: {
    likelyCause:
      "The access token is invalid, malformed, expired, or was revoked (e.g. password change, app removed, or a short-lived token that already expired). This is a token-type/lifecycle problem, not a permissions problem.",
    requiredPermission: null,
    retryable: false,
  },
  102: {
    likelyCause: "Session key issue -- the access token's session is no longer valid.",
    requiredPermission: null,
    retryable: false,
  },
  2500: {
    likelyCause: "The access token is malformed or was not URL-safe/base64-decodable.",
    requiredPermission: null,
    retryable: false,
  },
  200: {
    likelyCause:
      "Permissions error: the token was not granted the permission this endpoint requires, or the granted permission has not passed App Review for Advanced Access.",
    requiredPermission: null,
    retryable: false,
  },
  10: {
    likelyCause:
      "The app does not have permission for this action -- usually a missing or non-approved permission (ads_read, ads_management, or business_management) on the token or the app.",
    requiredPermission: null,
    retryable: false,
  },
  100: {
    likelyCause:
      "Invalid parameter -- most commonly a malformed or wrong ad account id (missing the 'act_' prefix, or an id the caller has no role on), an unsupported field name, or a bad query parameter.",
    requiredPermission: null,
    retryable: false,
  },
  3: {
    likelyCause:
      "Unknown/unsupported method -- usually the wrong endpoint path or an unsupported Graph API version.",
    requiredPermission: null,
    retryable: false,
  },
  17: {
    likelyCause:
      "User request limit reached -- too many API calls for this user in the current window.",
    requiredPermission: null,
    retryable: true,
  },
  4: {
    likelyCause: "Application request limit reached (app-level rate limiting).",
    requiredPermission: null,
    retryable: true,
  },
  32: {
    likelyCause: "Page request limit reached.",
    requiredPermission: null,
    retryable: true,
  },
  613: {
    likelyCause: "Custom rate limit hit for this ad account or endpoint.",
    requiredPermission: null,
    retryable: true,
  },
  80004: {
    likelyCause: "Ad account-level rate limit -- too many calls against this specific ad account.",
    requiredPermission: null,
    retryable: true,
  },
}

// error_subcode refinements for the generic 190/200/10 buckets above -- Meta uses these to
// distinguish "token expired" from "no access to this object" from "app not live" cases.
const KNOWN_SUBCODES: Record<number, MetaErrorClassification> = {
  458: {
    likelyCause:
      "The user has not authorized the application, or de-authorized it after granting access.",
    requiredPermission: null,
    retryable: false,
  },
  459: {
    likelyCause: "The user needs to log into Facebook again -- their session has been invalidated.",
    requiredPermission: null,
    retryable: false,
  },
  460: {
    likelyCause:
      "The user's password (or session) changed and the token was invalidated as a result.",
    requiredPermission: null,
    retryable: false,
  },
  463: {
    likelyCause:
      "The access token has expired. A new token (or a refreshed long-lived token) is required.",
    requiredPermission: null,
    retryable: false,
  },
  464: {
    likelyCause: "The user is not a confirmed Facebook user and cannot be used with this token.",
    requiredPermission: null,
    retryable: false,
  },
  467: {
    likelyCause:
      "The access token is invalid because the app is no longer installed for the user, or was reset.",
    requiredPermission: null,
    retryable: false,
  },
  33: {
    likelyCause:
      "The requested object either does not exist, or the token's user has no role on it -- for an ad account this almost always means: wrong ad account id, or the user genuinely has no access to that account in Business Manager.",
    requiredPermission: null,
    retryable: false,
  },
}

// Which Graph permission each endpoint actually requires, so a permission-shaped error can name
// the exact scope to grant instead of a vague "check permissions" message.
const ENDPOINT_REQUIRED_PERMISSION: Record<string, string> = {
  "/me": "public_profile (default -- no ads scope needed)",
  "/me/adaccounts": "ads_read or ads_management",
  "/me/businesses": "business_management",
  "/campaigns": "ads_read or ads_management",
  "/adsets": "ads_read or ads_management",
  "/ads": "ads_read or ads_management",
  "/insights": "ads_read or ads_management",
}

export function requiredPermissionForEndpoint(endpoint: string): string | null {
  // Longest key first -- "/me" is a substring of "/me/businesses" and "/me/adaccounts", so a
  // naive first-match would always resolve to the generic "/me" entry.
  const match = Object.keys(ENDPOINT_REQUIRED_PERMISSION)
    .sort((a, b) => b.length - a.length)
    .find((suffix) => endpoint.includes(suffix))
  return match ? ENDPOINT_REQUIRED_PERMISSION[match] : null
}

export function classifyMetaGraphApiError(input: {
  endpoint: string
  httpStatus: number
  envelope: MetaGraphApiErrorEnvelope | null
}): MetaErrorClassification {
  const { envelope } = input
  const subcode = envelope?.error_subcode
  if (typeof subcode === "number" && KNOWN_SUBCODES[subcode]) {
    return {
      ...KNOWN_SUBCODES[subcode],
      requiredPermission: requiredPermissionForEndpoint(input.endpoint),
    }
  }

  const code = envelope?.code
  if (typeof code === "number" && KNOWN_ERROR_CODES[code]) {
    return {
      ...KNOWN_ERROR_CODES[code],
      requiredPermission: requiredPermissionForEndpoint(input.endpoint),
    }
  }

  if (input.httpStatus === 401 || input.httpStatus === 403) {
    return {
      likelyCause:
        "HTTP-level authorization failure with no recognized Meta error code -- treat as a token or permission problem and inspect fbtrace_id with Meta support if it recurs.",
      requiredPermission: requiredPermissionForEndpoint(input.endpoint),
      retryable: false,
    }
  }

  if (input.httpStatus >= 500) {
    return {
      likelyCause: "Meta's Graph API returned a server-side error; this is usually transient.",
      requiredPermission: null,
      retryable: true,
    }
  }

  return {
    likelyCause:
      "Unrecognized error shape -- no documented Meta error code matched. Inspect the fbtrace_id with Meta support.",
    requiredPermission: requiredPermissionForEndpoint(input.endpoint),
    retryable: false,
  }
}

export function toMetaAdsError(input: {
  endpoint: string
  httpStatus: number
  envelope: MetaGraphApiErrorEnvelope | null
}): MetaAdsIntegrationError {
  const classification = classifyMetaGraphApiError(input)

  if (input.httpStatus === 401 || input.envelope?.code === 190 || input.envelope?.code === 2500) {
    return new MetaAdsIntegrationError(
      input.envelope?.message ?? "Meta access token is invalid.",
      "META_ADS_TOKEN_INVALID",
      false,
      401,
      { classification }
    )
  }

  if (input.envelope?.code === 200 || input.envelope?.code === 10 || input.httpStatus === 403) {
    return new MetaAdsIntegrationError(
      input.envelope?.message ?? "Meta permission denied.",
      "META_ADS_PERMISSION_DENIED",
      false,
      403,
      { classification }
    )
  }

  if (input.envelope?.code === 100 || input.envelope?.code === 3) {
    return new MetaAdsIntegrationError(
      input.envelope?.message ?? "Meta rejected an invalid parameter.",
      "META_ADS_INVALID_PARAMETER",
      false,
      400,
      { classification }
    )
  }

  if (classification.retryable) {
    return new MetaAdsIntegrationError(
      input.envelope?.message ?? "Meta rate limit or transient failure.",
      input.httpStatus >= 500 ? "META_ADS_TRANSIENT_FAILURE" : "META_ADS_RATE_LIMITED",
      true,
      input.httpStatus >= 500 ? 503 : 429,
      { classification }
    )
  }

  return new MetaAdsIntegrationError(
    input.envelope?.message ?? `Meta Graph API provider failure (status ${input.httpStatus}).`,
    "META_ADS_PROVIDER_FAILURE",
    false,
    502,
    { classification }
  )
}
