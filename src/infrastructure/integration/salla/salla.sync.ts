import type {
  IntegrationEvent,
  SyncJob,
  SyncResult,
} from "@/application/contracts/integration.contracts"

import { SallaGateway } from "./salla.gateway"
import { SallaMapper } from "./salla.mapper"

function nowIso() {
  return new Date().toISOString()
}

export interface SallaSyncOutput {
  result: SyncResult
  integrationEvents: IntegrationEvent[]
  summary: {
    mode: "initial" | "incremental" | "manual" | "webhook"
    products: number
    orders: number
    customers: number
  }
}

export class SallaSync {
  constructor(private readonly gateway: SallaGateway) {}

  async run(connectionId: string, job: SyncJob, lastSyncedAt?: string): Promise<SallaSyncOutput> {
    const mode: SallaSyncOutput["summary"]["mode"] =
      job.trigger === "webhook"
        ? "webhook"
        : job.trigger === "manual"
          ? "manual"
          : lastSyncedAt
            ? "incremental"
            : "initial"

    const fetchMode = mode === "initial" ? "initial" : "incremental"

    const [productsRaw, ordersRaw, customersRaw] = await Promise.all([
      this.gateway.fetchProducts(fetchMode),
      this.gateway.fetchOrders(fetchMode),
      this.gateway.fetchCustomers(fetchMode),
    ])

    const products = productsRaw.map((item) => SallaMapper.mapProduct(item))
    const orders = ordersRaw.map((item) => SallaMapper.mapOrder(item))
    const customers = customersRaw.map((item) => SallaMapper.mapCustomer(item))

    const startedAt = nowIso()
    const finishedAt = nowIso()

    const events: IntegrationEvent[] = [
      {
        eventId: `salla_evt_${Date.now()}_products`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.products.synced:${products.length}`,
      },
      {
        eventId: `salla_evt_${Date.now()}_orders`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.orders.synced:${orders.length}`,
      },
      {
        eventId: `salla_evt_${Date.now()}_customers`,
        connectionId,
        action: "sync",
        timestamp: finishedAt,
        actor: "system",
        message: `canonical.customers.synced:${customers.length}`,
      },
    ]

    return {
      result: {
        recordsRead: productsRaw.length + ordersRaw.length + customersRaw.length,
        recordsWritten: products.length + orders.length + customers.length,
        recordsFailed: 0,
        durationMs: 1_200,
        startedAt,
        finishedAt,
        message: `Salla ${mode} sync completed`,
      },
      integrationEvents: events,
      summary: {
        mode,
        products: products.length,
        orders: orders.length,
        customers: customers.length,
      },
    }
  }
}
