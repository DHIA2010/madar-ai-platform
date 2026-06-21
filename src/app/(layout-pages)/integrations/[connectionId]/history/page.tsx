import { ConnectionSyncHistory } from "@/features/integrations"

const STATIC_CONNECTION_ID_PARAMS = Array.from({ length: 200 }, (_, index) => {
  const serial = String(index + 1)
  return [{ connectionId: `conn_${serial.padStart(6, "0")}` }, { connectionId: `conn_${serial}` }]
}).flat()

export function generateStaticParams() {
  return STATIC_CONNECTION_ID_PARAMS
}

export default async function IntegrationHistoryPage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  return <ConnectionSyncHistory connectionId={connectionId} />
}
