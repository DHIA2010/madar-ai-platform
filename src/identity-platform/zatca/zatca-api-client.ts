import type { ZatcaCsrEnvironment } from "./zatca-crypto"

// Thin HTTP client for ZATCA's onboarding/submission APIs. Each environment has its own gateway:
// the developer sandbox (fixed test OTP 123345), the simulation (OTP from the Fatoora simulation
// portal) and production ("core", OTP from the real Fatoora portal). A device's calls must go to
// the environment its CSR was made for. ZATCA_API_BASE_URL, when set, overrides all of them.
const GATEWAY = "https://gw-fatoora.zatca.gov.sa/e-invoicing"
const BASE_URL: Record<ZatcaCsrEnvironment, string> = {
  sandbox: `${GATEWAY}/developer-portal`,
  simulation: `${GATEWAY}/simulation`,
  production: `${GATEWAY}/core`,
}

function resolveBaseUrl(environment: ZatcaCsrEnvironment): string {
  return (process.env.ZATCA_API_BASE_URL || BASE_URL[environment]).replace(/\/$/, "")
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

// ZATCA answers business rules (BR-...) in Arabic when asked, but its technical checks only ever
// in English -- Madar's own Arabic wording for those.
const TECHNICAL_REASON_AR: Record<string, string> = {
  "certificate-permissions": "الرقم الضريبي في الفاتورة لا يطابق الرقم الضريبي في شهادة الجهاز.",
  "signed-properties-hashing":
    "توقيع الفاتورة لا يطابق شهادة الجهاز (بصمة الخصائص الموقّعة غير صحيحة).",
  "invalid-invoice-hash": "بصمة الفاتورة (Hash) غير صحيحة.",
  invoiceHash_QRCODE_INVALID: "بصمة الفاتورة في رمز QR غير صحيحة.",
  QRCODE_INVALID: "رمز الاستجابة السريعة (QR) في الفاتورة غير صحيح.",
  XSD_ZATCA_INVALID: "بنية ملف الفاتورة (XML) لا تطابق مواصفات الهيئة.",
  "signature-validation": "التوقيع الرقمي للفاتورة غير صحيح.",
  "certificate-issuer-name": "اسم جهة إصدار الشهادة في الفاتورة غير صحيح.",
  "certificate-serial-number": "الرقم التسلسلي للشهادة في الفاتورة غير صحيح.",
  "certificate-expired": "انتهت صلاحية شهادة الجهاز.",
}

// ZATCA's own explanation of a refused request, in whichever of its shapes it came back. With
// "ar", technical reasons are replaced by Madar's Arabic wording (business rules already come
// back in Arabic when the request asked for it).
export function zatcaErrorMessage(body: unknown, language: "en" | "ar" = "en"): string | null {
  if (!body) return null
  if (typeof body === "string") return body.trim().slice(0, 300) || null
  const typed = body as {
    message?: string
    errors?: Array<{ message?: string; code?: string } | string>
    validationResults?: { errorMessages?: Array<{ message?: string; code?: string }> }
  }
  const fromErrors = typed.errors
    ?.map((entry) => (typeof entry === "string" ? entry : (entry.message ?? entry.code)))
    .filter(Boolean)
    .join(" — ")
  const fromValidation = typed.validationResults?.errorMessages
    ?.map((entry) =>
      language === "ar" && entry.code && TECHNICAL_REASON_AR[entry.code]
        ? TECHNICAL_REASON_AR[entry.code]
        : entry.message
    )
    .filter(Boolean)
    .join(" — ")
  return fromErrors || fromValidation || typed.message || null
}

async function postJson(
  environment: ZatcaCsrEnvironment,
  path: string,
  body: unknown,
  headers: Record<string, string>
): Promise<unknown> {
  const response = await fetch(`${resolveBaseUrl(environment)}${path}`, {
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
    console.error("zatca.request_refused", {
      environment,
      path,
      status: response.status,
      // Whole, so nested validation messages aren't collapsed to "[Array]" in the logs.
      body: (typeof parsed === "string" ? parsed : JSON.stringify(parsed)).slice(0, 4000),
    })
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
  environment: ZatcaCsrEnvironment,
  csrPem: string,
  otp: string
): Promise<ZatcaComplianceCsidResult> {
  // ZATCA wants the whole PEM file (headers included) base64-encoded -- not the bare DER base64
  // inside it, which it refuses as "Invalid Request".
  const pem = csrPem.trim().endsWith("-----") ? `${csrPem.trim()}\n` : csrPem
  const csrBase64 = Buffer.from(pem, "utf8").toString("base64")
  const result = (await postJson(
    environment,
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
  environment: ZatcaCsrEnvironment,
  invoiceHashBase64: string,
  uuid: string,
  signedInvoiceBase64: string,
  credentials: { binarySecurityToken: string; secret: string },
  // The language ZATCA words its validation messages in.
  language: "en" | "ar" = "en"
): Promise<ZatcaComplianceCheckResult> {
  const result = await postJson(
    environment,
    "/compliance/invoices",
    { invoiceHash: invoiceHashBase64, uuid, invoice: signedInvoiceBase64 },
    {
      Authorization: basicAuthHeader(credentials.binarySecurityToken, credentials.secret),
      "Accept-Version": "V2",
      "Accept-Language": language,
    }
  )
  return {
    // Simplified invoices are reported (not cleared): their verdict is reportingStatus.
    status:
      (result as { reportingStatus?: string; clearanceStatus?: string })?.reportingStatus ??
      (result as { clearanceStatus?: string })?.clearanceStatus ??
      "UNKNOWN",
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
  environment: ZatcaCsrEnvironment,
  complianceRequestId: string,
  credentials: { binarySecurityToken: string; secret: string }
): Promise<ZatcaProductionCsidResult> {
  const result = (await postJson(
    environment,
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

// The real Reporting call -- POST .../invoices/reporting/single. See pos/zatca-reporting.ts.
export async function submitZatcaReporting(
  environment: ZatcaCsrEnvironment,
  invoiceHashBase64: string,
  uuid: string,
  signedInvoiceBase64: string,
  credentials: { binarySecurityToken: string; secret: string },
  // The language ZATCA words its validation messages in.
  language: "en" | "ar" = "en"
): Promise<ZatcaReportingResult> {
  const result = await postJson(
    environment,
    "/invoices/reporting/single",
    { invoiceHash: invoiceHashBase64, uuid, invoice: signedInvoiceBase64 },
    {
      Authorization: basicAuthHeader(credentials.binarySecurityToken, credentials.secret),
      "Accept-Version": "V2",
      "Accept-Language": language,
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
