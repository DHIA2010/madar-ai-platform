import type { ReadModel, ReadModelFreshness } from "../contracts"

function deepFreeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepFreeze(item))) as unknown as Readonly<T>
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      deepFreeze(nestedValue),
    ])

    return Object.freeze(Object.fromEntries(entries)) as Readonly<T>
  }

  return value as Readonly<T>
}

export function createReadModel<TPayload>(options: {
  id: string
  owner: string
  sourceDomains: string[]
  payload: TPayload
  version?: string
  freshness?: ReadModelFreshness
}): ReadModel<TPayload> {
  return Object.freeze({
    id: options.id,
    version: options.version ?? "1.0.0",
    owner: options.owner,
    generatedAt: new Date().toISOString(),
    freshness: options.freshness ?? "fresh",
    sourceDomains: Object.freeze([...options.sourceDomains]),
    payload: deepFreeze(options.payload),
  })
}
