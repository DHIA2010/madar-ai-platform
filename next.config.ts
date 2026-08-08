import path from "path"
import type { NextConfig } from "next"
import bundleAnalyzer from "@next/bundle-analyzer"
import createNextIntlPlugin from "next-intl/plugin"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/\/+$/, "") || ""
const normalizedBasePath =
  configuredBasePath && configuredBasePath.startsWith("/")
    ? configuredBasePath
    : configuredBasePath
      ? `/${configuredBasePath}`
      : ""

const nextConfig: NextConfig = {
  ...(normalizedBasePath
    ? {
        basePath: normalizedBasePath,
        assetPrefix: `${normalizedBasePath}/`,
      }
    : {}),
  trailingSlash: true,
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  outputFileTracingRoot: path.resolve(process.cwd()),
}

export default withNextIntl(withBundleAnalyzer(nextConfig))
