"use client"

// الضرائب -- named tax rates the organization actually charges, replacing the single hardcoded
// 15% VAT_RATE constant every sale used to use (see invoices-service.ts's create()). Exactly one
// rate is ever the default (see tax-rates-service.ts's DB-level partial unique index) -- that is
// the rate a real sale is charged at from here on.

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Info, Loader2, Pencil, Percent, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/features/workspace"
import { getActiveApplications } from "@/features/applications"
import {
  taxRatesService,
  type CreateTaxRateInput,
  type TaxRate,
  type TaxRateType,
} from "@/features/pos/services/tax-rates.service"
import { productListService } from "@/features/products/services/product-list.service"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#E8EBF0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#98A2B3]"

type TaxesTranslator = ReturnType<typeof useTranslations<"settings.taxes">>

function taxTypeLabel(type: TaxRateType, t: TaxesTranslator): string {
  return t(`types.${type}` as "types.sales_tax")
}
const TYPE_OPTIONS: TaxRateType[] = ["sales_tax", "custom", "zero_rate", "exempt"]
const TYPE_TINT: Record<TaxRateType, string> = {
  sales_tax: "bg-[#eef4ff] text-[#2878ff]",
  custom: "bg-[#f3eeff] text-[#8b5cf6]",
  zero_rate: "bg-[#e9f8ef] text-[#1f9d55]",
  exempt: "bg-[#eef2f8] text-[#5b6b85]",
}

function dateFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface Draft {
  name: string
  type: TaxRateType
  ratePercent: string
  isDefault: boolean
  isActive: boolean
}
const EMPTY_DRAFT: Draft = {
  name: "",
  type: "sales_tax",
  ratePercent: "",
  isDefault: false,
  isActive: true,
}
function buildDraft(rate: TaxRate | null): Draft {
  if (!rate) return EMPTY_DRAFT
  return {
    name: rate.name,
    type: rate.type,
    ratePercent: String(rate.ratePercent),
    isDefault: rate.isDefault,
    isActive: rate.isActive,
  }
}

