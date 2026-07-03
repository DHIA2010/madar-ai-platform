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

const requiredEntries = lines
  .map((line) => {
    const separatorIndex = line.indexOf("=")
    const key = (separatorIndex === -1 ? line : line.slice(0, separatorIndex)).trim()
    const exampleValue = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1)

    return key ? { key, exampleValue } : null
  })
  .filter(Boolean)

const missing = requiredEntries
  .filter(({ key, exampleValue }) => {
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      return true
    }

    return exampleValue !== "" && process.env[key] === ""
  })
  .map(({ key }) => key)

if (missing.length > 0) {
  console.error(`[env] Missing required environment variables: ${missing.join(", ")}`)
  process.exit(1)
}

console.log(`[env] Validation passed for ${requiredEntries.length} variables.`)
