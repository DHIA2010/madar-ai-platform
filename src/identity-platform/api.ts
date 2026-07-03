import { createIdentityPlatform } from "./bootstrap/create-identity-platform"
import { createIdentityApiServer as createServerFromContainer } from "./interfaces/rest/server"
import { IdentityPlatformService } from "./service"

export function createIdentityApiServer(serviceOrContainer?: IdentityPlatformService | ReturnType<typeof createIdentityPlatform>) {
	if (!serviceOrContainer) {
		return createServerFromContainer(createIdentityPlatform())
	}

	if (serviceOrContainer instanceof IdentityPlatformService) {
		return createServerFromContainer(serviceOrContainer.container)
	}

	return createServerFromContainer(serviceOrContainer)
}
