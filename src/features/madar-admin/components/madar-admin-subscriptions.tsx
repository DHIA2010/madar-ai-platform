"use client"

import { CreditCard, MoreHorizontal, PauseCircle, Timer, Users, XCircle } from "lucide-react"

import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTablePagination,
  AppTableRow,
} from "@/components/app"

import { useMadarAdminCustomerList } from "../hooks"
import { getSubscriptionsListKpis, PLAN_META } from "../services"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { PlatformChip } from "./platform-chip"
import { SubscriptionStatusBadge } from "./subscription-status-badge"

const SELECT_TRIGGER_CLASSNAME = "h-10 w-[150px] rounded-[10px] text-sm"

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  mada: "مدى",
}

function formatCurrency(value: number) {
  return `SAR ${new Intl.NumberFormat("en-US").format(value)}`
}

export function MadarAdminSubscriptions() {
  const list = useMadarAdminCustomerList()
  const kpisRaw = getSubscriptionsListKpis()

  const kpis: MadarAdminKpi[] = [
    {
      label: "الاشتراكات الملغاة",
      value: String(kpisRaw.cancelled.value),
      deltaPct: kpisRaw.cancelled.deltaPct,
      icon: XCircle,
      tone: "rose",
    },
    {
      label: "الاشتراكات المتوقفة",
      value: String(kpisRaw.paused.value),
      deltaPct: kpisRaw.paused.deltaPct,
      icon: PauseCircle,
      tone: "orange",
    },
    {
      label: "في التجربة المجانية",
      value: String(kpisRaw.trial.value),
      deltaPct: kpisRaw.trial.deltaPct,
      icon: Timer,
      tone: "violet",
    },
    {
      label: "الاشتراكات النشطة",
      value: String(kpisRaw.active.value),
      deltaPct: kpisRaw.active.deltaPct,
      icon: Users,
      tone: "green",
    },
    {
      label: "إجمالي الاشتراكات",
      value: String(kpisRaw.total.value),
      deltaPct: kpisRaw.total.deltaPct,
      icon: CreditCard,
      tone: "blue",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الاشتراكات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة ومتابعة جميع اشتراكات عملاء مدار.
          </p>
        </div>
        <AppButton className="h-11 rounded-[10px] px-6 font-semibold">إضافة اشتراك</AppButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث عن عميل، متجر، أو معرّف اشتراك..."
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />

        <AppSelect
          value={list.plan}
          onValueChange={(value) => list.setPlan(value as typeof list.plan)}
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="الباقة" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الباقات</AppSelectItem>
            <AppSelectItem value="starter">Starter</AppSelectItem>
            <AppSelectItem value="growth">Growth</AppSelectItem>
            <AppSelectItem value="pro">Pro</AppSelectItem>
            <AppSelectItem value="enterprise">Enterprise</AppSelectItem>
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={list.platform}
          onValueChange={(value) => list.setPlatform(value as typeof list.platform)}
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="المنصة" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع المنصات</AppSelectItem>
            <AppSelectItem value="Salla">سلة</AppSelectItem>
            <AppSelectItem value="Shopify">Shopify</AppSelectItem>
            <AppSelectItem value="Zid">زد</AppSelectItem>
            <AppSelectItem value="WooCommerce">WooCommerce</AppSelectItem>
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={list.status}
          onValueChange={(value) => list.setStatus(value as typeof list.status)}
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="الحالة" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الحالات</AppSelectItem>
            <AppSelectItem value="active">نشط</AppSelectItem>
            <AppSelectItem value="trial">تجربة مجانية</AppSelectItem>
            <AppSelectItem value="overdue">متأخر في الدفع</AppSelectItem>
            <AppSelectItem value="cancelled">ملغي</AppSelectItem>
            <AppSelectItem value="expired">منتهي</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>المنصة</AppTableHead>
              <AppTableHead>الباقة</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>تاريخ الاشتراك</AppTableHead>
              <AppTableHead>تاريخ التجديد</AppTableHead>
              <AppTableHead>القيمة الشهرية</AppTableHead>
              <AppTableHead>طريقة الدفع</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>
                  <p className="font-medium text-foreground">{row.storeName}</p>
                  <p className="text-xs text-muted-foreground">{row.name}</p>
                </AppTableCell>
                <AppTableCell>
                  <PlatformChip platform={row.platform} />
                </AppTableCell>
                <AppTableCell>{PLAN_META[row.plan].name}</AppTableCell>
                <AppTableCell>
                  <SubscriptionStatusBadge status={row.status} />
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {row.subscriptionDate}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">{row.renewalDate}</AppTableCell>
                <AppTableCell className="font-medium text-foreground">
                  {formatCurrency(row.monthlyRevenue)}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {PAYMENT_METHOD_LABEL[row.paymentMethod]}
                </AppTableCell>
                <AppTableCell>
                  <AppDropdownMenu>
                    <AppDropdownMenuTrigger asChild>
                      <AppButton variant="ghost" size="icon-sm" aria-label="إجراءات">
                        <MoreHorizontal className="size-4" />
                      </AppButton>
                    </AppDropdownMenuTrigger>
                    <AppDropdownMenuContent align="end">
                      <AppDropdownMenuItem>عرض التفاصيل</AppDropdownMenuItem>
                      <AppDropdownMenuItem>تجديد يدوي</AppDropdownMenuItem>
                      <AppDropdownMenuItem className="text-destructive focus:text-destructive">
                        إلغاء الاشتراك
                      </AppDropdownMenuItem>
                    </AppDropdownMenuContent>
                  </AppDropdownMenu>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {list.rows.length === 0 ? (
          <AppTableEmpty
            title="لا توجد اشتراكات مطابقة"
            description="جرّب تعديل الفلاتر أو البحث."
          />
        ) : null}

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            عرض {list.rows.length} من {list.totalCount} نتيجة
          </p>
          <AppTablePagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            previousLabel="السابق"
            nextLabel="التالي"
          />
        </div>
      </div>
    </div>
  )
}
