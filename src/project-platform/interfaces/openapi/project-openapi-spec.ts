export const projectOpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Project Platform API",
    version: "0.1.0",
    description: "Project and Data Source abstraction APIs for MADAR Sprint 5.",
  },
  paths: {
    "/live": {},
    "/health": {},
    "/ready": {},
    "/version": {},
    "/v1/projects": {},
    "/v1/projects/{projectId}": {},
    "/v1/projects/{projectId}/data-sources": {},
    "/v1/projects/{projectId}/invitations": {},
    "/v1/data-sources/{dataSourceId}": {},
  },
} as const
