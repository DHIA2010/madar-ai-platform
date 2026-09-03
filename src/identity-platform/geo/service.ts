import { open, type CityResponse, type Reader } from "maxmind"

export interface GeoLocation {
  country: string | null
  countryCode: string | null
  region: string | null
  city: string | null
}

const NULL_GEO: GeoLocation = { country: null, countryCode: null, region: null, city: null }

// Self-hosted MaxMind GeoLite2-City lookup. Deliberately fails open (returns NULL_GEO), never
// throws: a merchant's checkout must never break because a geo database is missing/stale/
// corrupt (spec section 14 -- tracking must fail silently).
//
// dbPath is resolved lazily via a function rather than a plain string because resolving it can
// mean a real network round trip (credentials from Secrets Manager, then downloading the
// GeoLite2-City tarball from MaxMind -- see geo/maxmind-credentials.ts and
// geo/download-database.ts) that must never block server startup. warmUp() kicks that
// resolution off immediately at construction time (fire-and-forget) so the first real tracking
// request doesn't pay for it; getReader() still resolves lazily/correctly even if warmUp() was
// never called (e.g. in tests).
export class GeoIpService {
  private readerPromise: Promise<Reader<CityResponse> | null> | null = null

  constructor(private readonly resolveDbPath: () => Promise<string | null>) {}

  warmUp(): void {
    void this.getReader()
  }

  private getReader(): Promise<Reader<CityResponse> | null> {
    if (!this.readerPromise) {
      this.readerPromise = this.resolveDbPath()
        .then((dbPath) => (dbPath ? open<CityResponse>(dbPath) : null))
        .catch((error: unknown) => {
          console.error("geoip.db_open_failed", error)
          return null
        })
    }

    return this.readerPromise
  }

  // Only the resolved location is ever returned -- callers must never persist the raw IP
  // alongside it (spec section 9: don't expose/store raw IP in analytics records).
  async lookup(ipAddress: string): Promise<GeoLocation> {
    if (!ipAddress || ipAddress === "unknown") {
      return NULL_GEO
    }

    const reader = await this.getReader()
    if (!reader) {
      return NULL_GEO
    }

    try {
      const result = reader.get(ipAddress)
      if (!result) {
        return NULL_GEO
      }

      return {
        country: result.country?.names?.en ?? null,
        countryCode: result.country?.iso_code ?? null,
        region: result.subdivisions?.[0]?.names?.en ?? null,
        city: result.city?.names?.en ?? null,
      }
    } catch (error) {
      // maxmind throws on a malformed/private/loopback IP -- never let a lookup failure fail
      // the tracking request that triggered it.
      console.error("geoip.lookup_failed", error)
      return NULL_GEO
    }
  }
}
