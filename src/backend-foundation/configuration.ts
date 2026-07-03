import { z } from "zod"

import type { BackendFoundationConfig, DeploymentEnvironment } from "./types"

const schema = z.object({
  BACKEND_ENVIRONMENT: z.enum(["local", "docker", "stage", "production"]).default("local"),
  BACKEND_APP_NAME: z.string().default("madar-backend"),
  BACKEND_APP_VERSION: z.string().default("1.0.0"),
  BACKEND_BUILD_SHA: z.string().default("local"),
  BACKEND_FEATURE_FLAGS: z.string().optional(),
})

function parseFeatureFlags(raw: string | undefined) {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "boolean")
    ) as Record<string, boolean>
  } catch {
    return {}
  }
}

export function loadBackendFoundationConfig(
  source: Record<string, string | undefined> = process.env
): BackendFoundationConfig {
  const parsed = schema.parse(source)
  return {
    environment: parsed.BACKEND_ENVIRONMENT as DeploymentEnvironment,
    appName: parsed.BACKEND_APP_NAME,
    appVersion: parsed.BACKEND_APP_VERSION,
    buildSha: parsed.BACKEND_BUILD_SHA,
    featureFlags: parseFeatureFlags(parsed.BACKEND_FEATURE_FLAGS),
  }
}
