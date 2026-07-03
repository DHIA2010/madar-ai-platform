import type { ConfigurationProvider } from "../../application/ports"

export class EnvironmentConfigurationProvider implements ConfigurationProvider {
  constructor(private readonly source: Record<string, string | undefined> = process.env) {}

  get(key: string) {
    return this.source[key]
  }

  require(key: string) {
    const value = this.source[key]
    if (!value) {
      throw new Error(`Missing required configuration key: ${key}`)
    }
    return value
  }
}
