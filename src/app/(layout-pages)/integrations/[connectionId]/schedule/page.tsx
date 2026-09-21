import { ScheduleSettings } from "@/features/integrations"

// Same reasoning as the parent [connectionId]/page.tsx: every connectionId here is per-request
// data, so this must stay dynamic rather than being swept into a zero-page SSG bucket.
export const dynamic = "force-dynamic"

export default async function IntegrationSchedulePage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  return <ScheduleSettings connectionId={connectionId} />
}
