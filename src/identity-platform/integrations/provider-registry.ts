import type { IntegrationProvider } from "./provider-contracts"

export type {
  IntegrationProvider,
  IntegrationProviderAccountsQuery,
  IntegrationProviderDisconnectInput,
  IntegrationProviderEventsQuery,
  IntegrationProviderOAuthCallbackInput,
  IntegrationProviderOAuthControllerResult,
  IntegrationProviderOAuthStartInput,
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
  IntegrationProviderTimelineEvent,
  IntegrationProviderTimelineResult,
} from "./provider-contracts"

export class IntegrationProviderRegistry {
  private readonly providers = new Map<string, IntegrationProvider>()

  register(provider: IntegrationProvider) {
    this.providers.set(provider.providerId, provider)
    return provider
  }

  find(providerId: string) {
    return this.providers.get(providerId) ?? null
  }

  list() {
    return [...this.providers.values()]
  }
}
