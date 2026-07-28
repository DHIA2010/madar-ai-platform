import {
  createIdentityPlatformContainer,
  type IdentityPlatformContainer,
} from "../dependency-injection/container"

export function createIdentityPlatform(
  options?: Parameters<typeof createIdentityPlatformContainer>[0]
): IdentityPlatformContainer {
  return createIdentityPlatformContainer(options)
}

export type { IdentityPlatformContainer }
