import { vi } from "vitest"

import arMessages from "./messages/ar.json"

// next/font is a build-time transform with no runtime implementation outside Next's own
// compiler, so calling it under Vitest throws ("Cairo is not a function"). Stubbed globally here
// rather than per-file: @/components/app's barrel (index.ts re-exports everything) now pulls in
// this typeface via searchable-select.tsx, so importing anything from "@/components/app" --
// something most feature component tests do -- transitively hits it.
vi.mock("@/components/design/fonts", () => ({
  cairo: { className: "font-cairo", variable: "--font-cairo" },
}))

// Component tests render translated features with no NextIntlClientProvider in the tree, so
// useTranslations()/useLocale() would otherwise throw. Resolved here against the real ar.json (the
// app's default locale and source of truth for every translation key) instead of a per-test mock,
// so an existing test asserting on the Arabic copy a component used to hardcode keeps passing
// unchanged once that copy moves into messages/ar.json.
function resolvePath(path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      arMessages
    )
}
function formatMessage(template: string, values?: Record<string, unknown>): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  )
}
// Real next-intl memoizes the translator it hands back, so component code is free to put `t` in a
// useCallback/useMemo/useEffect dependency array. Caching by namespace here too -- a fresh
// function identity every render would otherwise re-trigger any such effect on every render (seen
// live as an infinite refetch loop in useCustomers, whose `load` callback depends on `t`).
const translatorCache = new Map<string, ReturnType<typeof createTranslator>>()
function createTranslator(namespace?: string) {
  const t = (key: string, values?: Record<string, unknown>) => {
    const path = namespace ? `${namespace}.${key}` : key
    const value = resolvePath(path)
    return typeof value === "string" ? formatMessage(value, values) : path
  }
  t.raw = (key: string) => {
    const path = namespace ? `${namespace}.${key}` : key
    return resolvePath(path)
  }
  return t
}
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const cacheKey = namespace ?? ""
    let cached = translatorCache.get(cacheKey)
    if (!cached) {
      cached = createTranslator(namespace)
      translatorCache.set(cacheKey, cached)
    }
    return cached
  },
  useLocale: () => "ar",
}))

// jsdom has no layout engine, so it doesn't implement scrollIntoView at all -- Radix's Select
// calls it on the highlighted option whenever the dropdown opens, which throws under jsdom and
// fails any test that opens an AppSelect. A no-op is all a test needs (nothing here asserts on
// scroll position).
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
