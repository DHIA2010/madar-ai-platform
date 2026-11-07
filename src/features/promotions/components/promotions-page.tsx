"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  BadgePercent,
  CalendarClock,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Store,
  Tag,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppConfirmDialog } from "@/components/app"

import { getActiveApplications } from "@/features/applications"
import { productCategoryService, productListService } from "@/features/products"
import { useWorkspace } from "@/features/workspace"

import { promotionStatus } from "../domain/promotion-engine"
import { promotionService } from "../services/promotion-service"
import type { Promotion, PromotionInput, PromotionStatus } from "../types/promotion.types"
import type { PickerProduct } from "./product-multi-picker"
import { PromotionEditorDialog } from "./promotion-editor-dialog"
import { HEADING, MUTED, PANEL } from "./promotion-styles"

import { type Locale, localeDirection } from "@/i18n/locales"

const STATUS_TINT: Record<PromotionStatus, string> = {
  active: "bg-[#e9f8ef] text-[#1f9d55]",
  scheduled: "bg-[#eef4ff] text-[#2878ff]",
  outsideHours: "bg-[#fff7e6] text-[#b45309]",
  expired: "bg-[#f1f3f7] text-[#6b7b96]",
  paused: "bg-[#f1f3f7] text-[#6b7b96]",
}

function formatMoney(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDay(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))
}

function toInput(promotion: Promotion, isPaused: boolean): PromotionInput {
  return {
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    maxDiscountPerUnit: promotion.maxDiscountPerUnit,
    scope: promotion.scope,
    productIds: promotion.productIds,
    categories: promotion.categories,
    excludedProductIds: promotion.excludedProductIds,
    workspaceIds: promotion.workspaceIds,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    daysOfWeek: promotion.daysOfWeek,
    startTime: promotion.startTime,
    endTime: promotion.endTime,
    licenceNumber: promotion.licenceNumber,
    isPaused,
  }
}

