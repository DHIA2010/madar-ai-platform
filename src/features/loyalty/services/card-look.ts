// A card's name and colours, asked from the server while its page or its home screen manifest
// is being answered. A slow or failed answer gives null and the caller falls back to plain text.

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

const SEPARATOR = String.fromCharCode(47)
const ANSWER_WITHIN_MS = 2500

export interface CardLook {
  businessName: string
  cardColor: string
  textColor: string
}

const cardPath = (token: string, ...more: string[]) =>
  ["", "v1", "public", "loyalty", "cards", encodeURIComponent(token), ...more].join(SEPARATOR)

export async function cardLook(token: string): Promise<CardLook | null> {
  try {
    const response = await fetch(new URL(cardPath(token), getClientEnvironment().API_BASE_URL), {
      signal: AbortSignal.timeout(ANSWER_WITHIN_MS),
      cache: "no-store",
    })
    return response.ok ? ((await response.json()) as CardLook) : null
  } catch {
    return null
  }
}

// The card's own picture (a star in its colours) at the size a phone asks for.
export const cardIconUrl = (token: string, size: 180 | 192 | 512) =>
  new URL(
    `${cardPath(token, "icon.png")}?size=${size}`,
    getClientEnvironment().API_BASE_URL
  ).toString()
