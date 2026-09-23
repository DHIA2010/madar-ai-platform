"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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

const DISPLAY_TYPE_LABELS: Record<string, string> = {
  number: "بطاقة رقمية",
  line: "خطي",
  bar: "أعمدة",
  pie: "دائري",
  table: "جدول",
  gauge: "مقياس",
}

const CATEGORY_LABELS: Record<string, string> = {
  sales: "المبيعات",
  products: "المنتجات",
  inventory: "المخزون",
  customers: "العملاء",
  financial: "المالية",
  marketing: "التسويق",
}

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(iso))
}

export function KpiLibraryPage() {
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
      toast.success("تم حذف المؤشر بنجاح.")
      setPendingDeleteId(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حذف المؤشر.")
    }
  }

  return (
    <AppPage>
      <AppContainer className="space-y-6">
        <AppPageHeader
          breadcrumbItems={[
            { label: "التقارير", href: ROUTES.reports },
            { label: "المؤشرات المحفوظة", current: true },
          ]}
          title="المؤشرات المحفوظة"
          subtitle="جميع المؤشرات التي تم إنشاؤها، جاهزة لإضافتها إلى أي تقرير مخصص"
          actions={
            <Can permission="reports:manage">
              <AppButton
                icon={<Plus className="size-4" />}
                onClick={() => router.push(ROUTES.reportsKpisNew)}
              >
                إنشاء مؤشر جديد
              </AppButton>
            </Can>
          }
        />

        <AppCard title="المؤشرات" subtitle="عدد المؤشرات المحفوظة">
          {loading ? (
            <AppLoading variant="table" rows={5} />
          ) : kpis.length === 0 ? (
            <AppEmpty
              title="لا توجد مؤشرات بعد"
              description="أنشئ أول مؤشر لاستخدامه في تقاريرك المخصصة."
            />
          ) : (
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>اسم المؤشر</AppTableHead>
                  <AppTableHead>الفئة</AppTableHead>
                  <AppTableHead>طريقة العرض</AppTableHead>
                  <AppTableHead>الحالة</AppTableHead>
                  <AppTableHead>آخر تحديث</AppTableHead>
                  <AppTableHead>الإجراءات</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {kpis.map((kpi) => (
                  <AppTableRow key={kpi.id}>
                    <AppTableCell className="font-medium">{kpi.name}</AppTableCell>
                    <AppTableCell>{categoryLabel(kpi.category)}</AppTableCell>
                    <AppTableCell>
                      {DISPLAY_TYPE_LABELS[kpi.displayType] ?? kpi.displayType}
                    </AppTableCell>
                    <AppTableCell>
                      <AppStatusBadge
                        status={kpi.status === "active" ? "success" : "neutral"}
                        label={kpi.status === "active" ? "نشط" : "مسودة"}
                      />
                    </AppTableCell>
                    <AppTableCell>{formatDate(kpi.updatedAt)}</AppTableCell>
                    <AppTableCell>
                      <div className="flex items-center gap-1">
                        <AppButton
                          variant="ghost"
                          size="sm"
                          icon={<Edit className="size-4" />}
                          disabled={kpi.isSystem}
                          onClick={() => router.push(ROUTES.reportsKpisEdit(kpi.id))}
                        >
                          تعديل
                        </AppButton>
                        <Can permission="reports:manage">
                          <AppButton
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 className="size-4" />}
                            disabled={kpi.isSystem}
                            onClick={() => setPendingDeleteId(kpi.id)}
                          >
                            حذف
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
        title="حذف المؤشر"
        description="سيتم حذف هذا المؤشر نهائياً. لن يعود بإمكانك استخدامه في أي تقرير مخصص."
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        confirmTone="destructive"
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </AppPage>
  )
}
