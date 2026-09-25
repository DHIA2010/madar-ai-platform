"use client"

import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileBarChart2,
  GitBranch,
  type LucideIcon,
  MoreHorizontal,
  Package,
  PieChart,
  Plus,
  Tag,
  TrendingUp,
  Users,
  Warehouse,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppLoading,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { Can } from "@/features/authentication"

import { type CustomReport, reportService } from "../services"

const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const PAGER_BUTTON_CLASS =
  "flex size-9 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-40"
const PAGE_SIZE_OPTIONS = [10, 25, 50]
// The one action-button shape this page uses everywhere else (the category filters, the tab
// switcher) -- a full pill, not AppButton's own rounded-lg default, which otherwise sits visually
// inconsistent right beside these.
const PILL_PRIMARY_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[#2878ff] px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_4px_12px_rgba(40,120,255,0.24)] transition-colors hover:bg-[#1f63d6]"
const PILL_SECONDARY_CLASS =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e1e7f0] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738]"

interface CategoryMeta {
  label: string
  badgeClassName: string
  icon: LucideIcon
  iconTileClassName: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  sales: {
    label: "المبيعات",
    badgeClassName: "bg-[#eaf1ff] text-[#2878ff]",
    icon: BarChart3,
    iconTileClassName: "bg-[#eaf1ff] text-[#2878ff]",
  },
  products: {
    label: "المنتجات",
    badgeClassName: "bg-[#f3ecff] text-[#8b5cf6]",
    icon: Package,
    iconTileClassName: "bg-[#f3ecff] text-[#8b5cf6]",
  },
  inventory: {
    label: "المخزون",
    badgeClassName: "bg-[#fff7e6] text-[#e08b00]",
    icon: Warehouse,
    iconTileClassName: "bg-[#fff7e6] text-[#e08b00]",
  },
  customers: {
    label: "العملاء",
    badgeClassName: "bg-[#e9f8ef] text-[#1f9d55]",
    icon: Users,
    iconTileClassName: "bg-[#e9f8ef] text-[#1f9d55]",
  },
  financial: {
    label: "المالية",
    badgeClassName: "bg-[#fdeeee] text-[#e0484d]",
    icon: PieChart,
    iconTileClassName: "bg-[#fdeeee] text-[#e0484d]",
  },
  marketing: {
    label: "التسويق",
    badgeClassName: "bg-[#e6fbfa] text-[#0d9488]",
    icon: TrendingUp,
    iconTileClassName: "bg-[#e6fbfa] text-[#0d9488]",
  },
}

const DEFAULT_CATEGORY_META: CategoryMeta = {
  label: "أخرى",
  badgeClassName: "bg-[#eef2f8] text-[#5b6b85]",
  icon: FileBarChart2,
  iconTileClassName: "bg-[#eef2f8] text-[#5b6b85]",
}

// A handful of the seeded ready-made reports read better with a more specific icon than their
// category's default (e.g. "sales" defaults to a bar chart, but the branch-comparison report
// reads more clearly as a share/branch icon) -- purely cosmetic, falls back to the category icon
// for every custom report a user creates.
const REPORT_NAME_ICON: Record<string, LucideIcon> = {
  "تقرير المبيعات حسب الفرع": GitBranch,
  "تقرير الحركة اليومية": TrendingUp,
  "تقرير الفئات": Tag,
}

function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? DEFAULT_CATEGORY_META
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
}

function ReportRowIcon({ report }: { report: CustomReport }) {
  const meta = categoryMeta(report.category)
  const Icon = REPORT_NAME_ICON[report.name] ?? meta.icon
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
        meta.iconTileClassName
      )}
    >
      <Icon className="size-4.5" />
    </span>
  )
}

