export type ExpensePaymentMethod = "cash" | "bank_transfer" | "card" | "cheque"
export type ExpenseStatus = "active" | "cancelled"

export const EXPENSE_PAYMENT_METHOD_VALUES: ExpensePaymentMethod[] = [
  "cash",
  "bank_transfer",
  "card",
  "cheque",
]

// Labels are resolved via t("paymentMethods.<key>") at render time rather than stored here --
// this module has no component/hook scope of its own to call useTranslations from. See
// expenses-list-page.tsx / expense-form.tsx for the t()-driven label lists built from this.
export const EXPENSE_PAYMENT_METHOD_KEYS: Record<ExpensePaymentMethod, string> = {
  cash: "cash",
  bank_transfer: "bankTransfer",
  card: "card",
  cheque: "cheque",
}

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
  status: ExpenseStatus
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
