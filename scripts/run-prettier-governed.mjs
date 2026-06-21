import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const args = process.argv.slice(2)
const mode = args.includes("--write") ? "--write" : "--check"

const targetDirs = [
  "src/components/app",
  "src/features",
  "src/lib",
  "src/services",
  "src/providers",
  "src/constants",
  "src/types",
  "src/hooks",
  "src/store",
  "scripts",
]

const targetFiles = [
  "eslint.config.mjs",
  ".dependency-cruiser.cjs",
  "commitlint.config.cjs",
  "prettier.config.cjs",
  "docs/CONTRIBUTING.md",
  ".github/workflows/quality.yml",
  "package.json",
]

const fileExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
])

function collectFiles(dir, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(fullPath, files)
      continue
    }

    if (fileExtensions.has(path.extname(entry.name))) {
      files.add(path.relative(root, fullPath))
    }
  }
}

const files = new Set()

for (const relDir of targetDirs) {
  const absDir = path.join(root, relDir)
  if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) {
    collectFiles(absDir, files)
  }
}

for (const relFile of targetFiles) {
  const absFile = path.join(root, relFile)
  if (fs.existsSync(absFile) && fs.statSync(absFile).isFile()) {
    files.add(relFile)
  }
}

if (files.size === 0) {
  console.log("[prettier] No governed files found to process.")
  process.exit(0)
}

const sortedFiles = [...files].sort()

execFileSync("npx", ["prettier", mode, ...sortedFiles], {
  cwd: root,
  stdio: "inherit",
})
