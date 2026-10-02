"use client"

import { cn } from "@/lib/utils"

import {
  AppDialog,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import {
  PLAN_COMPARISON_ROWS,
  PLAN_TIER_ACCENT,
  PLAN_TIER_META,
  PLAN_TIER_ORDER,
} from "../services"

// The same comparison matrix Madar Admin's staff-facing packages page shows -- kept in one place
// (plan-tiers.ts) so a customer and a staff member never see different answers to "what do I get
// on Growth vs Pro".
export function PlanComparisonDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span dir="rtl" className="text-[17px] font-extrabold text-[#0b1738]">
          مقارنة الباقات
        </span>
      }
      contentClassName="[direction:rtl] max-w-[46rem] gap-4 p-6"
    >
      <div dir="rtl" className="overflow-x-auto">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>الميزة</AppTableHead>
              {PLAN_TIER_ORDER.map((tier) => {
                const accent = PLAN_TIER_ACCENT[tier]
                const Icon = accent.icon
                return (
                  <AppTableHead key={tier}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md",
                          accent.iconWrapperClassName
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      {PLAN_TIER_META[tier].name}
                    </span>
                  </AppTableHead>
                )
              })}
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {PLAN_COMPARISON_ROWS.map((row) => (
              <AppTableRow key={row.label}>
                <AppTableCell className="font-medium text-[#0b1738]">{row.label}</AppTableCell>
                {PLAN_TIER_ORDER.map((tier) => (
                  <AppTableCell key={tier} className="text-[#6b7b96]">
                    {row.values[tier]}
                  </AppTableCell>
                ))}
              </AppTableRow>
            ))}
            <AppTableRow>
              <AppTableCell className="font-medium text-[#0b1738]">السعر الشهري</AppTableCell>
              {PLAN_TIER_ORDER.map((tier) => (
                <AppTableCell key={tier} className="font-semibold text-[#0b1738]">
                  {PLAN_TIER_META[tier].priceLabel}
                </AppTableCell>
              ))}
            </AppTableRow>
          </AppTableBody>
        </AppTable>
      </div>
    </AppDialog>
  )
}
