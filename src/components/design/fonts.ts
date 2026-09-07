import { Tajawal } from "next/font/google"

// The dashboard design's typeface, shared by every screen built on it. Lives beside the surface
// primitives rather than inside a feature: src/features/campaign-links has its own copy for its
// dialog, and importing that one from another feature is barred by the cross-feature boundary
// rule in eslint.config (no-restricted-imports), correctly -- a typeface is design-system
// property, not campaign-links property.
//
// next/font/google must be called at module scope, which is also why this is its own file rather
// than living inline in a component.
export const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
  display: "swap",
})
