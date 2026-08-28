import type { ApiClient } from "@/infrastructure/http"
import { createApiClient } from "@/infrastructure/http"
import { createSessionManager } from "@/infrastructure/identity"

import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"

interface HttpDataClientOptions {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
  baseUrl?: string
}

export function createHttpDataClient(options: HttpDataClientOptions = {}): ApiClient {
  // A SessionManager purely for the refresh call -- distinct from whatever getSession the
  // caller passed, but backed by the same shared localStorage session, so persisting a
  // refreshed token here is immediately visible to getSession() on the retried request.
  const refreshSessionManager = createSessionManager()

  return createApiClient({
    baseUrl: options.baseUrl,
    getAuthHeaders: (): HeadersInit => {
      const session = options.getSession?.()
      if (!session?.accessToken?.token) {
        return {}
      }

      return {
        authorization: `${session.accessToken.tokenType} ${session.accessToken.token}`,
      }
    },
    requestInterceptors: [
      ({ request }) => {
        const workspaceId = options.getWorkspaceId?.()
        if (!workspaceId) {
          return
        }

        return {
          ...request,
          headers: {
            ...(request.headers ?? {}),
            "x-workspace-id": workspaceId,
          },
          metadata: {
            ...(request.metadata ?? {}),
            tenantId: workspaceId,
          },
        }
      },
    ],
    onUnauthorized: async () => {
      const refreshed = await refreshSessionManager.refreshAccessToken()
      return refreshed !== null
    },
    retryPolicy: {
      enabled: true,
      attempts: 3,
      delayMs: 250,
    },
  })
}
