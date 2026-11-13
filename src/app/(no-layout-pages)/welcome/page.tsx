import { ProtectedRoute, WelcomeScreen } from "@/features/authentication/components"
import { SignUpFunnelTagManager } from "@/features/marketing-site/components/sign-up-funnel-tag-manager"

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <>
      <SignUpFunnelTagManager searchParams={await searchParams} allowedParams={["signup"]} />
      <ProtectedRoute>
        <WelcomeScreen />
      </ProtectedRoute>
    </>
  )
}
