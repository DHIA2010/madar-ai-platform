import ShiftDetailPage from "./ShiftDetailPage"

// generateStaticParams() returning [] with no other dynamic signal makes Next.js's build
// analyzer classify this whole route as SSG with zero pages, which then cannot serve any real
// shiftId at runtime (500 Internal Server Error, digest DYNAMIC_SERVER_USAGE) -- the same
// gotcha already documented on integrations/[connectionId]. Every shift id here is genuinely
// per-request data, so force dynamic rendering explicitly instead.
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params
  return <ShiftDetailPage shiftId={decodeURIComponent(shiftId)} />
}
