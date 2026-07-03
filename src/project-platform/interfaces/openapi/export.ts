import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { projectOpenApiSpec } from "./project-openapi-spec"

const outputPath = new URL("../../openapi/openapi.json", import.meta.url)

async function main() {
  await mkdir(dirname(fileURLToPath(outputPath)), { recursive: true })
  await writeFile(outputPath, JSON.stringify(projectOpenApiSpec, null, 2))
  process.stdout.write("Project OpenAPI written to src/project-platform/openapi/openapi.json\n")
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exit(1)
})
