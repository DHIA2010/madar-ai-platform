export interface RequestMetadata {
  correlationId?: string
  requestedAt?: string
  retryAttempt?: number
  source?: string
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown> | string | null
  fieldErrors?: Record<string, string[]>
  traceId?: string
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages?: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
  cursor?: string | null
  nextCursor?: string | null
  previousCursor?: string | null
}

export interface ResponseMetadata {
  correlationId?: string
  requestId?: string
  timestamp?: string
  version?: string
  pagination?: Pagination
}

export interface RequestDto<
  TBody = unknown,
  TQuery extends Record<string, unknown> = Record<string, unknown>,
> {
  body?: TBody
  query?: TQuery
  headers?: Record<string, string>
  metadata?: RequestMetadata
}

export interface ResponseDto<TData = unknown> {
  data: TData
  error?: ApiError | null
  metadata?: ResponseMetadata
}

export type Envelope<TData = unknown> = ResponseDto<TData>

export interface PaginatedResponseDto<TItem> extends ResponseDto<TItem[]> {
  metadata: ResponseMetadata & {
    pagination: Pagination
  }
}

export type ApiResponse<TData = unknown> = ResponseDto<TData>

export type PaginatedResponse<TItem> = PaginatedResponseDto<TItem>
