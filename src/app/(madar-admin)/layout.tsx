import { Toaster } from "sonner"

import { MadarAdminShell } from "@/components/layout/madar-admin-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProtectedRoute } from "@/features/authentication/components"

// No requireWorkspace: this console manages every tenant, not one workspace the logged-in user
// belongs to -- ProtectedRoute's workspace gate makes no sense here. requirePlatformAdmin gates on
// the PLATFORM_ADMIN_EMAILS allowlist (see AuthenticatedActor.isPlatformAdmin) -- any other
// authenticated customer is redirected to their own dashboard.
export default function MadarAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requirePlatformAdmin>
      <TooltipProvider delayDuration={0}>
        <MadarAdminShell>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </MadarAdminShell>
      </TooltipProvider>
    </ProtectedRoute>
  )
}
