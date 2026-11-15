"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Lock, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog } from "@/components/app"

import {
  useAccountingAccess,
  useAccountingError,
  useFormatters,
  useLoader,
} from "../hooks/use-accounting"
import { accountingService } from "../services/accounting.service"
import {
  type Account,
  ACCOUNT_TYPES,
  type AccountInput,
  type AccountSection,
  type AccountType,
  SECTIONS_BY_TYPE,
} from "../types/accounting.types"
import { AccountingPage, LoadFailed, Loading } from "./shell"
import {
  AMOUNT,
  FIELD,
  FIELD_LABEL,
  HEADING,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TD,
  TH,
} from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

const BLANK: AccountInput = {
  code: "",
  nameAr: "",
  nameEn: "",
  type: "expense",
  section: "operating_expense",
  isActive: true,
}

function AccountDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: Account | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations("accounting.accounts")
  const tType = useTranslations("accounting.types")
  const tSection = useTranslations("accounting.sections")
  const locale = useLocale() as Locale
  const errorText = useAccountingError()
  const [form, setForm] = useState<AccountInput>(BLANK)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? {
            code: editing.code,
            nameAr: editing.nameAr,
            nameEn: editing.nameEn,
            type: editing.type,
            section: editing.section,
            isActive: editing.isActive,
          }
        : BLANK
    )
  }, [open, editing])

  const set = <K extends keyof AccountInput>(key: K, value: AccountInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const ready = form.code.trim() && form.nameAr.trim() && form.nameEn.trim()
  // An account Madar posts to keeps its kind.
  const locked = editing?.isSystem === true

  async function save() {
    setSaving(true)
    try {
      const input = {
        ...form,
        code: form.code.trim(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
      }
      if (editing) await accountingService.updateAccount(editing.id, input)
      else await accountingService.createAccount(input)
      toast.success(t("saved"))
      onSaved()
      onClose()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={<span dir={localeDirection(locale)}>{editing ? t("editTitle") : t("newTitle")}</span>}
      contentClassName="max-w-[34rem] gap-4 p-6"
      footer={
        <div dir={localeDirection(locale)} className="flex w-full justify-end gap-2">
          <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={save}
            disabled={!ready || saving}
          >
            {t("save")}
          </button>
        </div>
      }
    >
      <div dir={localeDirection(locale)} className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={FIELD_LABEL}>{t("code")}</span>
          <input
            value={form.code}
            onChange={(event) => set("code", event.target.value)}
            maxLength={20}
            className={cn(FIELD, AMOUNT)}
          />
        </label>
        <label className="flex items-end gap-2 pb-2.5 text-[13px] font-semibold text-[#344054]">
          <input
            type="checkbox"
            checked={form.isActive}
            disabled={locked}
            onChange={(event) => set("isActive", event.target.checked)}
            className="size-4 accent-[#047857]"
          />
          {t("active")}
        </label>
        <label>
          <span className={FIELD_LABEL}>{t("nameAr")}</span>
          <input
            dir="rtl"
            value={form.nameAr}
            onChange={(event) => set("nameAr", event.target.value)}
            maxLength={160}
            className={FIELD}
          />
        </label>
        <label>
          <span className={FIELD_LABEL}>{t("nameEn")}</span>
          <input
            dir="ltr"
            value={form.nameEn}
            onChange={(event) => set("nameEn", event.target.value)}
            maxLength={160}
            className={FIELD}
          />
        </label>
        <label>
          <span className={FIELD_LABEL}>{t("type")}</span>
          <select
            value={form.type}
            disabled={locked}
            onChange={(event) => {
              const type = event.target.value as AccountType
              setForm((current) => ({ ...current, type, section: SECTIONS_BY_TYPE[type][0] }))
            }}
            className={FIELD}
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {tType(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={FIELD_LABEL}>{t("section")}</span>
          <select
            value={form.section}
            onChange={(event) => set("section", event.target.value as AccountSection)}
            className={FIELD}
          >
            {SECTIONS_BY_TYPE[form.type].map((section) => (
              <option key={section} value={section}>
                {tSection(section)}
              </option>
            ))}
          </select>
        </label>
        {locked ? (
          <p className={cn("text-[12px] leading-5 sm:col-span-2", MUTED)}>{t("systemNote")}</p>
        ) : null}
      </div>
    </AppDialog>
  )
}

// The chart of accounts, grouped by type, each account with its balance today.
export function AccountsPage() {
  const t = useTranslations("accounting.accounts")
  const tType = useTranslations("accounting.types")
  const tSection = useTranslations("accounting.sections")
  const { signed, accountName } = useFormatters()
  const { canManage } = useAccountingAccess()
  const errorText = useAccountingError()
  const { data, failed, reload } = useLoader(() => accountingService.listAccounts(), "accounts")
  const [dialog, setDialog] = useState<{ editing: Account | null } | null>(null)

  async function remove(account: Account) {
    try {
      await accountingService.deleteAccount(account.id)
      toast.success(t("deleted"))
      reload()
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => setDialog({ editing: null })}
          >
            <Plus className="size-4" />
            {t("newAccount")}
          </button>
        ) : undefined
      }
    >
      {failed ? (
        <LoadFailed onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-4">
          {ACCOUNT_TYPES.map((type) => {
            const accounts = data.filter((account) => account.type === type)
            return (
              <section key={type} className={cn(PANEL, "overflow-hidden")}>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{tType(type)}</h2>
                  <p className={cn("text-[13px] font-bold", HEADING, AMOUNT)}>
                    {signed(accounts.reduce((sum, account) => sum + account.balance, 0))}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem]">
                    <thead>
                      <tr>
                        <th className={cn(TH, "w-24")}>{t("code")}</th>
                        <th className={TH}>{t("name")}</th>
                        <th className={TH}>{t("section")}</th>
                        <th className={cn(TH, "text-end")}>{t("balance")}</th>
                        {canManage ? <th className={cn(TH, "w-24")} /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((account) => (
                        <tr
                          key={account.id}
                          className={cn(
                            "border-t border-[#eef1f6] hover:bg-[#fafbfd]",
                            !account.isActive && "opacity-55"
                          )}
                        >
                          <td className={cn(TD, MUTED, AMOUNT)}>{account.code}</td>
                          <td className={TD}>
                            <Link
                              href={ROUTES.accountingLedgerFor(account.id)}
                              className="font-semibold hover:text-[#047857] hover:underline"
                            >
                              {accountName(account)}
                            </Link>
                            {account.isSystem ? (
                              <span
                                title={t("systemNote")}
                                className="ms-2 inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10.5px] font-semibold text-[#047857]"
                              >
                                <Lock className="size-2.5" />
                                {t("system")}
                              </span>
                            ) : null}
                            {!account.isActive ? (
                              <span className={cn("ms-2 text-[11px]", MUTED)}>{t("inactive")}</span>
                            ) : null}
                          </td>
                          <td className={cn(TD, MUTED)}>{tSection(account.section)}</td>
                          <td className={cn(TD, AMOUNT, "text-end font-semibold")}>
                            {signed(account.balance)}
                          </td>
                          {canManage ? (
                            <td className={cn(TD, "whitespace-nowrap")}>
                              <button
                                type="button"
                                aria-label={t("edit")}
                                onClick={() => setDialog({ editing: account })}
                                className="rounded-lg p-2 text-[#6b7b96] hover:bg-[#f1f3f7] hover:text-[#0b1738]"
                              >
                                <Pencil className="size-4" />
                              </button>
                              {!account.isSystem ? (
                                <button
                                  type="button"
                                  aria-label={t("delete")}
                                  onClick={() => remove(account)}
                                  className="rounded-lg p-2 text-[#8a97ad] hover:bg-[#fef1f1] hover:text-[#dc2626]"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}
      <AccountDialog
        open={dialog !== null}
        editing={dialog?.editing ?? null}
        onClose={() => setDialog(null)}
        onSaved={reload}
      />
    </AccountingPage>
  )
}
