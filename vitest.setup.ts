import { vi } from "vitest"

// next/font is a build-time transform with no runtime implementation outside Next's own
// compiler, so calling it under Vitest throws ("Cairo is not a function"). Stubbed globally here
// rather than per-file: @/components/app's barrel (index.ts re-exports everything) now pulls in
// this typeface via searchable-select.tsx, so importing anything from "@/components/app" --
// something most feature component tests do -- transitively hits it.
vi.mock("@/components/design/fonts", () => ({
  cairo: { className: "font-cairo", variable: "--font-cairo" },
}))

// jsdom has no layout engine, so it doesn't implement scrollIntoView at all -- Radix's Select
// calls it on the highlighted option whenever the dropdown opens, which throws under jsdom and
// fails any test that opens an AppSelect. A no-op is all a test needs (nothing here asserts on
// scroll position).
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
