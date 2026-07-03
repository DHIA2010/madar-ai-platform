import { ConnectionDetails } from "@/features/integrations"

export default async function IntegrationDetailsPage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  return <ConnectionDetails connectionId={connectionId} />
}
