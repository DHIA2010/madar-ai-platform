import { ConnectionSyncHistory } from "@/features/integrations"

export default async function IntegrationHistoryPage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  return <ConnectionSyncHistory connectionId={connectionId} />
}
