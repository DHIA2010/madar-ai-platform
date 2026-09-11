import { Cairo } from "next/font/google"

// The design's typeface (Cairo, per the Figma source), shared by every screen built on it.
// Switching to it also fixed a real gap: the previous font (Inter) ships no Arabic glyphs at
// all, so every Arabic string -- which is most of this UI -- fell through to whatever the OS
// happened to pick, and rendered differently per machine -- and the app's root font, since
// src/app/layout.tsx imports this same instance. Keeping it to ONE next/font call matters:
// two calls with differing config generate two separate sets of font files, so the browser
// would download Cairo twice.
//
// Lives beside the surface primitives rather than inside a feature: a typeface is design-system
// property, and the cross-feature boundary rule in eslint.config (no-restricted-imports) bars
// features from importing each other's modules, but not from importing this one.
//
// next/font/google must be called at module scope, which is also why this is its own file rather
// than living inline in a component.
export const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
})
