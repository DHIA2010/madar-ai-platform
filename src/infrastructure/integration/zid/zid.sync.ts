import type {
  IntegrationEvent,
  SyncJob,
  SyncResult,
} from "@/application/contracts/integration.contracts"

import { ZidGateway } from "./zid.gateway"
import { ZidMapper } from "./zid.mapper"

function nowIso() {
  return new Date().toISOString()
}

export interface ZidSyncOutput {
  result: SyncResult
  integrationEvents: IntegrationEvent[]
  summary: {
    mode: "initial" | "incremental" | "manual" | "webhook"
    products: number
    orders: number
    customers: number
    inventory: number
    categories: number
    brands: number
    collections: number
  }
}

export class ZidSync {
  constructor(private readonly gateway: ZidGateway) {}

  async run(connectionId: string, job: SyncJob, lastSyncedAt?: string): Promise<ZidSyncOutput> {
    const mode: ZidSyncOutput["summary"]["mode"] =
      job.trigger === "webhook"
        ? "webhook"
        : job.trigger === "manual"
          ? "manual"
          : lastSyncedAt
            ? "incremental"
            : "initial"

    const fetchMode = lastSyncedAt ? "incremental" : "initial"

    const [
      productsRaw,
      ordersRaw,
      customersRaw,
      inventoryRaw,
      categoriesRaw,
      brandsRaw,
      collectionsRaw,
    ] = await Promise.all([
      this.gateway.fetchProducts(fetchMode),
      this.gateway.fetchOrders(fetchMode),
      this.gateway.fetchCustomers(fetchMode),
      this.gateway.fetchInventory(fetchMode),
      this.gateway.fetchCategories(),
      this.gateway.fetchBrands(),
      this.gateway.fetchCollections(),
    ])

    const products = productsRaw.map((item) => ZidMapper.mapProduct(item))
    const orders = ordersRaw.map((item) => ZidMapper.mapOrder(item))
    const customers = customersRaw.map((item) => ZidMapper.mapCustomer(item))
    const inventory = inventoryRaw.map((item) => ZidMapper.mapInventory(item))
    const categories = categoriesRaw.map((item) => ZidMapper.mapCategory(item))
    const brands = brandsRaw.map((item) => ZidMapper.mapBrand(item))
    const collections = collectionsRaw.map((item) => ZidMapper.mapCollection(item))

    const startedAt = nowIso()
    const finishedAt = nowIso()

    const integrationEvents: IntegrationEvent[] = [
      {
        eventId: `zid_evt_${Date.now()}_mode`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `zid.sync.mode:${mode}`,
      },
      {
        eventId: `zid_evt_${Date.now()}_products`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.products.synced:${products.length}`,
      },
      {
        eventId: `zid_evt_${Date.now()}_orders`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.orders.synced:${orders.length}`,
      },
      {
        eventId: `zid_evt_${Date.now()}_customers`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.customers.synced:${customers.length}`,
      },
      {
        eventId: `zid_evt_${Date.now()}_inventory`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.inventory.synced:${inventory.length}`,
      },
      {
        eventId: `zid_evt_${Date.now()}_categories`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.categories.synced:${categories.length}`,
      },
      {
        eventId: `zid_evt_${Date.now()}_brands`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.brands.synced:${brands.length}`,
      },
      {
        eventId: `zid_evt_${Date.now()}_collections`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.collections.synced:${collections.length}`,
      },
    ]

    return {
      result: {
        recordsRead:
          productsRaw.length +
          ordersRaw.length +
          customersRaw.length +
          inventoryRaw.length +
          categoriesRaw.length +
          brandsRaw.length +
          collectionsRaw.length,
        recordsWritten:
          products.length +
          orders.length +
          customers.length +
          inventory.length +
          categories.length +
          brands.length +
          collections.length,
        recordsFailed: 0,
        durationMs: 1400,
        startedAt,
        finishedAt,
        message: `Zid ${mode} sync completed`,
      },
      integrationEvents,
      summary: {
        mode,
        products: products.length,
        orders: orders.length,
        customers: customers.length,
        inventory: inventory.length,
        categories: categories.length,
        brands: brands.length,
        collections: collections.length,
      },
    }
  }
}
