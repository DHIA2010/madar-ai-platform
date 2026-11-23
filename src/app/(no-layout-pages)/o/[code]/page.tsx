import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { plainPreview } from "@/features/booking/services/link-preview"
import { OutreachLink } from "@/features/marketing-site/outreach-link"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ code: string }> }

interface Link {
  title: string | null
  description: string | null
  imageUrl: string | null
  target: string
}

const SEPARATOR = String.fromCharCode(47)

// What the link shows and where it leads, asked from the server while the page is answered.
async function linkOf(code: string): Promise<Link | null> {
  try {
    const address = new URL(
      ["", "v1", "public", "outreach", encodeURIComponent(code)].join(SEPARATOR),
      getClientEnvironment().API_BASE_URL
    )
    const response = await fetch(address, { cache: "no-store", signal: AbortSignal.timeout(4000) })
    return response.ok ? ((await response.json()) as Link) : null
  } catch {
    return null
  }
}

// The link's card in the chat: the title, line and picture set on the message in Madar Admin.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  const link = await linkOf(decodeURIComponent(code))
  return {
    ...plainPreview(
      link?.title ?? "مدار",
      link?.description ?? "نظام واحد يدير نشاطك كله.",
      link?.imageUrl
    ),
    ...(link?.imageUrl
      ? {
          twitter: {
            card: "summary_large_image",
            title: link.title ?? "مدار",
            description: link.description ?? "",
            images: [link.imageUrl],
          },
        }
      : {}),
    robots: { index: false, follow: false },
  }
}

export default async function Page({ params }: Props) {
  const { code } = await params
  const decoded = decodeURIComponent(code)
  const link = await linkOf(decoded)
  if (!link) notFound()
  return <OutreachLink code={decoded} target={link.target} />
}
