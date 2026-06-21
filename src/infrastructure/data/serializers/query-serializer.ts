import type { FilterCollection } from "../filters/types"
import type { PaginationRequestDto } from "../pagination/types"

export function serializeFilters(filters?: FilterCollection): Record<string, string> {
  if (!filters || filters.length === 0) {
    return {}
  }

  return filters.reduce<Record<string, string>>((acc, filter, index) => {
    const operator = filter.operator ?? "eq"
    const value = Array.isArray(filter.value) ? filter.value.join(",") : String(filter.value)
    acc[`filter_${index}`] = `${filter.field}:${operator}:${value}`
    return acc
  }, {})
}

export function serializePagination(input?: PaginationRequestDto): Record<string, string> {
  if (!input) {
    return {}
  }

  const serialized: Record<string, string> = {}

  if (input.page !== undefined) {
    serialized.page = String(input.page)
  }

  if (input.pageSize !== undefined) {
    serialized.pageSize = String(input.pageSize)
  }

  if (input.cursor) {
    serialized.cursor = input.cursor
  }

  return serialized
}
