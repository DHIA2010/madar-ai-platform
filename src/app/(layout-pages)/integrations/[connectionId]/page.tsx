import { ConnectionDetails } from "@/features/integrations"

// generateStaticParams() returning [] with no other dynamic signal makes Next.js's build
// analyzer classify this whole route as SSG with zero pages, which then cannot serve any
// real connectionId at runtime (500 Internal Server Error, digest DYNAMIC_SERVER_USAGE).
// Every connection id here is genuinely per-request data, so force dynamic rendering
// explicitly instead of relying on generateStaticParams' fallback heuristics.
export const dynamic = "force-dynamic"

export default async function IntegrationDetailsPage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  return <ConnectionDetails connectionId={connectionId} />
}
