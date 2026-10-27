import { ProtectedRoute, WelcomeScreen } from "@/features/authentication/components"

export default function WelcomePage() {
  return (
    <ProtectedRoute>
      <WelcomeScreen />
    </ProtectedRoute>
  )
}
