import { ProtectedRoute } from "@/features/authentication/components"
import { WorkspaceSelectionFlow } from "@/features/workspace"

export default function WorkspaceSelectionPage() {
  return (
    <ProtectedRoute>
      <WorkspaceSelectionFlow />
    </ProtectedRoute>
  )
}
