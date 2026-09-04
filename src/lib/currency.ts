// Display-only: the backend (src/identity-platform/shared/currency.ts) always returns amounts
// already converted into the org's currency, plus a separate list of amounts in currencies we
// have no real exchange rate for -- this file just formats numbers, no conversion math here.
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    // currency isn't a valid ISO 4217 code (can happen with raw, unvalidated ad-platform data)
    // -- fall back to a plain number with the code as a suffix rather than crashing the page.
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} ${currency}`
  }
}
