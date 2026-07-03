import type { BackendModuleDefinition } from "../backend-foundation/types"

export function createProjectModuleDefinition(): BackendModuleDefinition {
  return {
    id: "project",
    name: "Project Platform",
    version: "0.1.0",
    basePath: "/",
    capabilities: ["project", "data-source"],
    openApiPath: "src/project-platform/openapi/openapi.json",
    healthCheck: async () => ({
      ok: true,
      status: "ok",
      details: {
        mode: "in-memory",
      },
    }),
  }
}
