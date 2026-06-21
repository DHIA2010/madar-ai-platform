export interface SallaOAuthTokenResponseDto {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

export interface SallaProductDto {
  id: string
  name: string
  sku: string
  price: number
  currency: string
  quantity: number
  category_ids: string[]
  brand: string
  collection_ids: string[]
  updated_at: string
}

export interface SallaOrderDto {
  id: string
  customer_id: string
  total: number
  currency: string
  status: string
  discount_total: number
  items_count: number
  created_at: string
  updated_at: string
}

export interface SallaCustomerDto {
  id: string
  email: string
  phone?: string
  first_name: string
  last_name?: string
  created_at: string
  updated_at: string
}

export interface SallaWebhookEnvelopeDto {
  event: string
  data: {
    id: string
    updated_at?: string
    created_at?: string
  }
  created_at?: string
}

export interface CanonicalProduct {
  id: string
  title: string
  sku: string
  price: number
  currency: string
  inventory: number
  categoryIds: string[]
  brand: string
  collectionIds: string[]
  updatedAt: string
}

export interface CanonicalOrder {
  id: string
  customerId: string
  total: number
  currency: string
  status: string
  discountTotal: number
  itemCount: number
  createdAt: string
  updatedAt: string
}

export interface CanonicalCustomer {
  id: string
  email: string
  phone?: string
  fullName: string
  createdAt: string
  updatedAt: string
}

export type ParsedSallaWebhookEventType =
  | "order.created"
  | "order.updated"
  | "customer.created"
  | "product.updated"
  | "inventory.updated"

export interface ParsedSallaWebhook {
  eventType: ParsedSallaWebhookEventType
  resourceId: string
  occurredAt: string
}
