import type { AccessToken, RefreshToken } from "@/application/contracts/integration.contracts"

import type {
  ZidBrandDto,
  ZidCategoryDto,
  ZidCollectionDto,
  ZidCustomerDto,
  ZidInventoryDto,
  ZidOAuthTokenResponseDto,
  ZidOrderDto,
  ZidProductDto,
} from "./zid.dtos"

function nowIso() {
  return new Date().toISOString()
}

export class ZidGateway {
  async exchangeAuthorizationCode(
    connectionId: string,
    authorizationCode?: string
  ): Promise<ZidOAuthTokenResponseDto> {
    const codeSeed = authorizationCode ?? "default"
    return {
      access_token: `zid_access_${connectionId}_${codeSeed}`,
      refresh_token: `zid_refresh_${connectionId}_${codeSeed}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async refreshAccessToken(
    connectionId: string,
    refreshToken?: RefreshToken
  ): Promise<ZidOAuthTokenResponseDto> {
    const tokenSeed = refreshToken?.value ?? "seed"
    return {
      access_token: `zid_access_${connectionId}_${Date.now()}_${tokenSeed}`,
      refresh_token: `zid_refresh_${connectionId}_${Date.now()}`,
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

  async fetchProducts(mode: "initial" | "incremental"): Promise<ZidProductDto[]> {
    const products: ZidProductDto[] = [
      {
        id: "zid_prod_1",
        name: "Zid Shirt",
        sku: "ZID-SHIRT-1",
        price: 180,
        currency: "SAR",
        inventory_quantity: 25,
        category_ids: ["zid_cat_apparel"],
        brand_id: "zid_brand_madar",
        collection_ids: ["zid_col_summer"],
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      products.push({
        id: "zid_prod_2",
        name: "Zid Cap",
        sku: "ZID-CAP-1",
        price: 65,
        currency: "SAR",
        inventory_quantity: 40,
        category_ids: ["zid_cat_accessories"],
        brand_id: "zid_brand_madar",
        collection_ids: ["zid_col_basics"],
        updated_at: nowIso(),
      })
    }

    return products
  }

  async fetchOrders(mode: "initial" | "incremental"): Promise<ZidOrderDto[]> {
    const orders: ZidOrderDto[] = [
      {
        id: "zid_ord_1",
        customer_id: "zid_cust_1",
        total: 245,
        currency: "SAR",
        status: "paid",
        discount_total: 15,
        items_count: 2,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      orders.push({
        id: "zid_ord_2",
        customer_id: "zid_cust_2",
        total: 420,
        currency: "SAR",
        status: "completed",
        discount_total: 0,
        items_count: 4,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    return orders
  }

  async fetchCustomers(mode: "initial" | "incremental"): Promise<ZidCustomerDto[]> {
    const customers: ZidCustomerDto[] = [
      {
        id: "zid_cust_1",
        email: "customer1@zid.test",
        phone: "+966511111111",
        first_name: "Maha",
        last_name: "Khalid",
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      customers.push({
        id: "zid_cust_2",
        email: "customer2@zid.test",
        phone: "+966522222222",
        first_name: "Omar",
        last_name: "Nasser",
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    return customers
  }

  async fetchInventory(mode: "initial" | "incremental"): Promise<ZidInventoryDto[]> {
    const inventory: ZidInventoryDto[] = [
      {
        product_id: "zid_prod_1",
        sku: "ZID-SHIRT-1",
        quantity: 25,
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      inventory.push({
        product_id: "zid_prod_2",
        sku: "ZID-CAP-1",
        quantity: 40,
        updated_at: nowIso(),
      })
    }

    return inventory
  }

  async fetchCategories(): Promise<ZidCategoryDto[]> {
    return [
      { id: "zid_cat_apparel", name: "Apparel", updated_at: nowIso() },
      { id: "zid_cat_accessories", name: "Accessories", updated_at: nowIso() },
    ]
  }

  async fetchBrands(): Promise<ZidBrandDto[]> {
    return [{ id: "zid_brand_madar", name: "Madar", updated_at: nowIso() }]
  }

  async fetchCollections(): Promise<ZidCollectionDto[]> {
    return [
      { id: "zid_col_summer", name: "Summer", updated_at: nowIso() },
      { id: "zid_col_basics", name: "Basics", updated_at: nowIso() },
    ]
  }
}
