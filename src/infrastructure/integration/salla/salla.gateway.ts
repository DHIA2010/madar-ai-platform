import type { AccessToken, RefreshToken } from "@/application/contracts/integration.contracts"

import type {
  SallaCustomerDto,
  SallaOAuthTokenResponseDto,
  SallaOrderDto,
  SallaProductDto,
} from "./salla.dtos"

function nowIso() {
  return new Date().toISOString()
}

export class SallaGateway {
  async exchangeAuthorizationCode(
    connectionId: string,
    authorizationCode?: string
  ): Promise<SallaOAuthTokenResponseDto> {
    const codeSeed = authorizationCode ?? "default"
    return {
      access_token: `salla_access_${connectionId}_${codeSeed}`,
      refresh_token: `salla_refresh_${connectionId}_${codeSeed}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async refreshAccessToken(
    connectionId: string,
    refreshToken?: RefreshToken
  ): Promise<SallaOAuthTokenResponseDto> {
    const tokenSeed = refreshToken?.value ?? "seed"
    return {
      access_token: `salla_access_${connectionId}_${Date.now()}_${tokenSeed}`,
      refresh_token: `salla_refresh_${connectionId}_${Date.now()}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async validateToken(accessToken?: AccessToken): Promise<boolean> {
    if (!accessToken) {
      return false
    }

    return new Date(accessToken.expiresAt).getTime() > Date.now()
  }

  async fetchProducts(mode: "initial" | "incremental"): Promise<SallaProductDto[]> {
    const commonUpdatedAt = nowIso()
    const products: SallaProductDto[] = [
      {
        id: "salla_prod_1",
        name: "Salla Shirt",
        sku: "SSL-SHIRT-1",
        price: 120,
        currency: "SAR",
        quantity: 18,
        category_ids: ["cat_apparel"],
        brand: "Madar",
        collection_ids: ["col_spring"],
        updated_at: commonUpdatedAt,
      },
    ]

    if (mode === "initial") {
      products.push({
        id: "salla_prod_2",
        name: "Salla Mug",
        sku: "SSL-MUG-1",
        price: 45,
        currency: "SAR",
        quantity: 42,
        category_ids: ["cat_home"],
        brand: "Madar",
        collection_ids: ["col_home"],
        updated_at: commonUpdatedAt,
      })
    }

    return products
  }

  async fetchOrders(mode: "initial" | "incremental"): Promise<SallaOrderDto[]> {
    const orders: SallaOrderDto[] = [
      {
        id: "salla_ord_1",
        customer_id: "salla_cust_1",
        total: 180,
        currency: "SAR",
        status: "paid",
        discount_total: 10,
        items_count: 2,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      orders.push({
        id: "salla_ord_2",
        customer_id: "salla_cust_2",
        total: 320,
        currency: "SAR",
        status: "completed",
        discount_total: 0,
        items_count: 3,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    return orders
  }

  async fetchCustomers(mode: "initial" | "incremental"): Promise<SallaCustomerDto[]> {
    const customers: SallaCustomerDto[] = [
      {
        id: "salla_cust_1",
        email: "customer1@salla.test",
        phone: "+966500000001",
        first_name: "Aisha",
        last_name: "Saleh",
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      customers.push({
        id: "salla_cust_2",
        email: "customer2@salla.test",
        phone: "+966500000002",
        first_name: "Hassan",
        last_name: "Ali",
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    return customers
  }
}
