import { ConnectionSettings } from "@/features/integrations"

export default async function IntegrationSettingsPage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  return <ConnectionSettings connectionId={connectionId} />
}
