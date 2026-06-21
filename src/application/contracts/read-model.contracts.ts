export type ReadModelFreshness = "fresh" | "stale" | "expired"

export interface ReadModel<TPayload> {
  id: string
  version: string
  owner: string
  generatedAt: string
  freshness: ReadModelFreshness
  sourceDomains: readonly string[]
  payload: Readonly<TPayload>
}

export interface ReadModelViewModel<TPayload> {
  id: string
  freshness: ReadModelFreshness
  payload: Readonly<TPayload>
}
