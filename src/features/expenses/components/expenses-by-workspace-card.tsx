import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { HEADING, MUTED, PANEL } from "./expense-field"

function formatCurrency(value: number, currencyLabel: string) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))} ${currencyLabel}`
}

// Organization-level breakdown by branch (workspace) -- never by supplier/vendor.
export function ExpensesByWorkspaceCard({
  workspaces,
}: {
  workspaces: Array<{ workspaceName: string; total: number }>
}) {
  const t = useTranslations("expenses.overview")
  const currencyLabel = useTranslations("common")("currency")
  const maxTotal = Math.max(...workspaces.map((workspace) => workspace.total), 1)

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>{t("byBranch")}</h3>
      {workspaces.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
      ) : (
        <div className="space-y-3">
          {workspaces.map((workspace, index) => (
            <div key={workspace.workspaceName} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[11.5px] font-bold text-[#2878ff]">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-[12.5px] font-semibold", HEADING)}>
                    {workspace.workspaceName}
                  </span>
                  <span className={cn("shrink-0 text-[12px] font-bold", HEADING)}>
                    {formatCurrency(workspace.total, currencyLabel)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#eef2f8]">
                  <div
                    className="h-full rounded-full bg-[#2878ff]"
                    style={{ width: `${(workspace.total / maxTotal) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