function ReportsTable({
  reports,
  loading,
  showOwner,
  onDelete,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  reports: CustomReport[]
  loading: boolean
  showOwner: boolean
  onDelete?: (report: CustomReport) => void
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription: string
  emptyAction?: ReactNode
}) {
  const router = useRouter()

  if (loading) {
    return <AppLoading variant="table" rows={5} />
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-[#dbe4f3] bg-[#fafbfd] px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-[14px] bg-[#eaf1ff] text-[#2878ff]">
          <EmptyIcon className="size-5" />
        </span>
        <div>
          <p className={cn("text-[13.5px] font-bold", HEADING)}>{emptyTitle}</p>
          <p className={cn("mx-auto mt-1 max-w-[320px] text-[12px]", MUTED)}>{emptyDescription}</p>
        </div>
        {emptyAction}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-right">
        <thead>
          <tr>
            {[
              { key: "name", label: "اسم التقرير", align: "text-right" },
              { key: "description", label: "الوصف", align: "text-right" },
              { key: "category", label: "الفئة", align: "text-right" },
              ...(showOwner ? [{ key: "owner", label: "المالك", align: "text-right" }] : []),
              { key: "updatedAt", label: "آخر تحديث", align: "text-right" },
              ...(onDelete ? [{ key: "more", label: "الإجراءات", align: "text-center" }] : []),
              { key: "actions", label: "", align: "text-center" },
            ].map((column) => (
              <th
                key={column.key}
                className={cn(
                  "border-b border-[#eef2f8] px-3 py-2.5 text-[11px] font-semibold text-black",
                  column.align
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const meta = categoryMeta(report.category)
            return (
              <tr
                key={report.id}
                className="border-b border-[#f4f7fb] transition-colors hover:bg-[#f8fafd]"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <ReportRowIcon report={report} />
                    <p className={cn("truncate text-[12.5px] font-bold", HEADING)}>{report.name}</p>
                  </div>
                </td>
                <td className={cn("px-3 py-2 text-[12px]", MUTED)}>{report.description}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                      meta.badgeClassName
                    )}
                  >
                    {meta.label}
                  </span>
                </td>
                {showOwner && (
                  <td className={cn("px-3 py-2 text-[11.5px]", MUTED)}>
                    {report.createdByName ?? report.createdByUserId.slice(0, 8)}
                  </td>
                )}
                <td className="px-3 py-2">
                  <p className={cn("text-[12px]", HEADING)}>{formatDate(report.updatedAt)}</p>
                  <p className={cn("text-[10.5px]", MUTED)}>
                    {report.isSystem
                      ? "بواسطة النظام"
                      : `بواسطة ${report.createdByName ?? "مستخدم"}`}
                  </p>
                </td>
                {onDelete && (
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center">
                      <AppDropdownMenu>
                        <AppDropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-black hover:bg-[#f2f5fa]"
                            aria-label="المزيد من الإجراءات"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </AppDropdownMenuTrigger>
                        <AppDropdownMenuContent align="end">
                          <AppDropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => router.push(ROUTES.reportsCustomEdit(report.id))}
                          >
                            تعديل
                          </AppDropdownMenuItem>
                          <AppDropdownMenuItem
                            className="cursor-pointer text-[#e0484d] focus:text-[#e0484d]"
                            onClick={() => onDelete(report)}
                          >
                            حذف
                          </AppDropdownMenuItem>
                        </AppDropdownMenuContent>
                      </AppDropdownMenu>
                    </div>
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => router.push(ROUTES.reportsCustomView(report.id))}
                      className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[#eaf1ff] px-3.5 py-2 text-[12px] font-semibold text-[#2878ff] transition-colors hover:bg-[#2878ff] hover:text-white"
                    >
                      <Eye className="size-3.5" />
                      عرض التقرير
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CategoryFilterRow({
  categories,
  selected,
  onSelect,
}: {
  categories: string[]
  selected: string | null
  onSelect: (category: string | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "cursor-pointer rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors",
          selected === null
            ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.28)]"
            : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
        )}
      >
        الكل
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(category)}
          className={cn(
            "cursor-pointer rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors",
            selected === category
              ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.28)]"
              : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
          )}
        >
          {categoryMeta(category).label}
        </button>
      ))}
    </div>
  )
}

function PaginationFooter({
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  totalCount: number
  currentPage: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="flex flex-col gap-3 border-t border-[#f1f4f9] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className={cn("text-[12px]", MUTED)}>
          {totalCount === 0
            ? "لا توجد نتائج"
            : `عرض ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalCount)} من ${totalCount} تقرير`}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("text-[12px]", MUTED)}>عدد العناصر في الصفحة</span>
          <AppSelect
            value={String(pageSize)}
            onValueChange={(next) => onPageSizeChange(Number(next))}
          >
            <AppSelectTrigger className="h-9 w-[74px] rounded-[10px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <AppSelectItem key={option} value={String(option)}>
                  {option}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={PAGER_BUTTON_CLASS}
          disabled={currentPage === 1}
          aria-label="الصفحة الأولى"
          onClick={() => onPageChange(1)}
        >
          <ChevronsRight className="size-4" />
        </button>
        <button
          type="button"
          className={PAGER_BUTTON_CLASS}
          disabled={currentPage === 1}
          aria-label="الصفحة السابقة"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          <ChevronRight className="size-4" />
        </button>

        {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
          const first = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
          const pageNumber = Math.max(1, first) + index
          if (pageNumber > totalPages) return null

          return (
            <button
              key={pageNumber}
              type="button"
              className={cn(
                "flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-[8px] border px-2 text-[12px] font-bold transition-colors",
                pageNumber === currentPage
                  ? "border-[#2878ff] bg-white text-[#2878ff]"
                  : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
              )}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          )
        })}

        <button
          type="button"
          className={PAGER_BUTTON_CLASS}
          disabled={currentPage === totalPages}
          aria-label="الصفحة التالية"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          className={PAGER_BUTTON_CLASS}
          disabled={currentPage === totalPages}
          aria-label="الصفحة الأخيرة"
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsLeft className="size-4" />
        </button>
      </div>
    </div>
  )
}

