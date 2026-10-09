// A small, static, hardcoded list -- no warehouses table/backend exists or is planned (see
// identity-platform/migrations/094_procurement.sql's own comment: purchases.warehouse_id is a
// plain id, not a foreign key, specifically because of this).
export interface PurchaseWarehouse {
  id: string
  name: string
}

export const WAREHOUSES: PurchaseWarehouse[] = [
  { id: "wh-main", name: "المستودع الرئيسي" },
  { id: "wh-secondary", name: "المستودع الثانوي" },
  { id: "wh-central", name: "المستودع المركزي" },
]
