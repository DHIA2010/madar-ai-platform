import { writeFile } from "node:fs/promises"

import { integrationOpenApiSpec } from "./integration-openapi-spec"

const outputPath = new URL("../../openapi/openapi.json", import.meta.url)

async function main() {
  await writeFile(outputPath, JSON.stringify(integrationOpenApiSpec, null, 2))
  process.stdout.write(
    "Integration OpenAPI written to src/integration-platform/openapi/openapi.json\n"
  )
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exit(1)
})
