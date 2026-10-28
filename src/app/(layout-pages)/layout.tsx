import { TooltipProvider } from "@/components/ui/tooltip"
import AdminLayout from "@/components/layout/admin-layout"
import { PlatformAnnouncementBanner } from "@/features/applications"
import { ProtectedRoute } from "@/features/authentication/components"
import { Toaster } from "sonner"

export default function LayoutPages({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireWorkspace>
      <TooltipProvider delayDuration={0}>
        <AdminLayout>
          <PlatformAnnouncementBanner />
          {children}
          <Toaster position="top-right" richColors closeButton />
        </AdminLayout>
      </TooltipProvider>
    </ProtectedRoute>
  )
}
