import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { CustomerDetail, CustomerSummary } from "./service"

const CUSTOMER_ERRORS = {
  notFound: () => new IdentityError("CUSTOMER_NOT_FOUND", 404, "business", "Customer not found."),
}

export interface CreateCustomerInput {
  organizationId: string
  workspaceId: string | null
  createdBy: string | null
  name: string
  email: string | null
  phone: string | null
  notes: string | null
}

export interface NativeCustomerView {
  id: string
  workspaceId: string | null
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface CustomerRow {
  id: string
  workspace_id: string | null
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapRow(row: CustomerRow): NativeCustomerView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

const CUSTOMER_SELECT = `
  SELECT id, workspace_id, name, email, phone, notes, created_at, updated_at
    FROM customers
   WHERE deleted_at IS NULL
`

// A native customer has no order history of its own here -- a POS sale keeps its customer as a
// free-text snapshot on pos_invoices (see invoices-service.ts), not a foreign key to this table.
// So a freshly created native customer always reads as brand new: no real orders yet to compute
// totalOrders/lifetimeValue/status/segment from, the same numbers computeStatus/computeSegment
// in service.ts would themselves produce for zero real orders.
export function toNormalizedCustomer(customer: NativeCustomerView): CustomerSummary {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone,
    platform: "Madar",
    createdAt: customer.createdAt,
    totalOrders: 0,
    totalRevenue: 0,
    lifetimeValue: 0,
    lastPurchaseAt: null,
    status: "new",
    segment: "New",
  }
}

// Same "nothing real to show yet" reasoning as toNormalizedCustomer -- a native customer has no
// order history of its own to list, no products purchased, and no average to compute.
export function toNormalizedCustomerDetail(customer: NativeCustomerView): CustomerDetail {
  return {
    ...toNormalizedCustomer(customer),
    orders: [],
    productsPurchased: [],
    averageOrderValue: 0,
  }
}

// Native (Madar-authored) customers -- sits alongside the synced-storefront aggregation in
// service.ts the same way native products sit alongside synced products in catalog-service.ts.
// See migration 060_native_customers.sql for why this exists and what it deliberately omits.
export class NativeCustomersService {
  constructor(private readonly database: PostgresDatabase) {}

  async list(organizationId: string, workspaceId: string | null): Promise<NativeCustomerView[]> {
    const conditions = ["organization_id = $1"]
    const params: unknown[] = [organizationId]
    if (workspaceId) {
      params.push(workspaceId)
      conditions.push(`workspace_id = $${params.length}`)
    }

    const result = await this.database.query<CustomerRow>(
      `${CUSTOMER_SELECT} AND ${conditions.join(" AND ")} ORDER BY created_at DESC`,
      params
    )
    return result.rows.map(mapRow)
  }

  async create(input: CreateCustomerInput): Promise<NativeCustomerView> {
    const id = randomUUID()
    await this.database.query(
      `INSERT INTO customers (id, organization_id, workspace_id, name, email, phone, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.name,
        input.email,
        input.phone,
        input.notes,
        input.createdBy,
      ]
    )

    const created = await this.getById(input.organizationId, id)
    if (!created) throw CUSTOMER_ERRORS.notFound()
    return created
  }

  async getById(organizationId: string, id: string): Promise<NativeCustomerView | null> {
    const result = await this.database.query<CustomerRow>(
      `${CUSTOMER_SELECT} AND organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    const row = result.rows[0]
    return row ? mapRow(row) : null
  }
}
