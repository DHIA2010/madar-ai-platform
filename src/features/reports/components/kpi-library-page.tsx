"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Edit, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppConfirmDialog,
  AppContainer,
  AppEmpty,
  AppLoading,
  AppPage,
  AppPageHeader,
  AppStatusBadge,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { Can } from "@/features/authentication"

import { type Kpi, kpiService } from "../services"

import type { Locale } from "@/i18n/locales"

const DISPLAY_TYPE_KEYS = ["number", "line", "bar", "pie", "table", "gauge"] as const
const CATEGORY_KEYS = [
  "sales",
  "products",
  "inventory",
  "customers",
  "financial",
  "marketing",
] as const

type KpiTranslator = ReturnType<typeof useTranslations<"reports.kpi">>

function displayTypeLabel(displayType: string, t: KpiTranslator): string {
  if ((DISPLAY_TYPE_KEYS as readonly string[]).includes(displayType)) {
    return t(`displayTypes.${displayType}` as "displayTypes.number")
  }
  return displayType
}

function categoryLabel(category: string, t: KpiTranslator): string {
  if ((CATEGORY_KEYS as readonly string[]).includes(category)) {
    return t(`categories.${category}` as "categories.sales")
  }
  return category
}

// ar-SA/en-US format both digits and dates against locale defaults (Eastern Arabic-Indic
// numerals, the Hijri calendar) in some ICU builds -- these Unicode extensions force Western
// digits and the Gregorian calendar so this matches the plain Gregorian timestamps the backend
// returns.
function formatDate(iso: string, locale: Locale) {
  const intlLocale = locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US-u-ca-gregory"
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(new Date(iso))
}

export function KpiLibraryPage() {
  const t = useTranslations("reports.kpiLibrary")
  const tKpi = useTranslations("reports.kpi")
  const tCommon = useTranslations("reports.common")
  const locale = useLocale() as Locale
  const router = useRouter()
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    kpiService
      .list()
      .then(setKpis)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    kpiService
      .list()
      .then(setKpis)
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await kpiService.remove(pendingDeleteId)
      toast.success(t("toasts.deleted"))
      setPendingDeleteId(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.deleteFailed"))
    }
  }

  return (
    <AppPage>
      <AppContainer className="space-y-6">
        <AppPageHeader
          breadcrumbItems={[
            { label: tCommon("breadcrumbReports"), href: ROUTES.reports },
            { label: t("breadcrumbCurrent"), current: true },
          ]}
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            <Can permission="reports:manage">
              <AppButton
                icon={
                  <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                    <Plus className="size-3.5" strokeWidth={2.5} />
                  </span>
                }
                onClick={() => router.push(ROUTES.reportsKpisNew)}
                className="h-11 gap-2 rounded-full bg-[#2878ff] px-5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
              >
                {t("createKpi")}
              </AppButton>
            </Can>
          }
        />

        <AppCard title={t("cardTitle")} subtitle={t("cardSubtitle")}>
          {loading ? (
            <AppLoading variant="table" rows={5} />
          ) : kpis.length === 0 ? (
            <AppEmpty title={t("emptyTitle")} description={t("emptyDescription")} />
          ) : (
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>{t("table.name")}</AppTableHead>
                  <AppTableHead>{t("table.category")}</AppTableHead>
                  <AppTableHead>{t("table.displayType")}</AppTableHead>
                  <AppTableHead>{t("table.status")}</AppTableHead>
                  <AppTableHead>{t("table.lastUpdated")}</AppTableHead>
                  <AppTableHead>{t("table.actions")}</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {kpis.map((kpi) => (
                  <AppTableRow key={kpi.id}>
                    <AppTableCell className="font-medium">{kpi.name}</AppTableCell>
                    <AppTableCell>{categoryLabel(kpi.category, tKpi)}</AppTableCell>
                    <AppTableCell>{displayTypeLabel(kpi.displayType, tKpi)}</AppTableCell>
                    <AppTableCell>
                      <AppStatusBadge
                        status={kpi.status === "active" ? "success" : "neutral"}
                        label={kpi.status === "active" ? t("status.active") : t("status.draft")}
                      />
                    </AppTableCell>
                    <AppTableCell>{formatDate(kpi.updatedAt, locale)}</AppTableCell>
                    <AppTableCell>
                      <div className="flex items-center gap-1">
                        <AppButton
                          variant="ghost"
                          size="sm"
                          icon={<Edit className="size-4" />}
                          disabled={kpi.isSystem}
                          onClick={() => router.push(ROUTES.reportsKpisEdit(kpi.id))}
                        >
                          {t("edit")}
                        </AppButton>
                        <Can permission="reports:manage">
                          <AppButton
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 className="size-4" />}
                            disabled={kpi.isSystem}
                            onClick={() => setPendingDeleteId(kpi.id)}
                          >
                            {t("delete")}
                          </AppButton>
                        </Can>
                      </div>
                    </AppTableCell>
                  </AppTableRow>
                ))}
              </AppTableBody>
            </AppTable>
          )}
        </AppCard>
      </AppContainer>

      <AppConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description")}
        confirmLabel={t("deleteDialog.confirm")}
        cancelLabel={t("deleteDialog.cancel")}
        confirmTone="destructive"
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </AppPage>
  )
}
