import type {
  CanonicalBrand,
  CanonicalCategory,
  CanonicalCollection,
  CanonicalCustomer,
  CanonicalInventory,
  CanonicalOrder,
  CanonicalProduct,
  ZidBrandDto,
  ZidCategoryDto,
  ZidCollectionDto,
  ZidCustomerDto,
  ZidInventoryDto,
  ZidOrderDto,
  ZidProductDto,
} from "./zid.dtos"

export class ZidMapper {
  static mapProduct(input: ZidProductDto): CanonicalProduct {
    return {
      id: input.id,
      title: input.name,
      sku: input.sku,
      price: input.price,
      currency: input.currency,
      inventory: input.inventory_quantity,
      categoryIds: input.category_ids,
      brandId: input.brand_id,
      collectionIds: input.collection_ids,
      updatedAt: input.updated_at,
    }
  }

  static mapOrder(input: ZidOrderDto): CanonicalOrder {
    return {
      id: input.id,
      customerId: input.customer_id,
      total: input.total,
      currency: input.currency,
      status: input.status,
      discountTotal: input.discount_total,
      itemCount: input.items_count,
      createdAt: input.created_at,
      updatedAt: input.updated_at,
    }
  }

  static mapCustomer(input: ZidCustomerDto): CanonicalCustomer {
    return {
      id: input.id,
      email: input.email,
      phone: input.phone,
      fullName: `${input.first_name} ${input.last_name ?? ""}`.trim(),
      createdAt: input.created_at,
      updatedAt: input.updated_at,
    }
  }

  static mapInventory(input: ZidInventoryDto): CanonicalInventory {
    return {
      productId: input.product_id,
      sku: input.sku,
      quantity: input.quantity,
      updatedAt: input.updated_at,
    }
  }

  static mapCategory(input: ZidCategoryDto): CanonicalCategory {
    return {
      id: input.id,
      name: input.name,
      updatedAt: input.updated_at,
    }
  }

  static mapBrand(input: ZidBrandDto): CanonicalBrand {
    return {
      id: input.id,
      name: input.name,
      updatedAt: input.updated_at,
    }
  }

  static mapCollection(input: ZidCollectionDto): CanonicalCollection {
    return {
      id: input.id,
      name: input.name,
      updatedAt: input.updated_at,
    }
  }
}
