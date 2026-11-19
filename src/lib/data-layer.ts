// Events for Google Tag Manager (loaded on the marketing site and on the app's sign-up pages -- see
// components/google-tag-manager.tsx).
// GTM reacts to them through "Custom Event" triggers named after `event`, and fires whatever tags
// (Meta, Snapchat, TikTok, Google Ads, GA4...) are attached there. Never put personal data (phone,
// email, names) in here: it ends up with every ad platform.
type DataLayerWindow = Window & {
  dataLayer?: Array<Record<string, unknown>>
  // TikTok's pixel, when Tag Manager has loaded it on this page.
  ttq?: { track?: (event: string) => void }
}

// TikTok's pixel receives our events under their own names ("generate_lead"), which it files as
// custom events -- and a campaign can only optimise for TikTok's standard ones. So the two
// events that are real conversions are also reported to the pixel under TikTok's standard name.
// No details travel with them, in keeping with the rule above.
const TIKTOK_STANDARD_EVENTS: Record<string, string> = {
  generate_lead: "SubmitForm",
  sign_up: "CompleteRegistration",
}

export function pushDataLayerEvent(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return
  const target = window as DataLayerWindow
  target.dataLayer = target.dataLayer ?? []
  target.dataLayer.push({ event, ...params })

  const tiktokEvent = TIKTOK_STANDARD_EVENTS[event]
  if (tiktokEvent) {
    try {
      target.ttq?.track?.(tiktokEvent)
    } catch {
      // A blocked or half-loaded pixel must never break the form.
    }
  }
}
