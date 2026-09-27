import { ZidAutoLoginHandoff } from "@/features/authentication/components/zid-auto-login-handoff"

// Every handoff token is per-request data (a single-use, short-lived login handoff) -- force
// dynamic rendering so Next.js doesn't classify this as a zero-page SSG route (see the identical
// rationale on the claim page next to this one).
export const dynamic = "force-dynamic"

export default async function ZidAutoLoginPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ZidAutoLoginHandoff handoffToken={decodeURIComponent(token)} />
}
