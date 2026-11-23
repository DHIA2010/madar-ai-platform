import type { Metadata } from "next"

import { plainPreview } from "@/features/booking/services/link-preview"
import { OutreachStop } from "@/features/marketing-site/outreach-stop"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  ...plainPreview("إيقاف الرسائل", "اضغط لإيقاف رسائل فريق مدار."),
  robots: { index: false, follow: false },
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <OutreachStop code={decodeURIComponent(code)} />
}
