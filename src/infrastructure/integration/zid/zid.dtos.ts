export interface ZidOAuthTokenResponseDto {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

export interface ZidProductDto {
  id: string
  name: string
  sku: string
  price: number
  currency: string
  inventory_quantity: number
  category_ids: string[]
  brand_id: string
  collection_ids: string[]
  updated_at: string
}

export interface ZidOrderDto {
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

export interface ZidCustomerDto {
  id: string
  email: string
  phone?: string
  first_name: string
  last_name?: string
  created_at: string
  updated_at: string
}

export interface ZidInventoryDto {
  product_id: string
  sku: string
  quantity: number
  updated_at: string
}

export interface ZidCategoryDto {
  id: string
  name: string
  updated_at: string
}

export interface ZidBrandDto {
  id: string
  name: string
  updated_at: string
}

export interface ZidCollectionDto {
  id: string
  name: string
  updated_at: string
}

export interface ZidWebhookEnvelopeDto {
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
  brandId: string
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

export interface CanonicalInventory {
  productId: string
  sku: string
  quantity: number
  updatedAt: string
}

export interface CanonicalCategory {
  id: string
  name: string
  updatedAt: string
}

export interface CanonicalBrand {
  id: string
  name: string
  updatedAt: string
}

export interface CanonicalCollection {
  id: string
  name: string
  updatedAt: string
}

export type ParsedZidWebhookEventType =
  | "order.created"
  | "order.updated"
  | "product.created"
  | "product.updated"
  | "inventory.updated"
  | "customer.created"

export interface ParsedZidWebhook {
  eventType: ParsedZidWebhookEventType
  resourceId: string
  occurredAt: string
}
