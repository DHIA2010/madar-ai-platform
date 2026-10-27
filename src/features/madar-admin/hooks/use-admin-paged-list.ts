"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { AdminPage } from "../types/platform-admin.types"

const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 300

// Server-paged list + summary for a Madar Admin table (filters, search, and paging all happen on
// the backend). Any filter change resets to page 1; a stale response from an earlier filter set
// never overwrites a newer one.
export function useAdminPagedList<TRow, TFilters extends { search?: string }, TSummary>(input: {
  initialFilters: TFilters
  fetchPage: (filters: TFilters, page: number, pageSize: number) => Promise<AdminPage<TRow>>
  fetchSummary: () => Promise<TSummary>
  onError: (message: string) => void
}) {
  const { fetchPage, fetchSummary, onError } = input
  const [filters, setFilters] = useState<TFilters>(input.initialFilters)
  const [debouncedFilters, setDebouncedFilters] = useState<TFilters>(input.initialFilters)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AdminPage<TRow> | null>(null)
  const [summary, setSummary] = useState<TSummary | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Loading is derived: true until the response for the current request has settled.
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const requestId = useRef(0)
  const requestKey = `${JSON.stringify(debouncedFilters)}|${page}|${reloadKey}`

  // Search is debounced; every other filter applies immediately.
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedFilters(filters),
      filters.search === debouncedFilters.search ? 0 : SEARCH_DEBOUNCE_MS
    )
    return () => clearTimeout(timeout)
  }, [filters, debouncedFilters.search])

  useEffect(() => {
    const id = ++requestId.current
    fetchPage(debouncedFilters, page, PAGE_SIZE)
      .then((next) => {
        if (id === requestId.current) setResult(next)
      })
      .catch(() => {
        if (id === requestId.current) onError("تعذر تحميل البيانات.")
      })
      .finally(() => {
        if (id === requestId.current) setSettledKey(requestKey)
      })
  }, [debouncedFilters, page, requestKey, fetchPage, onError])

  useEffect(() => {
    fetchSummary()
      .then(setSummary)
      .catch(() => onError("تعذر تحميل الملخص."))
  }, [reloadKey, fetchSummary, onError])

  const setFilter = useCallback(<K extends keyof TFilters>(key: K, value: TFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }, [])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  const total = result?.total ?? 0
  return {
    filters,
    setFilter,
    page,
    setPage,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    rows: result?.items ?? [],
    summary,
    loading: settledKey !== requestKey,
    reload,
  }
}
