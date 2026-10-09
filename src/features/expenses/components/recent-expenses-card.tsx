import { cn } from "@/lib/utils"

import type { Expense } from "../types"
import { HEADING, MUTED, PANEL } from "./expense-field"

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))} ر.س`
}

export function RecentExpensesCard({ expenses }: { expenses: Expense[] }) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>آخر المصروفات</h3>
      {expenses.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>لا توجد مصروفات بعد</p>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between gap-3 rounded-[10px] bg-[#fafbfd] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[12.5px] font-semibold", HEADING)}>
                  {expense.name}
                </p>
                <p className={cn("mt-0.5 text-[11px]", MUTED)}>
                  {expense.categoryName} · {expense.workspaceName} · {expense.expenseDate}
                </p>
              </div>
              <span className={cn("shrink-0 text-[12.5px] font-bold", HEADING)}>
                {formatCurrency(expense.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
