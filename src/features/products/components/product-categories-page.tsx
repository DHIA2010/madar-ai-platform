"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { LucideIcon } from "lucide-react"
import {
  CheckCircle2,
  ChevronLeft,
  EyeOff,
  Globe,
  Loader2,
  Package,
  PackageX,
  Plus,
  ShoppingBag,
  Store,
  Tags,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppConfirmDialog,
  AppDialog,
  AppInput,
  AppSearchableSelect,
  AppSearchInput,
  AppStatusBadge,
  AppSwitch,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import {
  type ProductCategory,
  productCategoryService,
  type ProductCategorySource,
  type ProductCategoryStatus,
} from "../services/product-list.service"

import { type Locale, localeDirection } from "@/i18n/locales"

// Same surface language as the Suppliers/Expenses list pages.
const PANEL =
  "rounded-[16px] border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#e1e7f0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#95a4bd]"
const PRIMARY_BUTTON_CLASS =
  "h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
const PAGE_SIZE = 12
const UNSPECIFIED_CATEGORY = "غير محدد"

const KPI_TONE = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
} as const

const SOURCE_STYLE: Record<ProductCategorySource, { icon: LucideIcon; className: string }> = {
  madar: { icon: Store, className: "border-blue-100 bg-blue-50 text-blue-700" },
  salla: { icon: ShoppingBag, className: "border-teal-100 bg-teal-50 text-teal-700" },
  zid: { icon: Globe, className: "border-violet-100 bg-violet-50 text-violet-700" },
  shopify: { icon: ShoppingBag, className: "border-emerald-100 bg-emerald-50 text-emerald-700" },
}

// A stable tint per category, from its first letter -- the same idea the cashier's category tiles use.
const TILE_TINTS = [
  "bg-sky-50 text-sky-600",
  "bg-violet-50 text-violet-600",
  "bg-amber-50 text-amber-600",
  "bg-emerald-50 text-emerald-600",
  "bg-rose-50 text-rose-600",
  "bg-indigo-50 text-indigo-600",
]

function tileTint(name: string) {
  return TILE_TINTS[(name.codePointAt(0) ?? 0) % TILE_TINTS.length]
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: keyof typeof KPI_TONE
}) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-[12.5px] font-semibold", MUTED)}>{label}</p>
        <span
          className={cn("flex size-9 items-center justify-center rounded-[10px]", KPI_TONE[tone])}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("mt-3 text-[22px] font-extrabold", HEADING)}>{value}</p>
    </div>
  )
}

function SourceChip({ source, label }: { source: ProductCategorySource; label: string }) {
  const { icon: Icon, className } = SOURCE_STYLE[source]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
        className
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  )
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  previousLabel,
  nextLabel,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  previousLabel: string
  nextLabel: string
}) {
  if (totalPages <= 1) return null
  const navButton =
    "flex h-10 items-center gap-1 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[12.5px] font-semibold text-[#6b7b96] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-50"
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={navButton}
      >
        <ChevronLeft className="size-4 rtl:rotate-180" />
        {previousLabel}
      </button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          onClick={() => onPageChange(pageNumber)}
          aria-current={pageNumber === page ? "page" : undefined}
          className={cn(
            "flex h-10 min-w-10 items-center justify-center rounded-[10px] border px-3 text-[13px] font-bold transition-colors",
            pageNumber === page
              ? "border-[#2878ff] bg-[#2878ff] text-white shadow-[0_4px_10px_rgba(40,120,255,0.3)]"
              : "border-[#e1e7f0] bg-white text-[#0b1738] hover:border-[#c4d5f0] hover:bg-[#f7f9fd]"
          )}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={navButton}
      >
        {nextLabel}
        <ChevronLeft className="size-4 ltr:rotate-180" />
      </button>
    </div>
  )
}

