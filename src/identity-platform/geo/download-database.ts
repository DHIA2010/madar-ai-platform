import { existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { extract } from "tar"

const DOWNLOAD_ENDPOINT = "https://download.maxmind.com/app/geoip_download"
const EDITION_ID = "GeoLite2-City"
const MMDB_FILENAME = "GeoLite2-City.mmdb"

// MaxMind serves the database inside a tar.gz containing one dated directory
// (GeoLite2-City_YYYYMMDD/) alongside COPYRIGHT.txt/LICENSE.txt. strip: 1 drops that directory
// level and the filter keeps only the .mmdb entry, so extraction lands the file directly at
// {targetDir}/GeoLite2-City.mmdb regardless of the date in the archive's folder name.
function resolveTargetDir(): string {
  return process.env.GEOIP_CACHE_DIR?.trim() || join(tmpdir(), "madar-geoip")
}

// Never throws -- GeoIP is optional/best-effort (spec: tracking must fail silently). Any
// failure here (bad license key, MaxMind outage, disk issue) just means GeoIpService keeps
// resolving null geo, not a crashed startup or a broken tracking request.
export async function downloadGeoLiteCityDatabase(licenseKey: string): Promise<string | null> {
  const targetDir = resolveTargetDir()

  try {
    mkdirSync(targetDir, { recursive: true })

    const url = `${DOWNLOAD_ENDPOINT}?edition_id=${EDITION_ID}&license_key=${encodeURIComponent(licenseKey)}&suffix=tar.gz`
    const response = await fetch(url)
    if (!response.ok || !response.body) {
      console.error("geoip.download_failed", { status: response.status })
      return null
    }

    await pipeline(
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
      extract({
        cwd: targetDir,
        strip: 1,
        filter: (path) => path.endsWith(".mmdb"),
      })
    )

    const mmdbPath = join(targetDir, MMDB_FILENAME)
    if (!existsSync(mmdbPath)) {
      console.error("geoip.extraction_produced_no_file", { targetDir })
      return null
    }

    return mmdbPath
  } catch (error) {
    console.error("geoip.download_or_extract_failed", error)
    return null
  }
}
