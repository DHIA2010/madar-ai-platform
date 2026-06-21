import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query"

import { logger } from "@/lib/logger"
import { toAppError } from "@/lib/errors/app-error"

const DEFAULT_STALE_TIME = 60_000
const DEFAULT_GC_TIME = 5 * 60_000

export function createAppQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        logger.error("Query failed", {
          error: toAppError(error),
          queryKey: query.queryKey,
        })
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        logger.error("Mutation failed", {
          error: toAppError(error),
          mutationKey: mutation.options.mutationKey,
        })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME,
        gcTime: DEFAULT_GC_TIME,
        retry: (failureCount, error) => {
          const appError = toAppError(error)

          if (appError.kind === "validation" || appError.kind === "authorization") {
            return false
          }

          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClientDefaults = {
  staleTime: DEFAULT_STALE_TIME,
  gcTime: DEFAULT_GC_TIME,
} as const
