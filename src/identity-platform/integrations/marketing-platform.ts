export type MarketingPlatformKey =
  | "marketing"
  | "google-ads"
  | "meta-ads"
  | "snapchat-ads"
  | "tiktok-ads"
  | "linkedin-ads"
  | "other"

export interface MarketingPlatformAdapter {
  key: MarketingPlatformKey
  normalizeConnection?(input: Record<string, unknown>): Record<string, unknown>
  normalizeRecord?(input: Record<string, unknown>): Record<string, unknown>
}
