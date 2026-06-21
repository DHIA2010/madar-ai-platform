import { GuestRoute } from "@/features/authentication/components"

export default function AuthPagesLayout({ children }: { children: React.ReactNode }) {
  return <GuestRoute>{children}</GuestRoute>
}
