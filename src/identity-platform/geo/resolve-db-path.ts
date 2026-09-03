import { downloadGeoLiteCityDatabase } from "./download-database"
import { resolveMaxmindCredentials } from "./maxmind-credentials"

// GEOIP_DB_PATH is a local-dev/manual override -- point it at a file you downloaded yourself
// (see identity-platform/geo/README, or just the MaxMind account dashboard) to skip the network
// round trip entirely. Without it, resolves a MaxMind license key (env var, then Secrets
// Manager) and downloads the current GeoLite2-City database. Never throws -- every failure path
// (no credentials configured, MaxMind unreachable, bad key) resolves to null, and GeoIpService
// treats that as "no geo enrichment" rather than a startup or request failure.
export async function resolveGeoIpDbPath(): Promise<string | null> {
  const envPath = process.env.GEOIP_DB_PATH?.trim()
  if (envPath) {
    return envPath
  }

  const credentials = await resolveMaxmindCredentials()
  if (!credentials) {
    return null
  }

  return downloadGeoLiteCityDatabase(credentials.licenseKey)
}
