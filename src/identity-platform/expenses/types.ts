// Mirrors the frontend's Expense/ExpenseCategory shapes field-for-field (src/features/expenses),
// same convention as src/identity-platform/procurement/types.ts. Expenses are organization-level
// (tied to a branch/workspace), never linked to a supplier/vendor.

export type ExpensePaymentMethod = "cash" | "bank_transfer" | "card" | "cheque"

export interface ExpenseCategoryDto {
  id: string
  organizationId: string
  name: string
  createdAt: string
}

export interface ExpenseDto {
  id: string
  organizationId: string
  workspaceId: string
  workspaceName: string
  categoryId: string
  categoryName: string
  name: string
  amount: number
  paymentMethod: ExpensePaymentMethod
  // Whether `amount` already includes VAT ("شامل الضريبة") or excludes it -- a dropdown choice
  // on the form, not a computed tax amount.
  taxInclusive: boolean
  expenseDate: string
  referenceNumber: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface CreateExpenseInput {
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
