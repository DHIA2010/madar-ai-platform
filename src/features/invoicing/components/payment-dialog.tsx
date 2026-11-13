"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDateField,
  AppDialog,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { PAYMENT_METHODS } from "../domain/catalog"
import { todayString, useFormatters, useInvoicingError } from "../hooks/use-invoicing"
import { salesInvoiceService } from "../services/invoicing.service"
import type { PaymentInput, SalesInvoiceDetail } from "../types/invoicing.types"
import { Field, NumberInput, PRIMARY_BUTTON, SECONDARY_BUTTON, TextInput } from "./primitives"
import { FIELD, HEADING, MUTED } from "./styles"

export function PaymentDialog({
  invoice,
  open,
  onOpenChange,
  onSaved,
}: {
  invoice: SalesInvoiceDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (invoice: SalesInvoiceDetail) => void
}) {
  const t = useTranslations("invoicing.payments")
  const tMethods = useTranslations("invoicing.paymentMethods")
  const tCommon = useTranslations("invoicing.common")
  const { money } = useFormatters()
  const describeError = useInvoicingError()
  const [amount, setAmount] = useState(invoice.balance)
  const [paidOn, setPaidOn] = useState(todayString())
  const [method, setMethod] = useState<PaymentInput["method"]>("bank_transfer")
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (amount <= 0) {
      toast.error(t("amountRequired"))
      return
    }
    setBusy(true)
    try {
      const updated = await salesInvoiceService.addPayment(invoice.id, {
        amount,
        paidOn,
        method,
        reference: reference.trim() || null,
        notes: null,
      })
      toast.success(t("saved"))
      onSaved(updated)
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="text-[17px] font-extrabold">{t("dialog.title")}</span>}
      description={t("dialog.description", { number: invoice.number ?? "" })}
      contentClassName="max-w-[30rem] rounded-[22px] p-6"
      footer={
        <>
          <AppButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={SECONDARY_BUTTON}
          >
            {tCommon("cancel")}
          </AppButton>
          <AppButton loading={busy} onClick={save} className={PRIMARY_BUTTON}>
            {t("dialog.save")}
          </AppButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-[14px] bg-[#f7f9fc] px-4 py-3">
          <span className={cn("text-[12.5px]", MUTED)}>{t("dialog.balance")}</span>
          <span className={cn("text-[17px] font-black tabular-nums", HEADING)}>
            {money(invoice.balance)}
            <span className={cn("ms-1 text-[11px] font-semibold", MUTED)}>{tCommon("sar")}</span>
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("dialog.amount")} required>
            <NumberInput value={amount} max={invoice.balance} onChange={setAmount} />
          </Field>
          <Field label={t("dialog.paidOn")}>
            <AppDateField value={paidOn} onChange={(value) => setPaidOn(value || todayString())} />
          </Field>
          <Field label={t("dialog.method")}>
            <AppSelect
              value={method}
              onValueChange={(value) => setMethod(value as PaymentInput["method"])}
            >
              <AppSelectTrigger className={cn(FIELD, "px-2.5")} aria-label={t("dialog.method")}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {PAYMENT_METHODS.map((value) => (
                  <AppSelectItem key={value} value={value}>
                    {tMethods(value)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </Field>
          <Field label={t("dialog.reference")}>
            <TextInput
              value={reference}
              onChange={setReference}
              placeholder={t("dialog.referencePlaceholder")}
            />
          </Field>
        </div>
      </div>
    </AppDialog>
  )
}
