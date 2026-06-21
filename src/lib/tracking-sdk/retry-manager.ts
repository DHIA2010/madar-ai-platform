export class RetryManager {
  constructor(
    private readonly maxRetries: number,
    private readonly baseDelayMs = 250
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (attempt === this.maxRetries) {
          break
        }

        const delayMs = this.baseDelayMs * (attempt + 1)
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs)
        })
      }
    }

    throw lastError
  }
}
