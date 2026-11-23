import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { OutreachInterest } from "@/features/marketing-site/outreach-interest"
import { outreachLinkMetadata, outreachLinkOf } from "@/features/marketing-site/outreach-link-data"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ code: string }> }

// The "interested" link carries the message's card too: it is usually the first link in the
// message, and the first link is the one a chat shows a card for.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return outreachLinkMetadata(await outreachLinkOf(decodeURIComponent(code)))
}

export default async function Page({ params }: Props) {
  const { code } = await params
  const decoded = decodeURIComponent(code)
  const link = await outreachLinkOf(decoded)
  if (!link) notFound()
  return <OutreachInterest code={decoded} target={link.target} />
}