export default function TaxesSettings() {
  const t = useTranslations("settings.taxes")
  const locale = useLocale() as Locale
  const { currentOrganization, updateOrganization } = useWorkspace()
  const posActive = getActiveApplications(currentOrganization?.settings).includes("pos")

  const [rates, setRates] = useState<TaxRate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TaxRate | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [pendingDelete, setPendingDelete] = useState<TaxRate | null>(null)

  const [autoApply, setAutoApply] = useState(true)
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false)
  // "manual" hands the choice to whoever adds each product instead of enforcing pricesIncludeTax
  // as a blanket default -- see the third dialog option below and AddProduct.tsx's own dropdown.
  const [taxPriceEntryMode, setTaxPriceEntryMode] = useState<"auto" | "manual">("auto")

  useEffect(() => {
    if (!currentOrganization) return
    setAutoApply(currentOrganization.settings.taxAutoApplyToProducts ?? true)
    setPricesIncludeTax(currentOrganization.settings.taxPricesIncludeTax ?? false)
    setTaxPriceEntryMode(currentOrganization.settings.taxPriceEntryMode ?? "auto")
  }, [currentOrganization])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setRates(await taxRatesService.list())
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(status === 403 ? t("loadError.forbidden") : t("loadError.generic"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const failed = (error: unknown, fallback: string) => {
    const status = error instanceof AppError ? error.status : undefined
    toast.error(status === 403 ? t("toasts.forbiddenManage") : fallback, {
      description: status === 403 ? t("toasts.forbiddenDescription") : undefined,
    })
  }

  const validateDraft = (value: Draft): number | null => {
    if (!value.name.trim()) {
      toast.error(t("validation.nameRequired"))
      return null
    }
    const parsed = Number(value.ratePercent)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error(t("validation.rateInvalid"))
      return null
    }
    return parsed
  }

  const submitCreate = async () => {
    const ratePercent = validateDraft(draft)
    if (ratePercent === null) return

    setBusyId("new")
    try {
      const input: CreateTaxRateInput = {
        name: draft.name.trim(),
        type: draft.type,
        ratePercent,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
      }
      await taxRatesService.create(input)
      toast.success(t("toasts.added"))
      setCreating(false)
      setDraft(EMPTY_DRAFT)
      await load()
    } catch (error) {
      failed(error, t("toasts.addFailed"))
    } finally {
      setBusyId(null)
    }
  }

  const submitEdit = async () => {
    if (!editing) return
    const ratePercent = validateDraft(draft)
    if (ratePercent === null) return

    setBusyId(editing.id)
    try {
      await taxRatesService.update(editing.id, {
        name: draft.name.trim(),
        type: draft.type,
        ratePercent,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
      })
      toast.success(t("toasts.saved"))
      setEditing(null)
      await load()
    } catch (error) {
      failed(error, t("toasts.saveFailed"))
    } finally {
      setBusyId(null)
    }
  }

  const toggleActive = async (rate: TaxRate) => {
    setBusyId(rate.id)
    try {
      await taxRatesService.update(rate.id, { isActive: !rate.isActive })
      await load()
    } catch (error) {
      failed(error, t("toasts.statusChangeFailed"))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async () => {
    if (!pendingDelete) return
    setBusyId(pendingDelete.id)
    try {
      await taxRatesService.remove(pendingDelete.id)
      toast.success(t("toasts.deleted"))
      setPendingDelete(null)
      await load()
    } catch (error) {
      const code = error instanceof AppError ? error.code : undefined
      failed(
        error,
        code === "TAX_RATE_IN_USE" ? t("toasts.deleteFailedInUse") : t("toasts.deleteFailedGeneric")
      )
    } finally {
      setBusyId(null)
    }
  }

  const saveInvoiceSetting = async (
    key: "taxAutoApplyToProducts" | "taxPricesIncludeTax",
    value: boolean,
    revert: () => void
  ) => {
    if (!currentOrganization) return
    try {
      await updateOrganization(currentOrganization.id, { settings: { [key]: value } })
    } catch {
      revert()
      toast.error(t("toasts.settingSaveFailed"))
    }
  }

  // "الأسعار تشمل الضريبة" never flips silently -- merchants genuinely price products both ways
  // (before/after tax) and switching the convention has to say what happens to prices already
  // typed in. `pendingConvention` holds the value the switch was toggled TO, while the real
  // committed value (pricesIncludeTax) waits for one of the dialog's two real choices below.
  const [pendingConvention, setPendingConvention] = useState<boolean | null>(null)
  const [applyingConvention, setApplyingConvention] = useState<"all" | "new" | "manual" | null>(
    null
  )

  // "المنتجات الجديدة فقط": only the organization's own default changes -- every existing
  // product keeps whatever price and convention it already had. Also resets taxPriceEntryMode to
  // "auto" -- choosing a fixed convention here supersedes a previously-chosen manual mode.
  const applyConventionToNewOnly = async (next: boolean) => {
    if (!currentOrganization) return
    setApplyingConvention("new")
    try {
      await updateOrganization(currentOrganization.id, {
        settings: { taxPricesIncludeTax: next, taxPriceEntryMode: "auto" },
      })
      setPricesIncludeTax(next)
      setTaxPriceEntryMode("auto")
      toast.success(t("toasts.conventionNewOnlySaved"))
      setPendingConvention(null)
    } catch {
      toast.error(t("toasts.settingSaveFailed"))
    } finally {
      setApplyingConvention(null)
    }
  }

  // "جميع المنتجات الحالية": actually rewrites every priced product's stored sell_price by its
  // own effective tax rate (see ProductCatalogService.applyPriceTaxConvention) so the amount a
  // customer is actually charged stays the same either way -- only the org default is then also
  // updated so new products follow the same convention from here on. Also resets
  // taxPriceEntryMode to "auto", same reasoning as applyConventionToNewOnly above.
  const applyConventionToAll = async (next: boolean) => {
    if (!currentOrganization) return
    setApplyingConvention("all")
    try {
      const result = await productListService.applyTaxConvention(next)
      await updateOrganization(currentOrganization.id, {
        settings: { taxPricesIncludeTax: next, taxPriceEntryMode: "auto" },
      })
      setPricesIncludeTax(next)
      setTaxPriceEntryMode("auto")
      toast.success(
        result.updated > 0
          ? t("toasts.conventionAllUpdated", { count: result.updated })
          : t("toasts.conventionAllSavedNoProducts")
      )
      setPendingConvention(null)
    } catch {
      toast.error(t("toasts.conventionApplyFailed"))
    } finally {
      setApplyingConvention(null)
    }
  }

  // "الاختيار يدوي أثناء إضافة المنتج": no bulk conversion and no fixed default -- the Add
  // Product form itself shows a per-product dropdown (see AddProduct.tsx) once this is set,
  // letting the merchant decide gross/net for each product individually instead of enforcing one
  // rule for everything added from now on.
  const applyConventionManual = async () => {
    if (!currentOrganization) return
    setApplyingConvention("manual")
    try {
      await updateOrganization(currentOrganization.id, {
        settings: { taxPriceEntryMode: "manual" },
      })
      setTaxPriceEntryMode("manual")
      toast.success(t("toasts.conventionManualSaved"))
      setPendingConvention(null)
    } catch {
      toast.error(t("toasts.settingSaveFailed"))
    } finally {
      setApplyingConvention(null)
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}>
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          {t("retry")}
        </Button>
      </div>
    )
  }

  const activeCount = rates.filter((rate) => rate.isActive).length
  const defaultRate = rates.find((rate) => rate.isDefault) ?? null
  const byType = TYPE_OPTIONS.map((type) => ({
    type,
    rates: rates.filter((rate) => rate.type === type),
  })).filter((group) => group.rates.length > 0)

  return (
    <div className="flex flex-col gap-5" dir={localeDirection(locale)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
        </div>

        <Button
          className="h-auto gap-2 rounded-[10px] bg-[#2563eb] px-[18px] py-2.5 text-[13px] font-bold text-white hover:bg-[#1d4ed8]"
          onClick={() => {
            setDraft(EMPTY_DRAFT)
            setCreating(true)
          }}
        >
          <Plus className="size-4" />
          {t("addTax")}
        </Button>
      </div>

      <section className="grid gap-3.5 sm:grid-cols-3">
        <div className={cn(PANEL, "flex items-center gap-3 p-4")}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0">
            <p className={cn("text-[12px]", MUTED)}>{t("stats.activeTaxes")}</p>
            <p className={cn("text-[18px] font-extrabold", HEADING)}>
              {t("stats.activeCountOf", { active: activeCount, total: rates.length })}
            </p>
          </div>
        </div>
        <div className={cn(PANEL, "flex items-center gap-3 p-4")}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
            <Percent className="size-5" />
          </span>
          <div className="min-w-0">
            <p className={cn("text-[12px]", MUTED)}>{t("stats.defaultRate")}</p>
            <p className={cn("text-[18px] font-extrabold", HEADING)}>
              {defaultRate ? `${defaultRate.ratePercent}%` : "—"}
            </p>
          </div>
        </div>
        <div className={cn(PANEL, "flex items-center gap-3 p-4")}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
            <Info className="size-5" />
          </span>
          <div className="min-w-0">
            <p className={cn("text-[12px]", MUTED)}>{t("stats.totalTaxes")}</p>
            <p className={cn("text-[18px] font-extrabold", HEADING)}>{rates.length}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className={cn(PANEL, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-center">
              <thead>
                <tr className="bg-[#f1f5fc]">
                  {[
                    { key: "name", label: t("table.columns.name"), align: "text-right" },
                    { key: "type", label: t("table.columns.type"), align: "text-center" },
                    { key: "rate", label: t("table.columns.rate"), align: "text-center" },
                    { key: "status", label: t("table.columns.status"), align: "text-center" },
                    { key: "updated", label: t("table.columns.updated"), align: "text-center" },
                    { key: "actions", label: t("table.columns.actions"), align: "text-center" },
                  ].map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap border-b border-[#e8edf3] px-4 py-3 text-[12px] font-semibold",
                        MUTED,
                        column.align
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => {
                  const busy = busyId === rate.id
                  return (
                    <tr key={rate.id} className="border-b border-[#f0f3f8] last:border-0">
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 font-bold">
                          <span className={HEADING}>{rate.name}</span>
                          {rate.isDefault ? (
                            <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10.5px] font-bold text-[#2878ff]">
                              {t("table.defaultBadge")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
                            TYPE_TINT[rate.type]
                          )}
                        >
                          {taxTypeLabel(rate.type, t)}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3 font-bold", HEADING)}>{rate.ratePercent}%</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={busy || rate.isDefault}
                          onClick={() => void toggleActive(rate)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold disabled:cursor-not-allowed",
                            rate.isActive
                              ? "bg-[#e9f8ef] text-[#1f9d55]"
                              : "bg-[#f2f4f8] text-[#667085]"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              rate.isActive ? "bg-[#1f9d55]" : "bg-[#98A2B3]"
                            )}
                          />
                          {rate.isActive ? t("table.active") : t("table.inactive")}
                        </button>
                      </td>
                      <td className={cn("px-4 py-3 text-[12px]", MUTED)}>
                        {dateFormatter(locale).format(new Date(rate.updatedAt))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            aria-label={t("table.editAria")}
                            className="flex size-8 items-center justify-center rounded-[8px] text-[#667085] transition-colors hover:bg-[#eef2f8] hover:text-[#0b1738]"
                            onClick={() => {
                              setEditing(rate)
                              setDraft(buildDraft(rate))
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("table.deleteAria")}
                            disabled={rate.isDefault}
                            className="flex size-8 items-center justify-center rounded-[8px] text-[#e0484d] transition-colors hover:bg-[#fdeeee] disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setPendingDelete(rate)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-5">
          {/* Both settings here govern how POS product prices and sales invoices carry tax --
              meaningless to an org without POS, unlike the tax rates themselves, which purchases
              and expenses use too. */}
          {posActive ? (
            <section className={cn(PANEL, "p-4")}>
              <h2 className={cn("mb-3 text-[14px] font-extrabold", HEADING)}>
                {t("invoiceSettings.sectionTitle")}
              </h2>
              <div className="flex flex-col divide-y divide-[#f0f3f8]">
                <ToggleRow
                  title={t("invoiceSettings.autoApply.title")}
                  description={t("invoiceSettings.autoApply.description")}
                  checked={autoApply}
                  onChange={(next) => {
                    const previous = autoApply
                    setAutoApply(next)
                    void saveInvoiceSetting("taxAutoApplyToProducts", next, () =>
                      setAutoApply(previous)
                    )
                  }}
                />
                {/* No "show tax on invoice" toggle -- a real tax invoice is legally required to
                  show its VAT breakdown, so this can never be a merchant preference. */}
                <PriceConventionRow
                  title={t("invoiceSettings.priceConvention.title")}
                  description={t("invoiceSettings.priceConvention.description")}
                  options={PRICE_CONVENTION_OPTIONS.map((value) => ({
                    value,
                    label: t(`invoiceSettings.priceConvention.options.${value}`),
                  }))}
                  mode={
                    taxPriceEntryMode === "manual"
                      ? "manual"
                      : pricesIncludeTax
                        ? "inclusive"
                        : "exclusive"
                  }
                  busy={applyingConvention !== null}
                  onSelect={(next) => {
                    if (next === "manual") {
                      void applyConventionManual()
                      return
                    }
                    setPendingConvention(next === "inclusive")
                  }}
                />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-[#eef4ff] p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-[#2878ff]" />
                <p className="text-[11.5px] leading-6 text-[#2878ff]">{t("infoBanner")}</p>
              </div>
            </section>
          ) : null}

          {byType.length > 0 ? (
            <section className={cn(PANEL, "p-4")}>
              <h2 className={cn("mb-3 text-[14px] font-extrabold", HEADING)}>
                {t("categories.sectionTitle")}
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                {byType.map((group) => (
                  <div
                    key={group.type}
                    className="rounded-[12px] border border-[#eef2f8] p-3 text-center"
                  >
                    <span
                      className={cn(
                        "mx-auto flex size-8 items-center justify-center rounded-[8px]",
                        TYPE_TINT[group.type]
                      )}
                    >
                      <Percent className="size-4" />
                    </span>
                    <p className={cn("mt-1.5 text-[12px] font-bold", HEADING)}>
                      {taxTypeLabel(group.type, t)}
                    </p>
                    <p className={cn("text-[11px]", MUTED)}>
                      {t("categories.countSuffix", { count: group.rates.length })}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <TaxRateDialog
        open={creating}
        title={t("dialog.addTitle")}
        submitLabel={t("dialog.save")}
        savingLabel={t("dialog.saving")}
        cancelLabel={t("dialog.cancel")}
        draft={draft}
        setDraft={setDraft}
        busy={busyId === "new"}
        locale={locale}
        t={t}
        onCancel={() => setCreating(false)}
        onSubmit={() => void submitCreate()}
      />

      <TaxRateDialog
        open={editing !== null}
        title={t("dialog.editTitle")}
        submitLabel={t("dialog.saveChanges")}
        savingLabel={t("dialog.saving")}
        cancelLabel={t("dialog.cancel")}
        draft={draft}
        setDraft={setDraft}
        busy={editing !== null && busyId === editing.id}
        locale={locale}
        t={t}
        onCancel={() => setEditing(null)}
        onSubmit={() => void submitEdit()}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent
          className={cn(
            "sm:max-w-[26rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
        >
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              {t("deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              {t.rich("deleteDialog.description", {
                name: pendingDelete?.name ?? "",
                b: (chunks) => <span className={cn("font-bold", HEADING)}>{chunks}</span>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              className="bg-[#e0484d] text-white hover:bg-[#c93f44]"
              disabled={busyId !== null}
              onClick={() => void remove()}
            >
              {t("deleteDialog.confirm")}
            </Button>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t("deleteDialog.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingConvention !== null}
        onOpenChange={(open) => !open && applyingConvention === null && setPendingConvention(null)}
      >
        <DialogContent
          className={cn(
            "sm:max-w-[30rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
        >
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              {pendingConvention
                ? t("conventionDialog.enableTitle")
                : t("conventionDialog.disableTitle")}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              {pendingConvention
                ? t("conventionDialog.enableDescription")
                : t("conventionDialog.disableDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={applyingConvention !== null}
              onClick={() =>
                pendingConvention !== null && void applyConventionToAll(pendingConvention)
              }
              className="flex flex-col items-start gap-1 rounded-[12px] border border-[#2878ff] bg-[#eef4ff] p-3.5 text-right transition-colors hover:bg-[#e3edff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className={cn("text-[13px] font-bold", HEADING)}>
                {t("conventionDialog.allProducts.title")}
              </span>
              <span className="text-[11.5px] leading-5 text-[#2878ff]">
                {applyingConvention === "all"
                  ? t("conventionDialog.allProducts.applying")
                  : pendingConvention
                    ? t("conventionDialog.allProducts.enableHint")
                    : t("conventionDialog.allProducts.disableHint")}
              </span>
            </button>

            <button
              type="button"
              disabled={applyingConvention !== null}
              onClick={() =>
                pendingConvention !== null && void applyConventionToNewOnly(pendingConvention)
              }
              className="flex flex-col items-start gap-1 rounded-[12px] border border-[#E8EBF0] bg-white p-3.5 text-right transition-colors hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className={cn("text-[13px] font-bold", HEADING)}>
                {t("conventionDialog.newOnly.title")}
              </span>
              <span className={cn("text-[11.5px] leading-5", MUTED)}>
                {applyingConvention === "new"
                  ? t("conventionDialog.newOnly.applying")
                  : t("conventionDialog.newOnly.hint")}
              </span>
            </button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={applyingConvention !== null}
              onClick={() => setPendingConvention(null)}
            >
              {t("conventionDialog.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className={cn("text-[12.5px] font-bold", HEADING)}>{title}</p>
        <p className={cn("mt-0.5 text-[11px] leading-5", MUTED)}>{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  )
}

type PriceConvention = "inclusive" | "exclusive" | "manual"

const PRICE_CONVENTION_OPTIONS: PriceConvention[] = ["inclusive", "exclusive", "manual"]

// A three-way segmented control, not a Switch -- this setting has three real, standing states
// (always price-inclusive, always price-exclusive, or left to a per-product choice), and a
// binary toggle had no way to show "manual" as a state at all: it just displayed whatever
// pricesIncludeTax happened to be, which is meaningless while in manual mode. Each segment shows
// the organization's actual current convention directly, and picking a different one is what
// used to be the switch's own onChange (see the pendingConvention dialog below for the
// all-products/new-products-only follow-up, still asked whenever the target is inclusive or
// exclusive; manual applies immediately since it rewrites nothing).
function PriceConventionRow({
  title,
  description,
  options,
  mode,
  busy,
  onSelect,
}: {
  title: string
  description: string
  options: Array<{ value: PriceConvention; label: string }>
  mode: PriceConvention
  busy: boolean
  onSelect: (next: PriceConvention) => void
}) {
  return (
    <div className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
      <div>
        <p className={cn("text-[12.5px] font-bold", HEADING)}>{title}</p>
        <p className={cn("mt-0.5 text-[11px] leading-5", MUTED)}>{description}</p>
      </div>
      <div className="flex items-center gap-1 rounded-[12px] bg-[#f4f6fa] p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={busy}
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex-1 rounded-[9px] px-2 py-2 text-center text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              mode === option.value
                ? "bg-white text-[#2878ff] shadow-[0_1px_3px_rgba(16,42,92,0.12)]"
                : "text-[#667085] hover:text-[#0b1738]"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TaxRateDialog({
  open,
  title,
  submitLabel,
  savingLabel,
  cancelLabel,
  draft,
  setDraft,
  busy,
  locale,
  t,
  onCancel,
  onSubmit,
}: {
  open: boolean
  title: string
  submitLabel: string
  savingLabel: string
  cancelLabel: string
  draft: Draft
  setDraft: (next: Draft) => void
  busy: boolean
  locale: Locale
  t: TaxesTranslator
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className={cn("sm:max-w-[26rem]", locale === "ar" ? "[direction:rtl]" : "[direction:ltr]")}
      >
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          <div>
            <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
              {t("dialog.nameLabel")}
            </Label>
            <Input
              value={draft.name}
              placeholder={t("dialog.namePlaceholder")}
              className={FIELD_CLASS}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>

          <div>
            <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
              {t("dialog.typeLabel")}
            </Label>
            <Select
              value={draft.type}
              onValueChange={(next) => setDraft({ ...draft, type: next as TaxRateType })}
            >
              <SelectTrigger className={FIELD_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {taxTypeLabel(type, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
              {t("dialog.rateLabel")}
            </Label>
            <div className="relative">
              <Percent className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[#98A2B3]" />
              <Input
                type="number"
                min={0}
                max={100}
                step="0.001"
                value={draft.ratePercent}
                placeholder={t("dialog.ratePlaceholder")}
                className={cn(FIELD_CLASS, "ps-9")}
                onChange={(event) => setDraft({ ...draft, ratePercent: event.target.value })}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })}
              className="size-4 rounded border-[#c7d3e3] accent-[#2563eb]"
            />
            <span className={cn("text-[12.5px] font-semibold", HEADING)}>
              {t("dialog.setDefault")}
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              className="mt-0.5 size-4 rounded border-[#c7d3e3] accent-[#2563eb]"
            />
            <span>
              <span className={cn("block text-[12.5px] font-semibold", HEADING)}>
                {t("dialog.activate")}
              </span>
              <span className={cn("block text-[10.5px]", MUTED)}>{t("dialog.activateHint")}</span>
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="bg-[#2878ff] text-white hover:bg-[#1f66e0]"
            disabled={busy}
            onClick={onSubmit}
          >
            {busy ? savingLabel : submitLabel}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
