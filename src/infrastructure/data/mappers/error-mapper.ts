import type { AppError } from "@/lib/app-errors"

import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from "../errors"

export function mapStatusToRepositoryError(
  status: number,
  message: string,
  details?: unknown
): AppError {
  if (status === 400 || status === 422) {
    return new ValidationError({ message, status, details })
  }

  if (status === 401) {
    return new UnauthorizedError({ message, status, details })
  }

  if (status === 403) {
    return new ForbiddenError({ message, status, details })
  }

  if (status === 404) {
    return new NotFoundError({ message, status, details })
  }

  if (status === 408) {
    return new TimeoutError({ message, status, details })
  }

  if (status === 409) {
    return new ConflictError({ message, status, details })
  }

  if (status >= 500) {
    return new NetworkError({ message, status, details })
  }

  return new ApiError({ message, status, details })
}
