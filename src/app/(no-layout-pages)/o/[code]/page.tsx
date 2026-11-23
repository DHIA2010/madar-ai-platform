import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { OutreachLink } from "@/features/marketing-site/outreach-link"
import { outreachLinkMetadata, outreachLinkOf } from "@/features/marketing-site/outreach-link-data"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return outreachLinkMetadata(await outreachLinkOf(decodeURIComponent(code)))
}

export default async function Page({ params }: Props) {
  const { code } = await params
  const decoded = decodeURIComponent(code)
  const link = await outreachLinkOf(decoded)
  if (!link) notFound()
  return <OutreachLink code={decoded} target={link.target} />
}
