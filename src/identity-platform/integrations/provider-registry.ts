import type { AuthenticatedActor } from "../application/dto/identity-dtos"

export interface IntegrationProviderSyncInput {
  connectionId: string
  customerId: string
  startDate: string
  endDate: string
  idempotencyKey: string
  mode?: "full" | "incremental"
}

export interface IntegrationProviderRecordQuery {
  connectionId: string
  customerId: string
  entityType?: string
  startDate?: string
  endDate?: string
  pageSize?: number
}

export interface IntegrationProviderAccountsQuery {
  connectionId: string
}

export interface IntegrationProvider {
  providerId: string
  displayName: string
  sync?(actor: AuthenticatedActor, input: IntegrationProviderSyncInput): Promise<unknown>
  listRecords?(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery): Promise<unknown>
  listAccounts?(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery): Promise<unknown>
}

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