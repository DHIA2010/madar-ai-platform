import type { FeatureFlagGateway } from "@/application/contracts/infrastructure.contracts"

export class MockFeatureFlagGateway implements FeatureFlagGateway {
  constructor(private flags: Record<string, boolean> = {}) {}

  getFlag(name: string): boolean | undefined {
    return this.flags[name]
  }

  getFlags(): Record<string, boolean> {
    return { ...this.flags }
  }

  isEnabled(name: string): boolean {
    return Boolean(this.flags[name])
  }

  setFlag(name: string, value: boolean) {
    this.flags[name] = value
  }

  setFlags(flags: Record<string, boolean>) {
    this.flags = { ...flags }
  }

  clear() {
    this.flags = {}
  }
}

export function createMockFeatureFlagGateway(
  initialFlags: Record<string, boolean> = {}
): FeatureFlagGateway {
  return new MockFeatureFlagGateway(initialFlags)
}