// Products -> Categories: every category the workspace's products carry (from Madar and each
// connected store) plus the ones created here. Switching one off hides it, and its products, from
// the cashier.
export function ProductCategoriesPage() {
  const t = useTranslations("productCategories")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)

  const [categories, setCategories] = useState<ProductCategory[] | null>(null)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | ProductCategoryStatus>("all")
  const [source, setSource] = useState<"all" | ProductCategorySource>("all")
  const [page, setPage] = useState(1)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const overview = await productCategoryService.overview()
      setCategories(overview.items)
      setUncategorizedCount(overview.uncategorizedCount)
    } catch {
      toast.error(t("toasts.loadFailed"))
      setCategories((current) => current ?? [])
    }
  }

  useEffect(() => {
    let cancelled = false
    productCategoryService
      .overview()
      .then((overview) => {
        if (cancelled) return
        setCategories(overview.items)
        setUncategorizedCount(overview.uncategorizedCount)
      })
      .catch(() => {
        if (cancelled) return
        toast.error(t("toasts.loadFailed"))
        setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const sourceLabel = (value: ProductCategorySource) => t(`sources.${value}`)
  const all = useMemo(() => categories ?? [], [categories])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return all.filter(
      (category) =>
        (!query || category.name.toLowerCase().includes(query)) &&
        (status === "all" || category.status === status) &&
        (source === "all" || category.sources.includes(source))
    )
  }, [all, search, status, source])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const activeCount = all.filter((category) => category.status === "active").length
  // "غير محدد" is the cashier quick-add's placeholder, counted under uncategorized instead.
  const categorizedProducts = all
    .filter((category) => category.name.trim() !== UNSPECIFIED_CATEGORY)
    .reduce((sum, category) => sum + category.productCount, 0)

  async function toggleStatus(category: ProductCategory, active: boolean) {
    const next: ProductCategoryStatus = active ? "active" : "inactive"
    setPendingName(category.name)
    // Flip it right away; put it back if the save fails.
    setCategories((current) =>
      (current ?? []).map((entry) =>
        entry.name === category.name ? { ...entry, status: next } : entry
      )
    )
    try {
      await productCategoryService.setStatus(category.name, next)
      toast.success(t(active ? "toasts.shown" : "toasts.hidden", { name: category.name }))
    } catch {
      setCategories((current) =>
        (current ?? []).map((entry) =>
          entry.name === category.name ? { ...entry, status: category.status } : entry
        )
      )
      toast.error(t("toasts.statusFailed"))
    } finally {
      setPendingName(null)
    }
  }

  async function addCategory() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      await productCategoryService.create(name)
      toast.success(t("toasts.added", { name }))
      setAddOpen(false)
      setNewName("")
      await load()
    } catch (error) {
      toast.error(
        (error as { code?: string })?.code === "CATEGORY_EXISTS"
          ? t("toasts.exists")
          : t("toasts.addFailed")
      )
    } finally {
      setAdding(false)
    }
  }

  async function deleteCategory() {
    if (!deleteTarget?.id) return
    setDeleting(true)
    try {
      await productCategoryService.remove(deleteTarget.id)
      toast.success(t("toasts.deleted", { name: deleteTarget.name }))
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error(t("toasts.deleteFailed"))
    } finally {
      setDeleting(false)
    }
  }

  const statusOptions = [
    { value: "all", label: t("filters.allStatuses") },
    { value: "active", label: t("status.active") },
    { value: "inactive", label: t("status.inactive") },
  ]
  const sourceOptions = [
    { value: "all", label: t("filters.allSources") },
    ...(["madar", "salla", "zid", "shopify"] as const).map((value) => ({
      value,
      label: sourceLabel(value),
    })),
  ]

  return (
    <div dir={dir} className="flex flex-col gap-4">
      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>{t("heading")}</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>{t("subheading")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label={t("kpis.total")} value={all.length} icon={Tags} tone="blue" />
        <KpiCard label={t("kpis.active")} value={activeCount} icon={CheckCircle2} tone="emerald" />
        <KpiCard
          label={t("kpis.hidden")}
          value={all.length - activeCount}
          icon={EyeOff}
          tone="amber"
        />
        <KpiCard
          label={t("kpis.products")}
          value={categorizedProducts}
          icon={Package}
          tone="violet"
        />
        <KpiCard
          label={t("kpis.uncategorized")}
          value={uncategorizedCount}
          icon={PackageX}
          tone="rose"
        />
      </div>

      <div className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <AppSearchInput
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          wrapperClassName="w-full sm:w-72"
          className={FIELD_CLASS}
        />
        <div className="flex flex-wrap items-center gap-2">
          <AppSearchableSelect
            value={status}
            options={statusOptions}
            onChange={(value) => {
              setStatus(value as typeof status)
              setPage(1)
            }}
            placeholder={t("filters.status")}
            ariaLabel={t("filters.status")}
            triggerClassName="w-[160px]"
          />
          <AppSearchableSelect
            value={source}
            options={sourceOptions}
            onChange={(value) => {
              setSource(value as typeof source)
              setPage(1)
            }}
            placeholder={t("filters.source")}
            ariaLabel={t("filters.source")}
            triggerClassName="w-[160px]"
          />
          <AppButton
            icon={
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            }
            onClick={() => setAddOpen(true)}
            className={PRIMARY_BUTTON_CLASS}
          >
            {t("add")}
          </AppButton>
        </div>
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>{t("table.category")}</AppTableHead>
              <AppTableHead>{t("table.source")}</AppTableHead>
              <AppTableHead>{t("table.products")}</AppTableHead>
              <AppTableHead>{t("table.status")}</AppTableHead>
              <AppTableHead>{t("table.cashier")}</AppTableHead>
              <AppTableHead className="w-16">{t("table.actions")}</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {rows.map((category) => {
              const active = category.status === "active"
              const deletable =
                category.id !== null &&
                category.productCount === 0 &&
                category.sources.length === 1 &&
                category.sources[0] === "madar"
              return (
                <AppTableRow key={category.name}>
                  <AppTableCell>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-extrabold",
                          tileTint(category.name)
                        )}
                      >
                        {category.name.slice(0, 1)}
                      </span>
                      <span className={cn("font-semibold", HEADING)}>{category.name}</span>
                    </div>
                  </AppTableCell>
                  <AppTableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {category.sources.map((value) => (
                        <SourceChip key={value} source={value} label={sourceLabel(value)} />
                      ))}
                    </div>
                  </AppTableCell>
                  <AppTableCell>
                    <span
                      className={cn(
                        "inline-flex min-w-9 justify-center rounded-full bg-[#f1f4f9] px-2.5 py-1 text-[12px] font-bold",
                        HEADING
                      )}
                    >
                      {category.productCount}
                    </span>
                  </AppTableCell>
                  <AppTableCell>
                    <AppStatusBadge
                      status="neutral"
                      label={t(`status.${category.status}`)}
                      className={
                        active ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }
                    />
                  </AppTableCell>
                  <AppTableCell>
                    <label className="inline-flex cursor-pointer items-center gap-2.5">
                      <AppSwitch
                        checked={active}
                        disabled={pendingName === category.name}
                        onCheckedChange={(checked) => void toggleStatus(category, checked)}
                        aria-label={t("table.cashier")}
                      />
                      <span className={cn("text-[12px] font-medium", MUTED)}>
                        {active ? t("cashier.shown") : t("cashier.hidden")}
                      </span>
                    </label>
                  </AppTableCell>
                  <AppTableCell>
                    {deletable ? (
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("delete")}
                        className="rounded-[8px] border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                        onClick={() => setDeleteTarget(category)}
                      >
                        <Trash2 className="size-4" />
                      </AppButton>
                    ) : (
                      <span className="text-[12px] text-[#c4cfe0]">—</span>
                    )}
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>

        {categories === null ? (
          <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <AppTableEmpty
            title={all.length === 0 ? t("empty.title") : t("empty.noMatchTitle")}
            description={all.length === 0 ? t("empty.description") : t("empty.noMatchDescription")}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e7f0] px-4 py-3">
          <p className={cn("shrink-0 text-sm whitespace-nowrap", MUTED)}>
            {t("showingCount", { shown: rows.length, total: filtered.length })}
          </p>
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            previousLabel={tCommon("previous")}
            nextLabel={tCommon("next")}
          />
        </div>
      </div>

      <AppDialog
        open={addOpen}
        onOpenChange={(open) => {
          if (adding) return
          setAddOpen(open)
          if (!open) setNewName("")
        }}
        title={
          <span dir={dir} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
              <Tags className="size-5" />
            </span>
            <span className="text-[17px] font-extrabold text-[#0b1738]">
              {t("addDialog.title")}
            </span>
          </span>
        }
        description={
          <span dir={dir} className="text-[13px] text-[#6b7b96]">
            {t("addDialog.description")}
          </span>
        }
        contentClassName={cn(
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
          "max-w-[28rem] gap-5 p-6"
        )}
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-11 flex-1 rounded-[10px] border-[#e1e7f0] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
              disabled={adding}
              onClick={() => {
                setAddOpen(false)
                setNewName("")
              }}
            >
              {tCommon("cancel")}
            </AppButton>
            <AppButton
              className="h-11 flex-1 rounded-[10px] bg-[#2878ff] font-bold text-white hover:bg-[#1f63d6]"
              loading={adding}
              disabled={!newName.trim()}
              onClick={() => void addCategory()}
            >
              {t("addDialog.submit")}
            </AppButton>
          </div>
        }
      >
        <div dir={dir} className="space-y-2">
          <label className={cn("block text-[12.5px] font-semibold", HEADING)}>
            {t("addDialog.nameLabel")}
          </label>
          <AppInput
            autoFocus
            value={newName}
            maxLength={80}
            placeholder={t("addDialog.namePlaceholder")}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addCategory()
            }}
            className={FIELD_CLASS}
          />
          <p className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
            <SourceChip source="madar" label={sourceLabel("madar")} />
            {t("addDialog.hint")}
          </p>
        </div>
      </AppDialog>

      <AppConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}
        title={
          <span dir={dir} className="text-[17px] font-extrabold text-[#0b1738]">
            {t("deleteDialog.title", { name: deleteTarget?.name ?? "" })}
          </span>
        }
        description={
          <span dir={dir} className="text-[13px] text-[#6b7b96]">
            {t("deleteDialog.description")}
          </span>
        }
        confirmLabel={t("delete")}
        cancelLabel={tCommon("cancel")}
        confirmButtonClassName="rounded-[10px] bg-rose-600 font-bold text-white hover:bg-rose-700"
        cancelButtonClassName="rounded-[10px] border-[#e1e7f0] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
        loading={deleting}
        onConfirm={() => void deleteCategory()}
        onCancel={() => setDeleteTarget(null)}
        contentClassName={cn(
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
          "max-w-[26rem] gap-5 p-6"
        )}
      />
    </div>
  )
}
