// Madar's Salla App Function: forwards a store's checkout and order events to Madar's live
// dashboard (Salla's storefront has no checkout event, so these come from Salla's servers).
//
// Installed in the Salla Partners Portal -> My Apps -> Madarai -> App Functions, twice, with the
// actions "Checkout Started" and "Order Completed". The portal editor keeps its own first line
// (`export default async (context: Checkout): Promise<Resp> => {`) and closing `};` -- paste the
// body below between them. x-madar-key must equal the backend's SALLA_APP_FUNCTION_KEY (kept out
// of git; ask for it).
//
// Madar receives it at POST /v1/tracking/salla/app-events (see
// src/identity-platform/tracking/salla-app-events.ts).

export default async (context: any) => {
  const ctx = context as any
  const payload = ctx?.payload ?? {}
  try {
    await fetch("https://api.madar.my/v1/tracking/salla/app-events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-madar-key": "PASTE_THE_KEY_HERE",
      },
      body: JSON.stringify({
        event: payload.event,
        merchant: payload.merchant ?? ctx?.merchant?.id ?? ctx?.merchant,
        created_at: payload.created_at,
        data: payload.data,
      }),
    })
  } catch (error) {
    console.error("Forwarding to Madar failed")
  }
  return Resp.success().setData({})
}
