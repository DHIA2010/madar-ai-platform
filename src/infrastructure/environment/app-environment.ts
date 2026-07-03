type NodeEnv = "development" | "test" | "production"
export type RuntimeMode = "development" | "stage" | "production" | "mock"

export interface AppEnvironment {
  NODE_ENV: NodeEnv
  APP_RUNTIME_MODE: RuntimeMode
  APP_NAME: string
  APP_URL: string
  API_BASE_URL: string
  AUTH_API_BASE_URL: string
  REQUEST_TIMEOUT_MS: number
  ENABLE_DEBUG_LOGS: boolean
  ENABLE_MOCK_REPOSITORIES: boolean
  VALIDATION_ERRORS: string[]
}

const DEVELOPMENT_DEFAULTS: AppEnvironment = {
  NODE_ENV: "development",
  APP_RUNTIME_MODE: "development",
  APP_NAME: "MADAR",
  APP_URL: "http://localhost:3000",
  API_BASE_URL: "",
  AUTH_API_BASE_URL: "",
  REQUEST_TIMEOUT_MS: 15_000,
  ENABLE_DEBUG_LOGS: true,
  ENABLE_MOCK_REPOSITORIES: true,
  VALIDATION_ERRORS: [],
}

function toNodeEnv(value: string | undefined): NodeEnv {
  if (value === "production" || value === "test") {
    return value
  }

  return "development"
}

function toBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

function toNumber(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toRuntimeMode(value: string | undefined, nodeEnv: NodeEnv): RuntimeMode {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === "development" ||
    normalized === "stage" ||
    normalized === "production" ||
    normalized === "mock"
  ) {
    return normalized
  }

  if (nodeEnv === "production") {
    return "production"
  }

  return "development"
}

function normalizeUrl(value: string | undefined, fallback: string) {
  if (!value || value.trim() === "") {
    return fallback
  }

  try {
    return new URL(value).toString().replace(/\/$/, "")
  } catch {
    return fallback
  }
}

function parseEnvironment(
  source: Record<string, string | undefined>,
  isServer: boolean
): AppEnvironment {
  const nodeEnv = toNodeEnv(source.NODE_ENV)
  const runtimeMode = toRuntimeMode(
    source.NEXT_PUBLIC_APP_RUNTIME_MODE ?? source.APP_RUNTIME_MODE,
    nodeEnv
  )
  const defaults = DEVELOPMENT_DEFAULTS
  const validationErrors: string[] = []

  const appUrl = normalizeUrl(source.NEXT_PUBLIC_APP_URL ?? source.APP_URL, defaults.APP_URL)
  const apiBaseUrl = normalizeUrl(
    source.NEXT_PUBLIC_API_BASE_URL ?? source.API_BASE_URL,
    defaults.API_BASE_URL
  )
  const authApiBaseUrl = normalizeUrl(
    source.NEXT_PUBLIC_AUTH_API_BASE_URL ?? source.AUTH_API_BASE_URL,
    defaults.AUTH_API_BASE_URL
  )

  const enableMockRepositories = toBoolean(
    source.NEXT_PUBLIC_ENABLE_MOCK_REPOSITORIES ?? source.ENABLE_MOCK_REPOSITORIES,
    runtimeMode === "development" || runtimeMode === "mock"
  )

  const env: AppEnvironment = {
    NODE_ENV: nodeEnv,
    APP_RUNTIME_MODE: runtimeMode,
    APP_NAME: source.NEXT_PUBLIC_APP_NAME ?? source.APP_NAME ?? defaults.APP_NAME,
    APP_URL: appUrl,
    API_BASE_URL: apiBaseUrl,
    AUTH_API_BASE_URL: authApiBaseUrl,
    REQUEST_TIMEOUT_MS: toNumber(
      source.NEXT_PUBLIC_REQUEST_TIMEOUT_MS ?? source.REQUEST_TIMEOUT_MS,
      defaults.REQUEST_TIMEOUT_MS
    ),
    ENABLE_DEBUG_LOGS: toBoolean(
      source.NEXT_PUBLIC_ENABLE_DEBUG_LOGS ?? source.ENABLE_DEBUG_LOGS,
      defaults.ENABLE_DEBUG_LOGS
    ),
    ENABLE_MOCK_REPOSITORIES: enableMockRepositories,
    VALIDATION_ERRORS: validationErrors,
  }

  if (!env.APP_NAME.trim()) {
    validationErrors.push("APP_NAME is required.")
  }

  if (!env.APP_URL) {
    validationErrors.push("APP_URL is required.")
  }

  const requiresApiConfiguration = runtimeMode === "stage" || runtimeMode === "production"
  if (requiresApiConfiguration && !env.API_BASE_URL) {
    validationErrors.push("API_BASE_URL is required when APP_RUNTIME_MODE is stage or production.")
  }

  if ((runtimeMode === "stage" || runtimeMode === "production") && enableMockRepositories) {
    validationErrors.push(
      "ENABLE_MOCK_REPOSITORIES must be false when APP_RUNTIME_MODE is stage or production."
    )
  }

  if (!isServer) {
    return {
      ...env,
      APP_URL: env.APP_URL || defaults.APP_URL,
      VALIDATION_ERRORS: [...validationErrors],
    }
  }

  return {
    ...env,
    VALIDATION_ERRORS: [...validationErrors],
  }
}

export function getServerEnvironment(): AppEnvironment {
  return parseEnvironment(process.env as Record<string, string | undefined>, true)
}

export function getClientEnvironment(): AppEnvironment {
  return parseEnvironment(
    {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_RUNTIME_MODE: process.env.NEXT_PUBLIC_APP_RUNTIME_MODE,
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
      NEXT_PUBLIC_AUTH_API_BASE_URL: process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
      NEXT_PUBLIC_REQUEST_TIMEOUT_MS: process.env.NEXT_PUBLIC_REQUEST_TIMEOUT_MS,
      NEXT_PUBLIC_ENABLE_DEBUG_LOGS: process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS,
      NEXT_PUBLIC_ENABLE_MOCK_REPOSITORIES: process.env.NEXT_PUBLIC_ENABLE_MOCK_REPOSITORIES,
      APP_RUNTIME_MODE: process.env.APP_RUNTIME_MODE,
      APP_NAME: process.env.APP_NAME,
      APP_URL: process.env.APP_URL,
      API_BASE_URL: process.env.API_BASE_URL,
      AUTH_API_BASE_URL: process.env.AUTH_API_BASE_URL,
      REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS,
      ENABLE_DEBUG_LOGS: process.env.ENABLE_DEBUG_LOGS,
      ENABLE_MOCK_REPOSITORIES: process.env.ENABLE_MOCK_REPOSITORIES,
    },
    false
  )
}

export const environment = getServerEnvironment()

export function isMockModeEnabled(env: AppEnvironment) {
  return env.APP_RUNTIME_MODE === "mock" || env.ENABLE_MOCK_REPOSITORIES
}

export function isApiConfigured(env: AppEnvironment) {
  return Boolean(env.API_BASE_URL)
}

export function isAuthApiConfigured(env: AppEnvironment) {
  return Boolean(env.AUTH_API_BASE_URL || env.API_BASE_URL)
}

export function getResolvedAuthApiBaseUrl(env: AppEnvironment) {
  return env.AUTH_API_BASE_URL || env.API_BASE_URL
}

export function hasEnvironmentErrors(env: AppEnvironment) {
  return env.VALIDATION_ERRORS.length > 0
}
