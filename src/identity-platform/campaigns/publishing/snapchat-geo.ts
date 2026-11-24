// Where inside a country a Snapchat ad set is shown: the whole country, some of its regions, or
// some of its cities.
//
// Snapchat names a country's regions itself (GET /targeting/geo/<country>/region) and an ad set
// lists the ones it wants: geos: [{ country_code, region_id: [...], operation: "INCLUDE" }] --
// the shape read from a live ad set. It has no cities for Saudi Arabia (its "metro" list there is
// empty), so a city is a circle around its centre: locations: [{ circles: [{ latitude, longitude,
// radius, unit }], operation: "INCLUDE" }], which Snapchat allows up to 100 km wide.

type Json = Record<string, unknown>

export interface SnapchatRegion {
  id: string
  // Snapchat's own name, and the Arabic one where Madar knows it.
  name: string
  nameAr: string | null
}

export interface SnapchatCity {
  key: string
  name: string
  nameAr: string
  latitude: number
  longitude: number
  radiusKm: number
}

// The Arabic names of Saudi Arabia's regions, by the region code Snapchat gives with each.
const SAUDI_REGIONS_AR: Record<string, string> = {
  "01": "منطقة الرياض",
  "02": "منطقة مكة المكرمة",
  "03": "منطقة المدينة المنورة",
  "04": "المنطقة الشرقية",
  "05": "منطقة القصيم",
  "06": "منطقة حائل",
  "07": "منطقة تبوك",
  "08": "منطقة الحدود الشمالية",
  "09": "منطقة جازان",
  "10": "منطقة نجران",
  "11": "منطقة الباحة",
  "12": "منطقة الجوف",
  "14": "منطقة عسير",
}

export function regionNameAr(countryCode: string, regionCode: string): string | null {
  return countryCode.toLowerCase() === "sa" ? (SAUDI_REGIONS_AR[regionCode] ?? null) : null
}

// The cities offered, per country: each a centre and a radius that covers the city and what is
// built around it.
const CITIES: Record<string, SnapchatCity[]> = {
  sa: [
    {
      key: "riyadh",
      name: "Riyadh",
      nameAr: "الرياض",
      latitude: 24.7136,
      longitude: 46.6753,
      radiusKm: 45,
    },
    {
      key: "jeddah",
      name: "Jeddah",
      nameAr: "جدة",
      latitude: 21.5433,
      longitude: 39.1728,
      radiusKm: 40,
    },
    {
      key: "makkah",
      name: "Makkah",
      nameAr: "مكة المكرمة",
      latitude: 21.3891,
      longitude: 39.8579,
      radiusKm: 25,
    },
    {
      key: "madinah",
      name: "Madinah",
      nameAr: "المدينة المنورة",
      latitude: 24.4686,
      longitude: 39.6142,
      radiusKm: 25,
    },
    {
      key: "dammam",
      name: "Dammam",
      nameAr: "الدمام",
      latitude: 26.4207,
      longitude: 50.0888,
      radiusKm: 16,
    },
    {
      key: "khobar",
      name: "Khobar and Dhahran",
      nameAr: "الخبر والظهران",
      latitude: 26.2794,
      longitude: 50.1783,
      radiusKm: 14,
    },
    {
      key: "jubail",
      name: "Jubail",
      nameAr: "الجبيل",
      latitude: 27.0046,
      longitude: 49.646,
      radiusKm: 20,
    },
    {
      key: "ahsa",
      name: "Al Ahsa",
      nameAr: "الأحساء",
      latitude: 25.3833,
      longitude: 49.5861,
      radiusKm: 25,
    },
    {
      key: "taif",
      name: "Taif",
      nameAr: "الطائف",
      latitude: 21.2703,
      longitude: 40.4158,
      radiusKm: 20,
    },
    {
      key: "buraydah",
      name: "Buraydah",
      nameAr: "بريدة",
      latitude: 26.326,
      longitude: 43.975,
      radiusKm: 18,
    },
    {
      key: "tabuk",
      name: "Tabuk",
      nameAr: "تبوك",
      latitude: 28.3838,
      longitude: 36.555,
      radiusKm: 18,
    },
    {
      key: "abha",
      name: "Abha",
      nameAr: "أبها",
      latitude: 18.2164,
      longitude: 42.5053,
      radiusKm: 15,
    },
    {
      key: "khamis",
      name: "Khamis Mushait",
      nameAr: "خميس مشيط",
      latitude: 18.3,
      longitude: 42.7333,
      radiusKm: 15,
    },
    {
      key: "hail",
      name: "Hail",
      nameAr: "حائل",
      latitude: 27.5114,
      longitude: 41.7208,
      radiusKm: 18,
    },
    {
      key: "jazan",
      name: "Jazan",
      nameAr: "جازان",
      latitude: 16.8892,
      longitude: 42.5511,
      radiusKm: 15,
    },
    {
      key: "najran",
      name: "Najran",
      nameAr: "نجران",
      latitude: 17.4917,
      longitude: 44.1322,
      radiusKm: 18,
    },
    {
      key: "yanbu",
      name: "Yanbu",
      nameAr: "ينبع",
      latitude: 24.0895,
      longitude: 38.0618,
      radiusKm: 20,
    },
  ],
}