function ReportsTab({
  reports,
  loading,
  showOwner,
  title,
  subtitle,
  tileIcon: TileIcon,
  onDelete,
  headerActions,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  reports: CustomReport[]
  loading: boolean
  showOwner: boolean
  title: string
  subtitle: string
  tileIcon: LucideIcon
  onDelete?: (report: CustomReport) => void
  headerActions?: ReactNode
  emptyTitle: string
  emptyDescription: string
  emptyAction?: ReactNode
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const categories = useMemo(
    () => Array.from(new Set(reports.map((report) => report.category))),
    [reports]
  )

  const filtered = useMemo(
    () =>
      selectedCategory ? reports.filter((report) => report.category === selectedCategory) : reports,
    [reports, selectedCategory]
  )

  const paginated = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  )

  return (
    <div className="rounded-[14px] border border-[#e1e7f0] bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 border-b border-[#f1f4f9] pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf1ff] text-[#2878ff]">
            <TileIcon className="size-4.5" />
          </span>
          <div>
            <h2 className={cn("text-[14px] font-bold", HEADING)}>{title}</h2>
            <p className={cn("mt-0.5 text-[12px]", MUTED)}>{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">{headerActions}</div>
      </div>

      {reports.length > 0 && (
        <div className="mb-3">
          <CategoryFilterRow
            categories={categories}
            selected={selectedCategory}
            onSelect={(category) => {
              setSelectedCategory(category)
              setPage(1)
            }}
          />
        </div>
      )}

      <ReportsTable
        reports={paginated}
        loading={loading}
        showOwner={showOwner}
        onDelete={onDelete}
        emptyIcon={TileIcon}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={emptyAction}
      />

      {!loading && filtered.length > 0 && (
        <div className="mt-3">
          <PaginationFooter
            totalCount={filtered.length}
            currentPage={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </div>
      )}
    </div>
  )
}

export function ReportsOverviewPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"ready" | "custom">("ready")
  const [readyMade, setReadyMade] = useState<CustomReport[]>([])
  const [custom, setCustom] = useState<CustomReport[]>([])
  const [loadingReady, setLoadingReady] = useState(true)
  const [loadingCustom, setLoadingCustom] = useState(true)

  const loadCustom = () => {
    setLoadingCustom(true)
    reportService
      .list(false)
      .then(setCustom)
      .finally(() => setLoadingCustom(false))
  }

  useEffect(() => {
    reportService
      .list(true)
      .then(setReadyMade)
      .finally(() => setLoadingReady(false))
    reportService
      .list(false)
      .then(setCustom)
      .finally(() => setLoadingCustom(false))
  }, [])

  const handleDelete = async (report: CustomReport) => {
    try {
      await reportService.remove(report.id)
      toast.success("تم حذف التقرير بنجاح.")
      loadCustom()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف التقرير.")
    }
  }

  const customTabActions = (
    <>
      <Can permission="reports:manage">
        <button
          type="button"
          className={PILL_PRIMARY_CLASS}
          onClick={() => router.push(ROUTES.reportsCustomNew)}
        >
          <Plus className="size-4" />
          إنشاء تقرير مخصص
        </button>
      </Can>
      <button
        type="button"
        className={PILL_SECONDARY_CLASS}
        onClick={() => router.push(ROUTES.reportsKpis)}
      >
        المؤشرات المحفوظة
      </button>
    </>
  )

  return (
    <div dir="rtl" className="space-y-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-[#eaf1ff] text-[#2878ff]">
          <FileBarChart2 className="size-5" />
        </span>
        <div>
          <h1 className={cn("text-[19px] font-extrabold", HEADING)}>التقارير</h1>
          <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>
            اكتشف رؤى أعمالك من خلال التقارير الجاهزة أو أنشئ تقاريرك المخصصة
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("ready")}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors",
            activeTab === "ready"
              ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.28)]"
              : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
          )}
        >
          <FileBarChart2 className="size-4" />
          التقارير الجاهزة
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("custom")}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors",
            activeTab === "custom"
              ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.28)]"
              : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
          )}
        >
          <BarChart3 className="size-4" />
          التقارير المخصصة
        </button>
      </div>

      {activeTab === "ready" ? (
        <ReportsTab
          reports={readyMade}
          loading={loadingReady}
          showOwner={false}
          title="التقارير الجاهزة"
          subtitle="تقارير معدة مسبقاً وجاهزة للاستخدام"
          tileIcon={FileBarChart2}
          emptyTitle="لا توجد تقارير جاهزة بعد"
          emptyDescription="سيتم عرض التقارير الجاهزة هنا فور توفرها."
        />
      ) : (
        <ReportsTab
          reports={custom}
          loading={loadingCustom}
          showOwner
          title="التقارير المخصصة"
          subtitle="أنشئ تقاريرك الخاصة وتحكم في بياناتك"
          tileIcon={BarChart3}
          onDelete={handleDelete}
          headerActions={customTabActions}
          emptyTitle="لا توجد تقارير مخصصة بعد"
          emptyDescription="أنشئ أول تقرير مخصص لمتابعة البيانات التي تهمك من مؤشراتك المحفوظة."
          emptyAction={
            <Can permission="reports:manage">
              <button
                type="button"
                className={PILL_PRIMARY_CLASS}
                onClick={() => router.push(ROUTES.reportsCustomNew)}
              >
                <Plus className="size-4" />
                إنشاء تقرير مخصص
              </button>
            </Can>
          }
        />
      )}
    </div>
  )
}
