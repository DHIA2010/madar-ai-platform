function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase()
}

function isSecretsManagerEnabled() {
  // Identity backend relies on Secrets Manager for Google credentials in production mode.
  // Allow explicit opt-out for isolated local workflows.
  return process.env.IDENTITY_PLATFORM_DISABLE_SECRETS_MANAGER !== "1"
}

export function validateAwsCredentialIsolationForSecretsManager() {
  if (!isSecretsManagerEnabled()) {
    return
  }

  const accessKeyId = normalize(process.env.AWS_ACCESS_KEY_ID)
  const secretAccessKey = normalize(process.env.AWS_SECRET_ACCESS_KEY)
  const awsRegion = normalize(process.env.AWS_REGION)

  const hasMinioAccessKey = accessKeyId === "minioadmin"
  const hasMinioSecretKey = secretAccessKey === "minioadmin" || secretAccessKey === "minioadmin123"
  const hasMinioRegion = awsRegion === "us-east-1"

  if (!hasMinioAccessKey && !hasMinioSecretKey && !hasMinioRegion) {
    return
  }

  const message = [
    "Invalid AWS configuration detected.",
    "AWS_* environment variables appear to contain local MinIO credentials.",
    "Use MINIO_* variables instead.",
  ].join(" ")

  console.warn(message)

  throw new Error(message)
}
