type NodeEnv = "development" | "test" | "production"

export interface AppEnvironment {
  NODE_ENV: NodeEnv
  APP_NAME: string
  APP_URL: string
  API_BASE_URL: string
  REQUEST_TIMEOUT_MS: number
  ENABLE_DEBUG_LOGS: boolean
}

const DEVELOPMENT_DEFAULTS: AppEnvironment = {
  NODE_ENV: "development",
  APP_NAME: "MADAR",
  APP_URL: "http://localhost:3000/pulse-ui-next",
  API_BASE_URL: "",
  REQUEST_TIMEOUT_MS: 15_000,
  ENABLE_DEBUG_LOGS: true,
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
  const defaults = DEVELOPMENT_DEFAULTS

  const env: AppEnvironment = {
    NODE_ENV: nodeEnv,
    APP_NAME: source.NEXT_PUBLIC_APP_NAME ?? source.APP_NAME ?? defaults.APP_NAME,
    APP_URL: normalizeUrl(source.NEXT_PUBLIC_APP_URL ?? source.APP_URL, defaults.APP_URL),
    API_BASE_URL: normalizeUrl(
      source.NEXT_PUBLIC_API_BASE_URL ?? source.API_BASE_URL,
      defaults.API_BASE_URL
    ),
    REQUEST_TIMEOUT_MS: toNumber(
      source.NEXT_PUBLIC_REQUEST_TIMEOUT_MS ?? source.REQUEST_TIMEOUT_MS,
      defaults.REQUEST_TIMEOUT_MS
    ),
    ENABLE_DEBUG_LOGS: toBoolean(
      source.NEXT_PUBLIC_ENABLE_DEBUG_LOGS ?? source.ENABLE_DEBUG_LOGS,
      defaults.ENABLE_DEBUG_LOGS
    ),
  }

  if (nodeEnv === "production") {
    if (!env.APP_URL) {
      throw new Error("APP_URL is required in production")
    }

    if (!env.APP_NAME) {
      throw new Error("APP_NAME is required in production")
    }
  }

  if (!isServer) {
    return {
      ...env,
      APP_URL: env.APP_URL || defaults.APP_URL,
    }
  }

  return env
}

export function getServerEnvironment(): AppEnvironment {
  return parseEnvironment(process.env as Record<string, string | undefined>, true)
}

export function getClientEnvironment(): AppEnvironment {
  return parseEnvironment(process.env as Record<string, string | undefined>, false)
}

export const environment = getServerEnvironment()
