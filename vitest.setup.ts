import { vi } from "vitest"

// next/font is a build-time transform with no runtime implementation outside Next's own
// compiler, so calling it under Vitest throws ("Cairo is not a function"). Stubbed globally here
// rather than per-file: @/components/app's barrel (index.ts re-exports everything) now pulls in
// this typeface via searchable-select.tsx, so importing anything from "@/components/app" --
// something most feature component tests do -- transitively hits it.
vi.mock("@/components/design/fonts", () => ({
  cairo: { className: "font-cairo", variable: "--font-cairo" },
}))
