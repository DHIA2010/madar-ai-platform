import { SallaMarketplaceInstallClaim } from "@/features/authentication/components/salla-marketplace-install-claim"

// Every claim token is per-request data (an unclaimed Salla marketplace install row) -- force
// dynamic rendering so Next.js doesn't classify this as a zero-page SSG route (same rationale as
// the equivalent Zid route).
export const dynamic = "force-dynamic"

export default async function SallaMarketplaceInstallClaimPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <SallaMarketplaceInstallClaim claimToken={decodeURIComponent(token)} />
}