// The Promotions app: automatic discounts the cashier applies by itself.
export function PromotionsPage() {
  const t = useTranslations("promotions")
  const locale = useLocale() as Locale
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const enabled = getActiveApplications(currentOrganization?.settings).includes("promotions")

  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<PickerProduct[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [editing, setEditing] = useState<Promotion | "new" | null>(null)
  const [deleting, setDeleting] = useState<Promotion | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // When the list was last loaded -- statuses are shown as of then.
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(async () => {
    try {
      setPromotions(await promotionService.list())
      setNow(new Date())
    } catch {
      toast.error(t("toasts.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!enabled) return
    void load()
    productListService
      .listProducts()
      .then((items) =>
        setProducts(
          items
            .filter((item) => item.isNative)
            .map((item) => ({
              id: item.id,
              name: item.name,
              sku: item.sku ?? null,
              category: item.category ?? null,
            }))
        )
      )
      .catch(() => setProducts([]))
    productCategoryService
      .list()
      .then((items) => setCategories(items.map((item) => item.name)))
      .catch(() => setCategories([]))
  }, [enabled, load])

  const branchName = useMemo(
    () => new Map(availableWorkspaces.map((workspace) => [workspace.id, workspace.name])),
    [availableWorkspaces]
  )

  async function save(input: PromotionInput) {
    if (editing && editing !== "new") {
      await promotionService.update(editing.id, input)
      toast.success(t("toasts.saved"))
    } else {
      await promotionService.create(input)
      toast.success(t("toasts.created"))
    }
    await load()
  }

  async function togglePause(promotion: Promotion) {
    setBusyId(promotion.id)
    try {
      await promotionService.update(promotion.id, toInput(promotion, !promotion.isPaused))
      await load()
    } catch {
      toast.error(t("toasts.saveFailed"))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await promotionService.remove(deleting.id)
      toast.success(t("toasts.deleted"))
      setDeleting(null)
      await load()
    } catch {
      toast.error(t("toasts.saveFailed"))
    }
  }

  if (!enabled) {
    return (
      <div dir={localeDirection(locale)} className={cn(PANEL, "mx-auto max-w-xl p-8 text-center")}>
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#fff4e5] text-[#ea580c]">
          <BadgePercent className="size-7" />
        </span>
        <h1 className={cn("mt-4 text-xl font-bold", HEADING)}>{t("locked.title")}</h1>
        <p className={cn("mt-2 text-sm leading-6", MUTED)}>{t("locked.description")}</p>
        <Link
          href={ROUTES.marketplaceDetails("promotions")}
          className="mt-5 inline-flex h-11 items-center rounded-full bg-[#ea580c] px-6 text-[13.5px] font-bold text-white hover:bg-[#c2410c]"
        >
          {t("locked.cta")}
        </Link>
      </div>
    )
  }

  const activeCount = promotions.filter((p) => promotionStatus(p, now) === "active").length
  const discountTotal = promotions.reduce((sum, p) => sum + p.stats.discountTotal, 0)
  const invoiceTotal = promotions.reduce((sum, p) => sum + p.stats.invoiceCount, 0)

  const describeTarget = (promotion: Promotion) => {
    const base =
      promotion.scope === "all"
        ? t("target.all")
        : promotion.scope === "products"
          ? t("target.products", { count: promotion.productIds.length })
          : promotion.categories.join("، ")
    return promotion.excludedProductIds.length > 0
      ? `${base} ${t("target.excluding", { count: promotion.excludedProductIds.length })}`
      : base
  }

  const describeSchedule = (promotion: Promotion) => {
    const parts: string[] = []
    if (promotion.startsAt || promotion.endsAt) {
      parts.push(
        `${promotion.startsAt ? formatDay(promotion.startsAt, locale) : t("schedule.now")} - ${
          promotion.endsAt ? formatDay(promotion.endsAt, locale) : t("schedule.noEnd")
        }`
      )
    } else {
      parts.push(t("schedule.always"))
    }
    if (promotion.daysOfWeek.length > 0) {
      parts.push(promotion.daysOfWeek.map((day) => t(`editor.weekDays.${day}`)).join("، "))
    }
    if (promotion.startTime && promotion.endTime) {
      parts.push(`${promotion.startTime} - ${promotion.endTime}`)
    }
    return parts.join(" · ")
  }

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={cn("text-2xl font-bold", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 text-sm", MUTED)}>{t("subtitle")}</p>
        </div>
        <AppButton
          icon={
            <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
              <Plus className="size-3.5" strokeWidth={2.5} />
            </span>
          }
          className="h-11 gap-2 rounded-full bg-[#ea580c] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(234,88,12,0.25)] hover:bg-[#c2410c]"
          onClick={() => setEditing("new")}
        >
          {t("add")}
        </AppButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: t("kpis.active"), value: String(activeCount) },
          { label: t("kpis.invoices"), value: String(invoiceTotal) },
          { label: t("kpis.discount"), value: `${formatMoney(discountTotal, locale)} ${t("sar")}` },
        ].map((kpi) => (
          <div key={kpi.label} className={cn(PANEL, "p-4")}>
            <p className={cn("text-[12px] font-semibold", MUTED)}>{kpi.label}</p>
            <p className={cn("mt-1.5 text-[22px] font-extrabold", HEADING)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className={cn(PANEL, "flex items-center justify-center p-12")}>
          <Loader2 className="size-6 animate-spin text-[#95a4bd]" />
        </div>
      ) : promotions.length === 0 ? (
        <div className={cn(PANEL, "p-10 text-center")}>
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#fff4e5] text-[#ea580c]">
            <Tag className="size-6" />
          </span>
          <p className={cn("mt-3 text-[15px] font-bold", HEADING)}>{t("empty.title")}</p>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("empty.description")}</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {promotions.map((promotion) => {
            const status = promotionStatus(promotion, now)
            return (
              <div key={promotion.id} className={cn(PANEL, "flex flex-col gap-3 p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#fff4e5] text-[15px] font-extrabold text-[#ea580c]">
                      {promotion.discountType === "percent"
                        ? `${promotion.discountValue}%`
                        : formatMoney(promotion.discountValue, locale).replace(/\.00$/, "")}
                    </span>
                    <div className="min-w-0">
                      <p className={cn("truncate text-[14.5px] font-bold", HEADING)}>
                        {promotion.name}
                      </p>
                      <p className={cn("text-[12px]", MUTED)}>
                        {promotion.discountType === "percent"
                          ? promotion.maxDiscountPerUnit
                            ? t("discount.percentCapped", {
                                value: promotion.discountValue,
                                cap: formatMoney(promotion.maxDiscountPerUnit, locale),
                              })
                            : t("discount.percent", { value: promotion.discountValue })
                          : t("discount.fixed", {
                              value: formatMoney(promotion.discountValue, locale),
                            })}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      STATUS_TINT[status]
                    )}
                  >
                    {t(`status.${status}`)}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 text-[12.5px]">
                  <p className="flex items-center gap-2 text-[#0b1738]">
                    <Tag className="size-3.5 shrink-0 text-[#95a4bd]" />
                    <span className="truncate">{describeTarget(promotion)}</span>
                  </p>
                  <p className="flex items-center gap-2 text-[#0b1738]">
                    <CalendarClock className="size-3.5 shrink-0 text-[#95a4bd]" />
                    <span className="truncate">{describeSchedule(promotion)}</span>
                  </p>
                  <p className="flex items-center gap-2 text-[#0b1738]">
                    <Store className="size-3.5 shrink-0 text-[#95a4bd]" />
                    <span className="truncate">
                      {promotion.workspaceIds.length === 0
                        ? t("editor.allBranches")
                        : promotion.workspaceIds.map((id) => branchName.get(id) ?? "—").join("، ")}
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-[#eef2f8] pt-3">
                  <p className={cn("text-[12px]", MUTED)}>
                    {t("stats", {
                      invoices: promotion.stats.invoiceCount,
                      discount: formatMoney(promotion.stats.discountTotal, locale),
                    })}
                  </p>
                  <div className="flex items-center gap-1">
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={promotion.isPaused ? t("resume") : t("pause")}
                      title={promotion.isPaused ? t("resume") : t("pause")}
                      loading={busyId === promotion.id}
                      onClick={() => void togglePause(promotion)}
                    >
                      {promotion.isPaused ? (
                        <Play className="size-4" />
                      ) : (
                        <Pause className="size-4" />
                      )}
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("edit")}
                      title={t("edit")}
                      onClick={() => setEditing(promotion)}
                    >
                      <Pencil className="size-4" />
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("delete")}
                      title={t("delete")}
                      className="text-[#dc2626] hover:bg-[#fef2f2]"
                      onClick={() => setDeleting(promotion)}
                    >
                      <Trash2 className="size-4" />
                    </AppButton>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing ? (
        <PromotionEditorDialog
          initial={editing === "new" ? null : editing}
          products={products}
          categories={categories}
          branches={availableWorkspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
          }))}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      <AppConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description", { name: deleting?.name ?? "" })}
        confirmLabel={t("delete")}
        cancelLabel={t("editor.cancel")}
        confirmTone="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
