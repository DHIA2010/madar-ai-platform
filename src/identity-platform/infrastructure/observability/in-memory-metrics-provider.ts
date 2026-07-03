import type { MetricsProvider } from "../../application/ports"

export class InMemoryMetricsProvider implements MetricsProvider {
  readonly counters = new Map<string, number>()
  readonly histograms = new Map<string, number[]>()

  private metricKey(name: string, tags?: Record<string, string>) {
    if (!tags || Object.keys(tags).length === 0) {
      return name
    }
    return `${name}:${Object.entries(tags).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join(",")}`
  }

  incrementCounter(name: string, value = 1, tags?: Record<string, string>) {
    const key = this.metricKey(name, tags)
    this.counters.set(key, (this.counters.get(key) ?? 0) + value)
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>) {
    const key = this.metricKey(name, tags)
    const existing = this.histograms.get(key) ?? []
    existing.push(value)
    this.histograms.set(key, existing)
  }
}
