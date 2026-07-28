export class SimpleRateLimiter {
  private lastRequestAt = 0

  constructor(private readonly minIntervalMs: number) {}

  async waitTurn(nowFn: () => number = Date.now) {
    const now = nowFn()
    const elapsed = now - this.lastRequestAt
    const waitMs = Math.max(0, this.minIntervalMs - elapsed)
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
    }

    this.lastRequestAt = nowFn()
  }
}
