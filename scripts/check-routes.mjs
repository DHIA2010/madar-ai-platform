import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const scanDirs = [path.join(root, "src", "features"), path.join(root, "src", "components", "app")]
const routePattern = /(["'`])\/(?!\/)([^"'`\s]*)\1/g
const allowedFiles = new Set([path.join(root, "src", "constants", "routes.ts")])

const violations = []

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }

    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      continue
    }

    if (allowedFiles.has(fullPath)) {
      continue
    }

    const content = fs.readFileSync(fullPath, "utf8")
    const matches = [...content.matchAll(routePattern)]

    for (const match of matches) {
      const value = match[0].slice(1, -1)
      if (value.startsWith("/api") || value === "/" || value.includes("${")) {
        continue
      }
      violations.push(`${path.relative(root, fullPath)} -> ${value}`)
    }
  }
}

scanDirs.forEach((dir) => {
  if (fs.existsSync(dir)) {
    walk(dir)
  }
})

if (violations.length > 0) {
  console.error("[routes] Hardcoded route strings detected:")
  violations.forEach((violation) => console.error(` - ${violation}`))
  process.exit(1)
}

console.log("[routes] Route constants validation passed.")
