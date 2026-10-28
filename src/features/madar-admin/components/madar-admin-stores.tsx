"use client"

import { useCallback } from "react"
import { AlertTriangle, PlugZap, ShoppingBag, Store } from "lucide-react"
import { toast } from "sonner"

import {
  AppCard,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppStatusBadge,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTablePagination,
  AppTableRow,
} from "@/components/app"

import { useAdminPagedList } from "../hooks"
import {
  CONNECTION_STATUS_LABEL,
  formatRelative,
  platformAdminService,
  STORE_PLATFORM_KEY,
  SYNC_STATUS_LABEL,
} from "../services"
import type { AdminStoreFilters } from "../types/platform-admin.types"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { PlatformChip } from "./platform-chip"

const SELECT_TRIGGER_CLASSNAME = "h-10 w-[150px] rounded-[10px] text-sm"
const INITIAL_FILTERS: AdminStoreFilters = { search: "", platform: "all", status: "all" }

function StatusPill({ meta }: { meta?: { label: string; className: string } }) {
  if (!meta) return <span className="text-muted-foreground">—</span>
  return <AppStatusBadge status="neutral" label={meta.label} className={meta.className} />
}

// Every storefront Madar's customers have connected (Salla, Zid, Shopify), with its connection
// state and last sync -- the place to spot a store that has stopped syncing.
export function MadarAdminStores() {
  const onError = useCallback((message: string) => toast.error(message), [])
  const list = useAdminPagedList({
    initialFilters: INITIAL_FILTERS,
    fetchPage: platformAdminService.listStores,
    fetchSummary: platformAdminService.getStoreSummary,
    onError,
  })

  const summary = list.summary
  const kpis: MadarAdminKpi[] = [
    {
      label: "إجمالي المتاجر",
      value: String(summary?.total ?? "—"),
      deltaPct: null,
      icon: Store,
      tone: "blue",
    },
    {
      label: "متاجر متصلة",
      value: String(summary?.connected ?? "—"),
      deltaPct: null,
      icon: PlugZap,
      tone: "green",
    },
    {
      label: "أخطاء المزامنة",
      value: String(summary?.syncErrors ?? "—"),
      deltaPct: null,
      icon: AlertTriangle,
      tone: "rose",
    },
    {
      label: "سلة · زد · Shopify",
      value: summary
        ? `${summary.byPlatform.salla} · ${summary.byPlatform.zid} · ${summary.byPlatform.shopify}`
        : "—",
      deltaPct: null,
      icon: ShoppingBag,
      tone: "violet",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">المتاجر</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          جميع المتاجر المربوطة لدى عملاء مدار وحالة مزامنتها.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث باسم المتجر أو العميل..."
          value={list.filters.search ?? ""}
          onChange={(event) => list.setFilter("search", event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />
        <AppSelect
          value={list.filters.platform ?? "all"}
          onValueChange={(value) =>
            list.setFilter("platform", value as AdminStoreFilters["platform"])
          }
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع المنصات</AppSelectItem>
            <AppSelectItem value="salla">سلة</AppSelectItem>
            <AppSelectItem value="zid">زد</AppSelectItem>
            <AppSelectItem value="shopify">Shopify</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          value={list.filters.status ?? "all"}
          onValueChange={(value) => list.setFilter("status", value)}
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الحالات</AppSelectItem>
            {Object.entries(CONNECTION_STATUS_LABEL).map(([key, meta]) => (
              <AppSelectItem key={key} value={key}>
                {meta.label}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </AppSelect>
      </div>

      <AppCard
        state={list.loading ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>المتجر</AppTableHead>
              <AppTableHead>المنصة</AppTableHead>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>الاتصال</AppTableHead>
              <AppTableHead>آخر مزامنة</AppTableHead>
              <AppTableHead>نتيجة المزامنة</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((store) => (
              <AppTableRow key={`${store.platform}:${store.id}`}>
                <AppTableCell>
                  <p className="font-medium text-foreground">{store.accountName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    #{store.accountId}
                    {store.isSelected ? "" : " · غير مختار"}
                  </p>
                </AppTableCell>
                <AppTableCell>
                  <PlatformChip platform={STORE_PLATFORM_KEY[store.platform]} />
                </AppTableCell>
                <AppTableCell className="text-foreground">{store.organizationName}</AppTableCell>
                <AppTableCell>
                  <StatusPill meta={CONNECTION_STATUS_LABEL[store.connectionStatus]} />
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatRelative(store.lastSyncAt)}
                </AppTableCell>
                <AppTableCell className="max-w-[280px]">
                  <StatusPill
                    meta={
                      store.lastSyncStatus ? SYNC_STATUS_LABEL[store.lastSyncStatus] : undefined
                    }
                  />
                  {store.lastSyncError ? (
                    <p className="mt-1 truncate text-xs text-rose-600" title={store.lastSyncError}>
                      {store.lastSyncError}
                    </p>
                  ) : null}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {!list.loading && list.rows.length === 0 ? (
          <AppTableEmpty title="لا توجد متاجر مطابقة" description="جرّب تعديل الفلاتر أو البحث." />
        ) : null}

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            عرض {list.rows.length} من {list.total} نتيجة
          </p>
          <AppTablePagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            previousLabel="السابق"
            nextLabel="التالي"
          />
        </div>
      </AppCard>
    </div>
  )
}
