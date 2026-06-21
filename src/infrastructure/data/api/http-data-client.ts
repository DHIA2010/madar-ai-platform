import type { ApiClient } from "@/infrastructure/http"
import { createApiClient } from "@/infrastructure/http"

import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"

interface HttpDataClientOptions {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
}

export function createHttpDataClient(options: HttpDataClientOptions = {}): ApiClient {
  return createApiClient({
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
    retryPolicy: {
      enabled: true,
      attempts: 3,
      delayMs: 250,
    },
  })
}
