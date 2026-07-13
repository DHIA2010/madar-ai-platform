export class IntegrationProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly status: number = 400,
    public readonly details?: unknown
  ) {
    super(message)
  }
}
