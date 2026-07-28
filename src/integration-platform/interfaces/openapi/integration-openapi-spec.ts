export const integrationOpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Integration Platform API",
    version: "0.1.0",
    description: "Reusable platform APIs for connectors, credentials, OAuth, sync, and webhooks.",
  },
  paths: {
    "/v1/connectors": {},
    "/v1/connectors/{connectorId}/capabilities": {},
    "/v1/connectors/{connectorId}/health": {},
    "/v1/connections": {},
    "/v1/connections/{connectionId}": {},
    "/v1/connections/{connectionId}/disconnect": {},
    "/v1/connections/{connectionId}/oauth/start": {},
    "/v1/oauth/callback": {},
    "/v1/connections/{connectionId}/sync": {},
    "/v1/sync-jobs/{syncJobId}/cancel": {},
    "/v1/connections/{connectionId}/webhooks": {},
  },
} as const
