import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { outreachLinkMetadata, outreachLinkOf } from "@/features/marketing-site/outreach-link-data"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ code: string }> }

// The picture of a WhatsApp message from Madar's CRM. Its link goes first in the message, so the
// chat builds the card from it: tapping the picture opens just the picture -- never the
// "interested" link, which only counts when it is tapped itself.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return outreachLinkMetadata(await outreachLinkOf(decodeURIComponent(code)))
}

export default async function Page({ params }: Props) {
  const { code } = await params
  const link = await outreachLinkOf(decodeURIComponent(code))
  if (!link?.imageUrl) notFound()
  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- the message's own uploaded picture */}
      <img
        src={link.imageUrl}
        alt={link.title ?? "مدار"}
        className="max-h-[96vh] w-auto max-w-full rounded-lg object-contain"
      />
    </main>
  )
}
