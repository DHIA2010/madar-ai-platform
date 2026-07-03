import { writeFile } from "node:fs/promises"

import { identityOpenApiSpec } from "./identity-openapi-spec"

const outputPath = new URL("../../openapi/openapi.json", import.meta.url)

async function main() {
  await writeFile(outputPath, JSON.stringify(identityOpenApiSpec, null, 2))
  process.stdout.write("Identity OpenAPI written to src/identity-platform/openapi/openapi.json\n")
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exit(1)
})
