"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Edit } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppContainer,
  AppEmpty,
  AppLoading,
  AppPage,
  AppPageHeader,
} from "@/components/app"

import { Can } from "@/features/authentication"

import { type CustomReportData, type Kpi, reportService } from "../services"
import { kpiService } from "../services"
import { KpiWidgetRenderer } from "./kpi-widget-renderer"

export function ReportViewerPage({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [data, setData] = useState<CustomReportData | null>(null)
  const [kpiById, setKpiById] = useState<Map<string, Kpi>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([reportService.getData(reportId), kpiService.list()])
      .then(([reportData, kpis]) => {
        setData(reportData)
        setKpiById(new Map(kpis.map((kpi) => [kpi.id, kpi])))
      })
      .finally(() => setLoading(false))
  }, [reportId])

  if (loading) {
    return (
      <AppPage>
        <AppContainer>
          <AppLoading variant="page" />
        </AppContainer>
      </AppPage>
    )
  }

  if (!data) {
    return (
      <AppPage>
        <AppContainer>
          <AppEmpty title="تعذر تحميل التقرير" />
        </AppContainer>
      </AppPage>
    )
  }

  const { report, results } = data

  return (
    <AppPage>
      <AppContainer className="space-y-6">
        <AppPageHeader
          breadcrumbItems={[
            { label: "التقارير", href: ROUTES.reports },
            { label: report.name, current: true },
          ]}
          title={report.name}
          subtitle={report.description}
          actions={
            !report.isSystem ? (
              <Can permission="reports:manage">
                <AppButton
                  variant="outline"
                  icon={<Edit className="size-4" />}
                  onClick={() => router.push(ROUTES.reportsCustomEdit(report.id))}
                >
                  تعديل
                </AppButton>
              </Can>
            ) : undefined
          }
        />

        {report.widgets.length === 0 ? (
          <AppEmpty title="لا توجد مؤشرات في هذا التقرير" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[...report.widgets]
              .sort((a, b) => a.order - b.order)
              .map((widget) => {
                const kpi = kpiById.get(widget.kpiId)
                const result = results[widget.kpiId]
                return (
                  <AppCard key={widget.id} className="p-0">
                    {!kpi ? (
                      <p className="p-4 text-sm text-muted-foreground">مؤشر غير معروف</p>
                    ) : !result ? (
                      <AppLoading variant="chart" />
                    ) : (
                      <KpiWidgetRenderer
                        name={kpi.name}
                        displayType={kpi.displayType}
                        result={result}
                      />
                    )}
                  </AppCard>
                )
              })}
          </div>
        )}
      </AppContainer>
    </AppPage>
  )
}
