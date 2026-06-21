import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  type InfiniteData,
  type QueryClient,
  type QueryFunction,
  type QueryKey,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query"

export function usePaginatedQuery<TData, TError = Error, TKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TData, TError, TData, TKey>
) {
  return useQuery({
    ...options,
    placeholderData: keepPreviousData,
  })
}

export function useRepositoryInfiniteQuery<
  TPage,
  TError = Error,
  TKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UseInfiniteQueryOptions<TPage, TError, InfiniteData<TPage, TPageParam>, TKey, TPageParam>
) {
  return useInfiniteQuery(options)
}

export function useRepositoryMutation<
  TVariables,
  TData = unknown,
  TError = Error,
  TContext = unknown,
>(options: UseMutationOptions<TData, TError, TVariables, TContext>) {
  return useMutation(options)
}

export async function prefetchRepositoryQuery<TData>(input: {
  queryClient: QueryClient
  queryKey: QueryKey
  queryFn: QueryFunction<TData>
  staleTime?: number
}) {
  await input.queryClient.prefetchQuery({
    queryKey: input.queryKey,
    queryFn: input.queryFn,
    staleTime: input.staleTime,
  })
}

export function createBackgroundRefresh(input: {
  queryClient: QueryClient
  queryKey: QueryKey
  intervalMs: number
}) {
  let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
    void input.queryClient.invalidateQueries({ queryKey: input.queryKey, refetchType: "active" })
  }, input.intervalMs)

  return () => {
    if (!timer) {
      return
    }

    clearInterval(timer)
    timer = null
  }
}

export async function optimisticMutation<TData, TVariables>(input: {
  queryClient: QueryClient
  queryKey: QueryKey
  variables: TVariables
  mutate: (variables: TVariables) => Promise<TData>
  applyOptimistic: (current: TData | undefined, variables: TVariables) => TData
  rollback?: (snapshot: TData | undefined) => void
}) {
  await input.queryClient.cancelQueries({ queryKey: input.queryKey })
  const snapshot = input.queryClient.getQueryData<TData>(input.queryKey)

  input.queryClient.setQueryData<TData>(input.queryKey, (current) =>
    input.applyOptimistic(current as TData | undefined, input.variables)
  )

  try {
    const data = await input.mutate(input.variables)
    input.queryClient.setQueryData(input.queryKey, data)
    return data
  } catch (error) {
    input.queryClient.setQueryData(input.queryKey, snapshot)
    input.rollback?.(snapshot)
    throw error
  }
}
