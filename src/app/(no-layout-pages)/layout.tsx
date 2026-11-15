import { Toaster } from "sonner"

export default function NoLayoutPages({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-h-screen">
      {children}
      {/* Sign-in, workspace selection and the public document pages report results with toasts
          too; without a Toaster here those messages were silently dropped. */}
      <Toaster position="top-center" richColors closeButton />
    </div>
  )
}
