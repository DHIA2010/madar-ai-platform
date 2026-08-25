import { ZidMarketplaceInstallClaim } from "@/features/authentication/components/zid-marketplace-install-claim"

// Every claim token is per-request data (an unclaimed Zid marketplace install row) -- force
// dynamic rendering so Next.js doesn't classify this as a zero-page SSG route (see the
// identical rationale on the [connectionId] integrations detail route).
export const dynamic = "force-dynamic"

export default async function ZidMarketplaceInstallClaimPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ZidMarketplaceInstallClaim claimToken={decodeURIComponent(token)} />
}
