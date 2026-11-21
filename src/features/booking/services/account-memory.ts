// The customer's account on a business's page is kept by their own browser: this is where its
// secret is remembered, per business. A browser that refuses storage simply has no account.
const key = (slug: string) => `madar-booking-account:${slug.trim().toLowerCase()}`

export const accountMemory = {
  read(slug: string): string | null {
    try {
      return window.localStorage.getItem(key(slug))
    } catch {
      return null
    }
  },
  keep(slug: string, token: string | null | undefined) {
    if (!token) return
    try {
      window.localStorage.setItem(key(slug), token)
    } catch {
      // Nothing to do: the booking itself still stands.
    }
  },
  forget(slug: string) {
    try {
      window.localStorage.removeItem(key(slug))
    } catch {
      // Nothing to do.
    }
  },
}
