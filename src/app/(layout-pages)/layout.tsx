import { TooltipProvider } from "@/components/ui/tooltip"
import AdminLayout from "@/components/layout/admin-layout"
import { ProtectedRoute } from "@/features/authentication/components"
import { Toaster } from "sonner"
import ThemeCustomizer from "@/components/theme-customizer"
export default function LayoutPages({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireWorkspace>
      <TooltipProvider delayDuration={0}>
        <AdminLayout>
          {children}
          <Toaster position="top-right" richColors closeButton />
          <ThemeCustomizer />
        </AdminLayout>
      </TooltipProvider>
    </ProtectedRoute>
  )
}
