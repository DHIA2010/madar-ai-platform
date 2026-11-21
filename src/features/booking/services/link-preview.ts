// What a link to a business's booking pages looks like when it is pasted in a chat (WhatsApp
// shows the page's title and picture): the business's own name and logo, never Madar's. Asked
// from the server while the page is being answered; a slow or failed answer leaves the plain
// title and no picture.

import type { Metadata } from "next"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

const SEPARATOR = String.fromCharCode(47)
const ANSWER_WITHIN_MS = 2500

async function ask<T>(...parts: string[]): Promise<T | null> {
  try {
    const target = ["", "v1", "public", "booking", ...parts.map(encodeURIComponent)].join(SEPARATOR)
    const response = await fetch(new URL(target, getClientEnvironment().API_BASE_URL), {
      signal: AbortSignal.timeout(ANSWER_WITHIN_MS),
      cache: "no-store",
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

interface PageLook {
  name: string
  logoUrl: string | null
  coverUrl: string | null
  tagline: string | null
  description: string | null
}

// The same shape with or without a picture: stating both blocks here is what keeps Madar's own
// title and logo (the site's defaults) off the link.
export function plainPreview(title: string, description: string, image?: string | null): Metadata {
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description,
      images: image ? [{ url: image }] : [],
    },
    twitter: { card: "summary", title, description, images: image ? [image] : [] },
  }
}

// The booking page itself and the customer's "my bookings" on it.
export async function bookingPagePreview(
  slug: string,
  fallback: { title: string; description: string }
): Promise<Metadata> {
  const page = await ask<PageLook>("pages", slug)
  if (!page) return plainPreview(fallback.title, fallback.description)
  return plainPreview(
    page.name || fallback.title,
    page.tagline || page.description || fallback.description,
    page.logoUrl || page.coverUrl
  )
}

// One customer's booking: the business's name and logo only -- nothing about the booking.
export async function bookingLinkPreview(
  token: string,
  fallback: { title: string; description: string }
): Promise<Metadata> {
  const booking = await ask<{ business: { name: string; slug: string | null } }>("manage", token)
  if (!booking) return plainPreview(fallback.title, fallback.description)
  const page = booking.business.slug ? await ask<PageLook>("pages", booking.business.slug) : null
  return plainPreview(
    booking.business.name || fallback.title,
    fallback.description,
    page?.logoUrl || page?.coverUrl
  )
}
