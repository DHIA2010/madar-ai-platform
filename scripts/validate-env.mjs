import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const envExamplePath = path.join(root, ".env.example")

if (!fs.existsSync(envExamplePath)) {
  console.error("[env] Missing .env.example")
  process.exit(1)
}

const lines = fs
  .readFileSync(envExamplePath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))

const requiredKeys = lines.map((line) => line.split("=")[0]?.trim()).filter(Boolean)

const missing = requiredKeys.filter((key) => !process.env[key])

if (missing.length > 0) {
  console.error(`[env] Missing required environment variables: ${missing.join(", ")}`)
  process.exit(1)
}

console.log(`[env] Validation passed for ${requiredKeys.length} variables.`)
