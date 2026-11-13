// Events for Google Tag Manager (loaded on the marketing site and on the app's sign-up pages -- see
// components/google-tag-manager.tsx).
// GTM reacts to them through "Custom Event" triggers named after `event`, and fires whatever tags
// (Meta, Snapchat, TikTok, Google Ads, GA4...) are attached there. Never put personal data (phone,
// email, names) in here: it ends up with every ad platform.
type DataLayerWindow = Window & { dataLayer?: Array<Record<string, unknown>> }

export function pushDataLayerEvent(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return
  const target = window as DataLayerWindow
  target.dataLayer = target.dataLayer ?? []
  target.dataLayer.push({ event, ...params })
}
