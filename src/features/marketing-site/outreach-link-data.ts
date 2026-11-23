import type { Metadata } from "next"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

// What the link inside a WhatsApp message from Madar's CRM shows in the chat (its card) and
// where it leads. Asked from the server while the page is being answered, so the card is part
// of the page as sent. Shared by the message's main link and its "interested" link.
export interface OutreachLinkInfo {
  title: string | null
  description: string | null
  imageUrl: string | null
  target: string
}

const SEPARATOR = String.fromCharCode(47)

export async function outreachLinkOf(code: string): Promise<OutreachLinkInfo | null> {
  try {
    const address = new URL(
      ["", "v1", "public", "outreach", encodeURIComponent(code)].join(SEPARATOR),
      getClientEnvironment().API_BASE_URL
    )
    const response = await fetch(address, { cache: "no-store", signal: AbortSignal.timeout(4000) })
    return response.ok ? ((await response.json()) as OutreachLinkInfo) : null
  } catch {
    return null
  }
}

// The link's card: the title, line and picture set on the message in Madar Admin. Both blocks
// are stated, which is what keeps the site's own default title and logo off the link.
export function outreachLinkMetadata(link: OutreachLinkInfo | null): Metadata {
  const title = link?.title ?? "مدار"
  const description = link?.description ?? "نظام واحد يدير نشاطك كله."
  const images = link?.imageUrl ? [link.imageUrl] : []
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description,
      images: images.map((url) => ({ url })),
    },
    twitter: {
      card: images.length > 0 ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
    robots: { index: false, follow: false },
  }
}
