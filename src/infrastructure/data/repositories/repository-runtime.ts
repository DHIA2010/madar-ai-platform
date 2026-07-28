import {
  getResolvedAuthApiBaseUrl,
  getClientEnvironment,
  hasEnvironmentErrors,
  isApiConfigured,
  isAuthApiConfigured,
  isMockModeEnabled,
  type AppEnvironment,
} from "@/infrastructure/environment/app-environment"

import { ConfigurationError } from "../errors"

export type RepositoryRuntimeBackend = "api" | "mock"

function joinValidationErrors(errors: string[]) {
  return errors.join(" ")
}

function createConfigurationError(repositoryName: string, message: string, env: AppEnvironment) {
  const environmentIssues = env.VALIDATION_ERRORS.length
    ? ` Environment issues: ${joinValidationErrors(env.VALIDATION_ERRORS)}`
    : ""

  return new ConfigurationError({
    code: "repository_configuration_error",
    message: `${repositoryName}: ${message}.${environmentIssues}`,
    details: {
      repositoryName,
      runtimeMode: env.APP_RUNTIME_MODE,
      nodeEnv: env.NODE_ENV,
      apiBaseUrlConfigured: isApiConfigured(env),
      authApiBaseUrlConfigured: isAuthApiConfigured(env),
      mockRepositoriesEnabled: isMockModeEnabled(env),
      validationErrors: env.VALIDATION_ERRORS,
    },
  })
}

export function resolveRepositoryBackend(repositoryName: string): RepositoryRuntimeBackend {
  const env = getClientEnvironment()
  const isVitestRuntime = Boolean(
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITEST
  )

  if (hasEnvironmentErrors(env)) {
    throw createConfigurationError(repositoryName, "Runtime configuration is invalid", env)
  }

  if (env.NODE_ENV === "test" || isVitestRuntime) {
    return "mock"
  }

  if (isApiConfigured(env)) {
    return "api"
  }

  if (isMockModeEnabled(env)) {
    return "mock"
  }

  throw createConfigurationError(
    repositoryName,
    "API_BASE_URL is missing and mock repositories are disabled",
    env
  )
}

export function assertMockRepositoryEnabled(repositoryName: string) {
  const env = getClientEnvironment()

  if (hasEnvironmentErrors(env)) {
    throw createConfigurationError(repositoryName, "Runtime configuration is invalid", env)
  }

  if (!isMockModeEnabled(env)) {
    throw createConfigurationError(
      repositoryName,
      "This repository is mock-only and not available in the current runtime mode",
      env
    )
  }
}

export function resolveAuthenticationBackend(): RepositoryRuntimeBackend {
  const env = getClientEnvironment()
  const isVitestRuntime = Boolean(
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITEST
  )

  if (hasEnvironmentErrors(env)) {
    throw createConfigurationError("authentication", "Runtime configuration is invalid", env)
  }

  if (env.NODE_ENV === "test" || isVitestRuntime) {
    return "mock"
  }

  if (isAuthApiConfigured(env)) {
    return "api"
  }

  if (env.APP_RUNTIME_MODE === "mock") {
    return "mock"
  }

  throw createConfigurationError(
    "authentication",
    "AUTH_API_BASE_URL (or API_BASE_URL) is missing and authentication mock mode is disabled",
    env
  )
}

export function resolveAuthenticationApiBaseUrl() {
  const env = getClientEnvironment()
  return getResolvedAuthApiBaseUrl(env)
}
