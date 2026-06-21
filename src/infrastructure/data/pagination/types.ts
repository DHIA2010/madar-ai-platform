export interface PaginationRequestDto {
  page?: number
  pageSize?: number
  cursor?: string
}

export interface PaginationMetaDto {
  page: number
  pageSize: number
  total: number
  hasNextPage: boolean
  nextCursor?: string
}

export interface PaginatedResponseDto<TItem> {
  items: TItem[]
  meta: PaginationMetaDto
}

export function normalizePaginationRequest(
  input?: PaginationRequestDto
): Required<Pick<PaginationRequestDto, "page" | "pageSize">> {
  return {
    page: Math.max(1, input?.page ?? 1),
    pageSize: Math.max(1, input?.pageSize ?? 20),
  }
}
