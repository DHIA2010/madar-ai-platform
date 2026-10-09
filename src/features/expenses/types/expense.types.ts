export type ExpensePaymentMethod = "cash" | "bank_transfer" | "card" | "cheque"

export const EXPENSE_PAYMENT_METHODS: Array<{ value: ExpensePaymentMethod; label: string }> = [
  { value: "cash", label: "نقدًا" },
  { value: "bank_transfer", label: "حوالة بنكية" },
  { value: "card", label: "بطاقة" },
  { value: "cheque", label: "شيك" },
]

export const EXPENSE_TAX_OPTIONS: Array<{ value: "inclusive" | "exclusive"; label: string }> = [
  { value: "exclusive", label: "غير شامل الضريبة" },
  { value: "inclusive", label: "شامل الضريبة" },
]

export interface ExpenseCategory {
  id: string
  organizationId: string
  name: string
  createdAt: string
}

// Organization-level only -- never linked to a supplier/vendor.
export interface Expense {
  id: string
  organizationId: string
  workspaceId: string
  workspaceName: string
  categoryId: string
  categoryName: string
  name: string
  amount: number
  paymentMethod: ExpensePaymentMethod
  taxInclusive: boolean
  expenseDate: string
  referenceNumber: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ExpenseFormValues {
  workspaceId: string
  categoryId: string
  name: string
  amount: number
  paymentMethod: ExpensePaymentMethod
  taxInclusive: boolean
  expenseDate: string
  referenceNumber: string
  notes: string
}

export const EMPTY_EXPENSE_FORM_VALUES: ExpenseFormValues = {
  workspaceId: "",
  categoryId: "",
  name: "",
  amount: 0,
  paymentMethod: "cash",
  taxInclusive: false,
  expenseDate: "",
  referenceNumber: "",
  notes: "",
}
