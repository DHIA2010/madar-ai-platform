import { Tajawal } from "next/font/google"

// Scoped to the campaign-link creation dialog only (per the supplied design spec) -- the rest
// of the app renders with Inter (see src/app/layout.tsx). next/font/google must be called at
// module scope, so this stays its own file rather than living inline in a component.
export const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
  display: "swap",
})
