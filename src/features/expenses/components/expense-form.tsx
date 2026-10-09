"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDateField, AppForm, AppInput, AppSearchableSelect } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useExpenseCategories } from "../hooks"
import { expenseCategoryService, expenseService } from "../services"
import {
  EMPTY_EXPENSE_FORM_VALUES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_TAX_OPTIONS,
  type ExpenseFormValues,
} from "../types"
import { ExpenseField, FIELD_CLASS, PANEL } from "./expense-field"

export function ExpenseForm() {
  const router = useRouter()
  const { availableWorkspaces } = useWorkspace()
  const { categories, refetch: refetchCategories } = useExpenseCategories()

  const [values, setValues] = useState<ExpenseFormValues>(() => ({
    ...EMPTY_EXPENSE_FORM_VALUES,
    expenseDate: new Date().toISOString().slice(0, 10),
  }))
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function handleCreateCategory(draft: string) {
    try {
      const category = await expenseCategoryService.create(draft)
      await refetchCategories()
      set("categoryId", category.id)
      toast.success(`تمت إضافة الفئة "${category.name}".`)
    } catch {
      toast.error("تعذر إضافة الفئة. حاول مرة أخرى.")
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (
      !values.name.trim() ||
      !values.categoryId ||
      !values.workspaceId ||
      !values.expenseDate.trim()
    ) {
      toast.error("يرجى تعبئة اسم المصروف والفئة والفرع والتاريخ.")
      return
    }
    if (!values.amount || values.amount <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح.")
      return
    }

    setSubmitting(true)
    try {
      await expenseService.create(values)
      toast.success("تم إضافة المصروف.")
      router.push(ROUTES.expenses)
    } catch {
      toast.error("تعذر حفظ المصروف. حاول مرة أخرى.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppForm dir="rtl" onSubmit={handleSubmit} className="space-y-5">
      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ExpenseField label="اسم المصروف" required>
            <AppInput
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="مثال: فاتورة كهرباء"
              className={FIELD_CLASS}
            />
          </ExpenseField>

          <ExpenseField label="الفئة" required>
            <AppSearchableSelect
              value={values.categoryId}
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              onChange={(value) => set("categoryId", value)}
              onCreate={handleCreateCategory}
              createLabel={(draft) => `إضافة فئة "${draft}"`}
              placeholder="اختر الفئة"
              searchPlaceholder="ابحث أو أضف فئة جديدة..."
              emptyLabel="لا توجد فئات"
              ariaLabel="الفئة"
            />
          </ExpenseField>

          <ExpenseField label="الفرع" required>
            <AppSearchableSelect
              value={values.workspaceId}
              options={availableWorkspaces.map((workspace) => ({
                value: workspace.id,
                label: workspace.name,
              }))}
              onChange={(value) => set("workspaceId", value)}
              placeholder="اختر الفرع"
              searchPlaceholder="ابحث..."
              emptyLabel="لا توجد فروع"
              ariaLabel="الفرع"
            />
          </ExpenseField>

          <ExpenseField label="المبلغ" required>
            <AppInput
              type="number"
              min={0}
              step="any"
              value={values.amount || ""}
              onChange={(event) => set("amount", Number(event.target.value) || 0)}
              placeholder="0.00"
              className={FIELD_CLASS}
            />
          </ExpenseField>

          <ExpenseField label="طريقة الدفع" required>
            <AppSearchableSelect
              value={values.paymentMethod}
              options={EXPENSE_PAYMENT_METHODS}
              onChange={(value) =>
                set("paymentMethod", value as ExpenseFormValues["paymentMethod"])
              }
              placeholder="اختر طريقة الدفع"
              ariaLabel="طريقة الدفع"
            />
          </ExpenseField>

          <ExpenseField label="الضريبة" required>
            <AppSearchableSelect
              value={values.taxInclusive ? "inclusive" : "exclusive"}
              options={EXPENSE_TAX_OPTIONS}
              onChange={(value) => set("taxInclusive", value === "inclusive")}
              placeholder="اختر"
              ariaLabel="الضريبة"
            />
          </ExpenseField>

          <ExpenseField label="تاريخ المصروف" required>
            <AppDateField
              value={values.expenseDate}
              onChange={(value) => set("expenseDate", value)}
            />
          </ExpenseField>

          <ExpenseField label="رقم المرجع / الفاتورة">
            <AppInput
              value={values.referenceNumber}
              onChange={(event) => set("referenceNumber", event.target.value)}
              placeholder="رقم الفاتورة أو المرجع"
              className={FIELD_CLASS}
            />
          </ExpenseField>
        </div>

        <div className="mt-4">
          <ExpenseField label="ملاحظات">
            <textarea
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="أضف ملاحظة قصيرة..."
              rows={3}
              className={cn(
                "w-full resize-none p-3 outline-none focus:border-[#2878ff]",
                FIELD_CLASS,
                "h-auto rounded-[12px] border"
              )}
            />
          </ExpenseField>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <AppButton
          type="button"
          variant="outline"
          className="h-11 rounded-[12px] border-[#c4d5f0] px-6 text-[13.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
          onClick={() => router.push(ROUTES.expenses)}
        >
          إلغاء
        </AppButton>
        <AppButton
          type="submit"
          loading={submitting}
          icon={
            <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
              <Plus className="size-3.5" strokeWidth={2.5} />
            </span>
          }
          className="h-11 gap-2 rounded-full bg-[#2878ff] px-6 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
        >
          إضافة المصروف
        </AppButton>
      </div>
    </AppForm>
  )
}
