export type PrimitiveFilterValue = string | number | boolean

export interface FilterExpression {
  field: string
  operator?: "eq" | "neq" | "contains" | "in" | "gte" | "lte"
  value: PrimitiveFilterValue | PrimitiveFilterValue[]
}

export type FilterCollection = FilterExpression[]
