import { ConnectionSyncHistory } from "@/features/integrations"

export const dynamicParams = false

export function generateStaticParams() {
  return []
}

export default function IntegrationHistoryPage({
  params,
}: {
  params: { connectionId: string }
}) {
  const { connectionId } = params
  return <ConnectionSyncHistory connectionId={connectionId} />
}
