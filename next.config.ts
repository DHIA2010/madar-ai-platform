import path from "path"
import type { NextConfig } from "next"
import bundleAnalyzer from "@next/bundle-analyzer"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/pulse-ui-next",
  assetPrefix: "/pulse-ui-next/",
  trailingSlash: true,
  turbopack: {
    root: path.resolve(process.cwd()),
  },
  outputFileTracingRoot: path.resolve(process.cwd()),
}

export default withBundleAnalyzer(nextConfig)
