import { ROUTES } from "@/constants/routes"
import { cardIconUrl, cardLook } from "@/features/loyalty/services/card-look"

// What a phone reads when a loyalty card is saved to its home screen: the business's name, the
// card's own colours and picture, and that it opens on its own like an app. Opening that way is
// what lets an iPhone offer notifications for it.
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await context.params).token)
  const look = await cardLook(token)
  const home = ROUTES.loyaltyServiceWorker.scope(encodeURIComponent(token))
  const name = look?.businessName || "بطاقة الولاء"
  return Response.json(
    {
      id: home,
      name,
      short_name: name,
      start_url: home,
      scope: home,
      display: "standalone",
      dir: "rtl",
      lang: "ar",
      background_color: "#f5f7fb",
      theme_color: look?.cardColor ?? "#0b1738",
      icons: ([192, 512] as const).map((size) => ({
        src: cardIconUrl(token, size),
        sizes: `${size}x${size}`,
        type: "image/png",
      })),
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } }
  )
}
