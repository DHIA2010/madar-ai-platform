import type { FeatureFlagProvider } from "../../application/ports"
import type { IdentityPlatformConfig } from "../../configuration"

export class EnvironmentFeatureFlagProvider implements FeatureFlagProvider {
  constructor(private readonly config: IdentityPlatformConfig) {}

  async isEnabled(input: { key: string; workspaceId?: string; defaultValue?: boolean }) {
    const direct = this.config.featureFlags[input.key]
    if (typeof direct === "boolean") {
      return direct
    }
    return input.defaultValue ?? false
  }
}