export function snapchatCities(countryCode: string): SnapchatCity[] {
  return CITIES[countryCode.toLowerCase()] ?? []
}

// Why a choice of places cannot be sent: regions and cities together (Snapchat would show the ad
// only where both hold), or a city Madar does not offer for the country.
export function snapchatPlacesProblem(
  countryCode: string,
  regionIds: readonly string[] | null | undefined,
  cityKeys: readonly string[] | null | undefined
): "both" | "city" | null {
  const cities = cityKeys ?? []
  if ((regionIds ?? []).length > 0 && cities.length > 0) return "both"
  const offered = new Set(snapchatCities(countryCode).map((city) => city.key))
  return cities.every((key) => offered.has(key)) ? null : "city"
}

// The part of an ad set's targeting that says where: the country, narrowed to the regions or to
// the cities chosen. `locations` is null when no city was chosen, so the caller removes it.
export function snapchatPlaces(
  countryCode: string,
  regionIds: readonly string[] | null | undefined,
  cityKeys: readonly string[] | null | undefined
): { geos: Json[]; locations: Json[] | null } {
  const country = countryCode.toLowerCase()
  const regions = [...new Set(regionIds ?? [])]
  const chosen = new Set(cityKeys ?? [])
  const cities = snapchatCities(country).filter((city) => chosen.has(city.key))
  return {
    geos: [
      {
        country_code: country,
        ...(regions.length > 0 && cities.length === 0 ? { region_id: regions } : {}),
        operation: "INCLUDE",
      },
    ],
    locations:
      cities.length > 0
        ? [
            {
              circles: cities.map((city) => ({
                latitude: city.latitude,
                longitude: city.longitude,
                radius: city.radiusKm,
                unit: "KILOMETERS",
              })),
              operation: "INCLUDE",
            },
          ]
        : null,
  }
}

// The places an ad set's targeting names, read back: its country, its regions, and the offered
// cities its circles are centred on.
export function readSnapchatPlaces(targeting: unknown): {
  countryCode: string | null
  regionIds: string[]
  cityKeys: string[]
} {
  const spec = (targeting ?? {}) as Json
  const geos = Array.isArray(spec.geos) ? (spec.geos as Json[]) : []
  const countryCode =
    typeof geos[0]?.country_code === "string" ? geos[0].country_code.toLowerCase() : null
  const regionIds = geos.flatMap((geo) =>
    Array.isArray(geo.region_id) ? (geo.region_id as unknown[]).map(String) : []
  )
  const circles = (Array.isArray(spec.locations) ? (spec.locations as Json[]) : []).flatMap(
    (location) => (Array.isArray(location.circles) ? (location.circles as Json[]) : [])
  )
  const near = (a: unknown, b: number) => Math.abs(Number(a) - b) < 0.01
  const cityKeys = countryCode
    ? snapchatCities(countryCode)
        .filter((city) =>
          circles.some(
            (circle) =>
              near(circle.latitude, city.latitude) && near(circle.longitude, city.longitude)
          )
        )
        .map((city) => city.key)
    : []
  return { countryCode, regionIds: [...new Set(regionIds)], cityKeys }
}
