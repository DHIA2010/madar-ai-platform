import type {
  CanonicalCustomer,
  CanonicalOrder,
  CanonicalProduct,
  SallaCustomerDto,
  SallaOrderDto,
  SallaProductDto,
} from "./salla.dtos"

export class SallaMapper {
  static mapProduct(input: SallaProductDto): CanonicalProduct {
    return {
      id: input.id,
      title: input.name,
      sku: input.sku,
      price: input.price,
      currency: input.currency,
      inventory: input.quantity,
      categoryIds: input.category_ids,
      brand: input.brand,
      collectionIds: input.collection_ids,
      updatedAt: input.updated_at,
    }
  }

  static mapOrder(input: SallaOrderDto): CanonicalOrder {
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

  static mapCustomer(input: SallaCustomerDto): CanonicalCustomer {
    return {
      id: input.id,
      email: input.email,
      phone: input.phone,
      fullName: `${input.first_name} ${input.last_name ?? ""}`.trim(),
      createdAt: input.created_at,
      updatedAt: input.updated_at,
    }
  }
}
