"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
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
  EXPENSE_PAYMENT_METHOD_KEYS,
  EXPENSE_PAYMENT_METHOD_VALUES,
  type ExpenseFormValues,
} from "../types"
import { ExpenseField, FIELD_CLASS, PANEL } from "./expense-field"

import { type Locale, localeDirection } from "@/i18n/locales"

export function ExpenseForm() {
  const t = useTranslations("expenses")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const { availableWorkspaces } = useWorkspace()
  const { categories, refetch: refetchCategories } = useExpenseCategories()

  const [values, setValues] = useState<ExpenseFormValues>(() => ({
    ...EMPTY_EXPENSE_FORM_VALUES,
    expenseDate: new Date().toISOString().slice(0, 10),
  }))
  const [submitting, setSubmitting] = useState(false)

  const paymentMethods = EXPENSE_PAYMENT_METHOD_VALUES.map((value) => ({
    value,
    label: t(`paymentMethods.${EXPENSE_PAYMENT_METHOD_KEYS[value]}`),
  }))
  const taxOptions = [
    { value: "exclusive", label: t("taxExclusive") },
    { value: "inclusive", label: t("taxInclusive") },
  ]

  function set<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function handleCreateCategory(draft: string) {
    try {
      const category = await expenseCategoryService.create(draft)
      await refetchCategories()
      set("categoryId", category.id)
      toast.success(t("toasts.categoryCreated", { name: category.name }))
    } catch {
      toast.error(t("toasts.categoryCreateError"))
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
      toast.error(t("toasts.validationRequired"))
      return
    }
    if (!values.amount || values.amount <= 0) {
      toast.error(t("toasts.validationAmount"))
      return
    }

    setSubmitting(true)
    try {
      await expenseService.create(values)
      toast.success(t("toasts.createSuccess"))
      router.push(ROUTES.expenses)
    } catch {
      toast.error(t("toasts.createError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppForm dir={localeDirection(locale as Locale)} onSubmit={handleSubmit} className="space-y-5">
      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ExpenseField label={t("form.nameLabel")} required>
            <AppInput
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder={t("form.namePlaceholder")}
              className={FIELD_CLASS}
            />
          </ExpenseField>

          <ExpenseField label={t("form.categoryLabel")} required>
            <AppSearchableSelect
              value={values.categoryId}
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
              onChange={(value) => set("categoryId", value)}
              onCreate={handleCreateCategory}
              createLabel={(draft) => t("form.createCategoryLabel", { draft })}
              placeholder={t("form.categoryPlaceholder")}
              searchPlaceholder={t("form.categorySearchPlaceholder")}
              emptyLabel={t("form.categoryEmptyLabel")}
              ariaLabel={t("form.categoryLabel")}
            />
          </ExpenseField>

          <ExpenseField label={t("form.branchLabel")} required>
            <AppSearchableSelect
              value={values.workspaceId}
              options={availableWorkspaces.map((workspace) => ({
                value: workspace.id,
                label: workspace.name,
              }))}
              onChange={(value) => set("workspaceId", value)}
              placeholder={t("form.branchPlaceholder")}
              searchPlaceholder={t("form.branchSearchPlaceholder")}
              emptyLabel={t("form.branchEmptyLabel")}
              ariaLabel={t("form.branchLabel")}
            />
          </ExpenseField>

          <ExpenseField label={t("form.amountLabel")} required>
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

          <ExpenseField label={t("form.paymentMethodLabel")} required>
            <AppSearchableSelect
              value={values.paymentMethod}
              options={paymentMethods}
              onChange={(value) =>
                set("paymentMethod", value as ExpenseFormValues["paymentMethod"])
              }
              placeholder={t("form.paymentMethodPlaceholder")}
              ariaLabel={t("form.paymentMethodLabel")}
            />
          </ExpenseField>

          <ExpenseField label={t("form.taxLabel")} required>
            <AppSearchableSelect
              value={values.taxInclusive ? "inclusive" : "exclusive"}
              options={taxOptions}
              onChange={(value) => set("taxInclusive", value === "inclusive")}
              placeholder={t("form.taxPlaceholder")}
              ariaLabel={t("form.taxLabel")}
            />
          </ExpenseField>

          <ExpenseField label={t("form.dateLabel")} required>
            <AppDateField
              value={values.expenseDate}
              onChange={(value) => set("expenseDate", value)}
            />
          </ExpenseField>

          <ExpenseField label={t("form.referenceLabel")}>
            <AppInput
              value={values.referenceNumber}
              onChange={(event) => set("referenceNumber", event.target.value)}
              placeholder={t("form.referencePlaceholder")}
              className={FIELD_CLASS}
            />
          </ExpenseField>
        </div>

        <div className="mt-4">
          <ExpenseField label={t("form.notesLabel")}>
            <textarea
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder={t("form.notesPlaceholder")}
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
          {tCommon("cancel")}
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
          {t("form.submit")}
        </AppButton>
      </div>
    </AppForm>
  )
}
