// Thin HTTP client for ZATCA's own onboarding/submission APIs. Base URL is configurable (env)
// rather than hardcoded per environment -- the sandbox URL below is what this session's research
// consistently found across multiple sources for the Integration Sandbox developer portal; it was
// not independently confirmed by an actual authenticated call (that needs the OTP the user
// doesn't have yet -- see zatca-devices-service.ts), so it's worth re-checking against ZATCA's
// current developer portal docs before the first real onboarding attempt.
const DEFAULT_BASE_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal"

function resolveBaseUrl(): string {
  return (process.env.ZATCA_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "")
}

export class ZatcaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message)
    this.name = "ZatcaApiError"
  }
}

async function postJson(
  path: string,
  body: unknown,
  headers: Record<string, string>
): Promise<unknown> {
  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // ZATCA can return a non-JSON body on some error paths -- surface the raw text instead of
    // throwing a confusing JSON-parse error over a real API error.
  }
  if (!response.ok) {
    throw new ZatcaApiError(
      `ZATCA API request to ${path} failed (${response.status})`,
      response.status,
      parsed
    )
  }
  return parsed
}

export interface ZatcaComplianceCsidResult {
  binarySecurityToken: string
  secret: string
  requestId: string
}

// Step 2 of onboarding -- the one call this whole feature is gated behind: needs a real OTP from
// the taxpayer's own Fatoora portal account (never something this app can obtain itself).
export async function submitZatcaComplianceCsid(
  csrPem: string,
  otp: string
): Promise<ZatcaComplianceCsidResult> {
  const csrBase64 = csrPem
    .replace(/-----BEGIN CERTIFICATE REQUEST-----/, "")
    .replace(/-----END CERTIFICATE REQUEST-----/, "")
    .replace(/\s/g, "")
  const result = (await postJson(
    "/compliance",
    { csr: csrBase64 },
    { OTP: otp, "Accept-Version": "V2" }
  )) as { binarySecurityToken?: string; secret?: string; requestID?: string }
  if (!result.binarySecurityToken || !result.secret) {
    throw new ZatcaApiError("ZATCA compliance CSID response missing token/secret", 502, result)
  }
  return {
    binarySecurityToken: result.binarySecurityToken,
    secret: result.secret,
    requestId: result.requestID ?? "",
  }
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export interface ZatcaComplianceCheckResult {
  status: string
  raw: unknown
}

// Step 3 -- submit a signed sample invoice for validation. Called once per required test case
// (ZATCA specifies a fixed set of sample invoices/notes to run through this before Production
// CSID is granted); the caller runs this in a loop per zatca-devices-service.ts.
export async function submitZatcaComplianceCheck(
  invoiceHashBase64: string,
  uuid: string,
  signedInvoiceBase64: string,
  credentials: { binarySecurityToken: string; secret: string }
): Promise<ZatcaComplianceCheckResult> {
  const result = await postJson(
    "/compliance/invoices",
    { invoiceHash: invoiceHashBase64, uuid, invoice: signedInvoiceBase64 },
    {
      Authorization: basicAuthHeader(credentials.binarySecurityToken, credentials.secret),
      "Accept-Version": "V2",
    }
  )
  return {
    status: (result as { clearanceStatus?: string })?.clearanceStatus ?? "UNKNOWN",
    raw: result,
  }
}

export interface ZatcaProductionCsidResult {
  binarySecurityToken: string
  secret: string
}

// Step 4 -- exchange the compliance credentials for real Production ones, once every required
// Compliance Check has passed.
export async function exchangeZatcaProductionCsid(
  complianceRequestId: string,
  credentials: { binarySecurityToken: string; secret: string }
): Promise<ZatcaProductionCsidResult> {
  const result = (await postJson(
    "/production/csids",
    { compliance_request_id: complianceRequestId },
    {
      Authorization: basicAuthHeader(credentials.binarySecurityToken, credentials.secret),
      "Accept-Version": "V2",
    }
  )) as { binarySecurityToken?: string; secret?: string }
  if (!result.binarySecurityToken || !result.secret) {
    throw new ZatcaApiError("ZATCA production CSID response missing token/secret", 502, result)
  }
  return { binarySecurityToken: result.binarySecurityToken, secret: result.secret }
}

export interface ZatcaReportingResult {
  status: string
  raw: unknown
  // Tag 9 -- ZATCA's own cryptographic stamp signature -- only present when the Reporting
  // response actually includes it (base64). See zatca-qr-code.ts's appendZatcaStampTag.
  stampSignatureBase64: string | null
}

// The real Reporting call -- POST .../invoices/reporting/single. Only ever called manually from
// InvoicesPage.tsx's "الإبلاغ إلى الهيئة" action (see the plan), never automatically at checkout.
export async function submitZatcaReporting(
  invoiceHashBase64: string,
  uuid: string,
  signedInvoiceBase64: string,
  credentials: { binarySecurityToken: string; secret: string }
): Promise<ZatcaReportingResult> {
  const result = await postJson(
    "/invoices/reporting/single",
    { invoiceHash: invoiceHashBase64, uuid, invoice: signedInvoiceBase64 },
    {
      Authorization: basicAuthHeader(credentials.binarySecurityToken, credentials.secret),
      "Accept-Version": "V2",
      "Accept-Language": "en",
    }
  )
  const typed = result as {
    reportingStatus?: string
    validationResults?: { warningMessages?: Array<{ stampSignature?: string }> }
  }
  return {
    status: typed.reportingStatus ?? "UNKNOWN",
    raw: result,
    stampSignatureBase64: typed.validationResults?.warningMessages?.[0]?.stampSignature ?? null,
  }
}
