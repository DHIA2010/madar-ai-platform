import type { ApiError } from "@/types/api"

export type AppErrorKind = "validation" | "authorization" | "network" | "unknown"

export interface AppErrorOptions {
  code?: string
  message: string
  details?: unknown
  traceId?: string
  cause?: unknown
  status?: number
}

export class AppError extends Error {
  kind: AppErrorKind
  code: string
  details?: unknown
  traceId?: string
  status?: number

  constructor(kind: AppErrorKind, options: AppErrorOptions) {
    super(options.message)
    this.name = "AppError"
    this.kind = kind
    this.code = options.code ?? "app_error"
    this.details = options.details
    this.traceId = options.traceId
    this.status = options.status
    this.cause = options.cause
  }
}

export class ValidationError extends AppError {
  constructor(options: AppErrorOptions) {
    super("validation", { code: options.code ?? "validation_error", ...options })
    this.name = "ValidationError"
  }
}

export class AuthorizationError extends AppError {
  constructor(options: AppErrorOptions) {
    super("authorization", { code: options.code ?? "authorization_error", ...options })
    this.name = "AuthorizationError"
  }
}

export class NetworkError extends AppError {
  constructor(options: AppErrorOptions) {
    super("network", { code: options.code ?? "network_error", ...options })
    this.name = "NetworkError"
  }
}

export class UnknownError extends AppError {
  constructor(options: AppErrorOptions) {
    super("unknown", { code: options.code ?? "unknown_error", ...options })
    this.name = "UnknownError"
  }
}

function isApiError(value: unknown): value is ApiError {
  return Boolean(value && typeof value === "object" && "code" in value && "message" in value)
}

function extractApiError(body: unknown): ApiError | undefined {
  if (!body || typeof body !== "object") {
    return undefined
  }

  if (isApiError(body)) {
    return body
  }

  if ("error" in body && isApiError((body as { error?: unknown }).error)) {
    return (body as { error: ApiError }).error
  }

  return undefined
}

// The server answers in English, and many screens show an error's message as it is. For someone
// using the app in Arabic, the common failures are put in Arabic here, once, instead of leaving
// each screen to show English: by the server's error code where it is a known one, otherwise by
// the kind of failure when the English text carries nothing specific (no connection, a timeout,
// a server fault). A specific message with no translation is still shown as the server wrote it.
const ARABIC_BY_CODE: Record<string, string> = {
  AUTH_FORBIDDEN: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
  AUTH_TOKEN_INVALID: "انتهت جلستك. سجّل الدخول مرة أخرى.",
  AUTH_TOKEN_MISSING: "انتهت جلستك. سجّل الدخول مرة أخرى.",
  AUTH_INVALID_CREDENTIALS: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  AUTH_EMAIL_EXISTS: "هذا البريد الإلكتروني مسجّل من قبل.",
  AUTH_EMAIL_NOT_VERIFIED: "يرجى تأكيد بريدك الإلكتروني أولًا.",
  AUTH_ACCOUNT_LOCKED: "تم إيقاف الحساب مؤقتًا بسبب محاولات دخول متكررة. حاول لاحقًا.",
  AUTH_ACCOUNT_SUSPENDED: "تم إيقاف صلاحيتك. تواصل مع مسؤول الحساب.",
  RESOURCE_NOT_FOUND: "العنصر المطلوب غير موجود.",
  VALIDATION_ERROR: "تحقق من البيانات المدخلة ثم أعد المحاولة.",
  INVALID_JSON: "تعذّرت معالجة الطلب.",
  PAYLOAD_TOO_LARGE: "الملف أو البيانات المرسلة أكبر من الحد المسموح.",
  APPLICATION_NOT_SUBSCRIBED: "هذا التطبيق غير مفعّل في حسابك.",
  PLATFORM_MAINTENANCE: "مدار تحت الصيانة حاليًا. حاول بعد قليل.",
  SERVICE_UNAVAILABLE: "الخدمة غير متاحة حاليًا. حاول بعد قليل.",
  INTERNAL_ERROR: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  authorization_error: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
  validation_error: "تعذّرت معالجة الطلب. تحقق من البيانات المدخلة.",
  network_error: "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.",
  request_timeout: "انتهت مهلة الطلب. حاول مرة أخرى.",
  unknown_error: "حدث خطأ غير متوقع. حاول مرة أخرى.",
}

function readingArabic(): boolean {
  return typeof document !== "undefined" && document.documentElement.lang.startsWith("ar")
}

// The message to show: Arabic for a known code when the app is in Arabic, else `english`.
function messageFor(code: string | undefined, english: string): string {
  if (!readingArabic()) return english
  return (code && ARABIC_BY_CODE[code]) || english
}

// Fired whenever the server refuses a feature the customer's plan doesn't include, so the app can
// explain it in one place (see features/applications PlanUpgradeNotifier).
export const PLAN_FEATURE_REQUIRED_EVENT = "madar:plan-feature-required"

export function mapHttpResponseError(response: Response, body: unknown): AppError {
  const apiError = extractApiError(body)
  const traceId =
    response.headers.get("x-correlation-id") ?? response.headers.get("x-request-id") ?? undefined

  if (response.status === 401 || response.status === 403) {
    if (apiError?.code === "PLAN_FEATURE_NOT_INCLUDED" && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(PLAN_FEATURE_REQUIRED_EVENT, {
          detail: { feature: (apiError.details as { feature?: string } | undefined)?.feature },
        })
      )
    }
    return new AuthorizationError({
      code: apiError?.code ?? "authorization_error",
      message: messageFor(
        apiError?.code ?? "authorization_error",
        apiError?.message ?? "You are not authorized to perform this action."
      ),
      details: apiError?.details,
      traceId,
      status: response.status,
    })
  }

  if (response.status === 400 || response.status === 422) {
    return new ValidationError({
      code: apiError?.code ?? "validation_error",
      message: messageFor(
        apiError?.code ?? "validation_error",
        apiError?.message ?? "The request could not be processed."
      ),
      details: apiError?.details,
      traceId,
      status: response.status,
    })
  }

  if (response.status >= 500) {
    return new NetworkError({
      code: apiError?.code ?? "network_error",
      // A server fault says nothing useful to the person either way: one plain message.
      message: readingArabic()
        ? "حدث خطأ في الخادم. حاول بعد قليل."
        : (apiError?.message ?? "A server error occurred."),
      details: apiError?.details,
      traceId,
      status: response.status,
    })
  }

  return new UnknownError({
    code: apiError?.code ?? "unknown_error",
    message: messageFor(
      apiError?.code ?? "unknown_error",
      apiError?.message ?? `Request failed with status ${response.status}`
    ),
    details: apiError?.details,
    traceId,
    status: response.status,
  })
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new NetworkError({
      code: "request_timeout",
      message: messageFor("request_timeout", "The request timed out."),
      cause: error,
    })
  }

  if (error instanceof TypeError) {
    return new NetworkError({
      code: "network_error",
      // The browser's own text here is "Failed to fetch" and the like.
      message: readingArabic()
        ? ARABIC_BY_CODE.network_error
        : error.message || "A network error occurred.",
      cause: error,
    })
  }

  if (error instanceof Error) {
    return new UnknownError({
      code: "unknown_error",
      message: error.message,
      cause: error,
    })
  }

  return new UnknownError({
    code: "unknown_error",
    message: "An unknown error occurred.",
    details: error,
  })
}
