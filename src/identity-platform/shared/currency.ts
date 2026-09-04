// The only real, non-fluctuating FX rate available anywhere in this system: Saudi Arabia's
// USD peg (3.75 SAR = 1 USD, held since 1986). No other currency pair has a real rate --
// never add one here without a real source.
export const USD_TO_SAR_PEG = 3.75

export type SupportedOrgCurrency = "USD" | "SAR"

export function isSupportedOrgCurrency(value: string): value is SupportedOrgCurrency {
  return value === "USD" || value === "SAR"
}

export interface CurrencyConversionResult {
  amount: number
  converted: boolean
}

// sourceCurrency === null means "unknown" (e.g. an ad account whose currency hasn't been
// captured yet) and is treated as already-in-target -- this preserves today's behavior for
// rows with no currency data rather than silently dropping them into an "other" bucket. A
// REAL, known currency that isn't USD/SAR returns null: callers must never fabricate a rate
// for it, and should surface that amount separately, unconverted, in its own currency.
export function convertToOrgCurrency(
  amount: number,
  sourceCurrency: string | null,
  targetCurrency: SupportedOrgCurrency
): CurrencyConversionResult | null {
  const source = sourceCurrency?.trim().toUpperCase() || null
  if (!source || source === targetCurrency) {
    return { amount, converted: false }
  }
  if (source === "USD" && targetCurrency === "SAR") {
    return { amount: amount * USD_TO_SAR_PEG, converted: true }
  }
  if (source === "SAR" && targetCurrency === "USD") {
    return { amount: amount / USD_TO_SAR_PEG, converted: true }
  }
  return null
}
