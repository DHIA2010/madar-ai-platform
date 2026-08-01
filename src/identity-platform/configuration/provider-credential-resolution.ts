export interface AwsCredentialSourceOptions {
  secretId: string
  region?: string
  disableSecretsManagerEnvVar?: string
}

export function hasAwsRegionConfigured() {
  const region = process.env.AWS_REGION?.trim() ?? process.env.AWS_DEFAULT_REGION?.trim() ?? ""
  return region.length > 0
}

export function isSecretsManagerEnabled(disableEnvVar = "IDENTITY_PLATFORM_DISABLE_SECRETS_MANAGER") {
  return process.env[disableEnvVar] !== "1"
}

export function canUseAwsSecretFallback(options: AwsCredentialSourceOptions) {
  if (!isSecretsManagerEnabled(options.disableSecretsManagerEnvVar)) {
    return false
  }

  return options.secretId.trim().length > 0 && hasAwsRegionConfigured()
}

export async function resolveEnvironmentThenAwsCredentials<T>(input: {
  readEnv: () => T | null
  validate: (value: T) => T
  loadFromAws: () => Promise<T>
}) {
  const envValue = input.readEnv()
  if (envValue) {
    return input.validate(envValue)
  }

  return input.validate(await input.loadFromAws())
}
