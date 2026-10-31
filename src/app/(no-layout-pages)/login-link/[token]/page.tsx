import { LoginLinkHandoff } from "@/features/authentication/components/login-link-handoff"

// Per-request token -- force dynamic rendering, same as the Zid auto-login page. Outside the
// (auth) group on purpose: its GuestRoute would send an already-signed-in visitor to their own
// dashboard instead of switching to the link's account.
export const dynamic = "force-dynamic"

export default async function LoginLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <LoginLinkHandoff token={decodeURIComponent(token)} />
}
