// Mirrors src/features/purchases/services/currency-conversion.service.ts (duplicated rather than
// imported across the feature boundary -- same no-restricted-imports/import-cycle rationale as
// use-cross-feature-purchase-data.ts's own duplicate of purchaseGrandTotal). 3.75 SAR = 1 USD is
// the only real, non-fluctuating FX rate available anywhere in this system. Never add another pair
// here without a real source.
export const USD_TO_SAR_PEG = 3.75

export type SupportedOrgCurrency = "USD" | "SAR"

export function isSupportedOrgCurrency(value: string): value is SupportedOrgCurrency {
  return value === "USD" || value === "SAR"
}

// Returns the original amount unconverted (not null) when the source currency is unknown, empty,
// or already the target -- only a real, different, unsupported currency returns null, so callers
// can tell "nothing to do" apart from "can't convert this, don't fabricate a rate."
export function convertToOrgCurrency(
  amount: number,
  sourceCurrency: string | null | undefined,
  targetCurrency: SupportedOrgCurrency
): number | null {
  const source = sourceCurrency?.trim().toUpperCase() || null
  if (!source || source === targetCurrency) return amount
  if (source === "USD" && targetCurrency === "SAR") return amount * USD_TO_SAR_PEG
  if (source === "SAR" && targetCurrency === "USD") return amount / USD_TO_SAR_PEG
  return null
}
