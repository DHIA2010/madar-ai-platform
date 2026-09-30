"use client"

import { Ban, Clock3, MoreHorizontal, Timer, UserCheck, Users } from "lucide-react"

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
import { getCustomersListKpis, PLAN_META } from "../services"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { PlatformChip } from "./platform-chip"
import { SubscriptionStatusBadge } from "./subscription-status-badge"

const SELECT_TRIGGER_CLASSNAME = "h-10 w-[150px] rounded-[10px] text-sm"

function formatCurrency(value: number) {
  return `SAR ${new Intl.NumberFormat("en-US").format(value)}`
}

export function MadarAdminCustomers() {
  const list = useMadarAdminCustomerList()
  const kpisRaw = getCustomersListKpis()

  const kpis: MadarAdminKpi[] = [
    {
      label: "العملاء المنتهية اشتراكاتهم",
      value: String(kpisRaw.endingSoon.value),
      deltaPct: kpisRaw.endingSoon.deltaPct,
      icon: Ban,
      tone: "rose",
    },
    {
      label: "متأخرون في الدفع",
      value: String(kpisRaw.overdue.value),
      deltaPct: kpisRaw.overdue.deltaPct,
      icon: Clock3,
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
      label: "العملاء النشطين",
      value: String(kpisRaw.active.value),
      deltaPct: kpisRaw.active.deltaPct,
      icon: UserCheck,
      tone: "green",
    },
    {
      label: "إجمالي العملاء",
      value: String(kpisRaw.total.value),
      deltaPct: kpisRaw.total.deltaPct,
      icon: Users,
      tone: "blue",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">العملاء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة جميع العملاء المشتركين في مدار.
          </p>
        </div>
        <AppButton className="h-11 rounded-[10px] px-6 font-semibold">إضافة عميل جديد</AppButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث عن عميل، متجر، أو بريد إلكتروني..."
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />

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
              <AppTableHead>الإيراد الشهري</AppTableHead>
              <AppTableHead>آخر نشاط</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((customer) => (
              <AppTableRow key={customer.id}>
                <AppTableCell>
                  <p className="font-medium text-foreground">{customer.storeName}</p>
                  <p className="text-xs text-muted-foreground">{customer.name}</p>
                </AppTableCell>
                <AppTableCell>
                  <PlatformChip platform={customer.platform} />
                </AppTableCell>
                <AppTableCell>{PLAN_META[customer.plan].name}</AppTableCell>
                <AppTableCell>
                  <SubscriptionStatusBadge status={customer.status} />
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {customer.subscriptionDate}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {customer.renewalDate}
                </AppTableCell>
                <AppTableCell className="font-medium text-foreground">
                  {formatCurrency(customer.monthlyRevenue)}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {customer.lastActivity}
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
                      <AppDropdownMenuItem>تعديل الباقة</AppDropdownMenuItem>
                      <AppDropdownMenuItem className="text-destructive focus:text-destructive">
                        إيقاف الحساب
                      </AppDropdownMenuItem>
                    </AppDropdownMenuContent>
                  </AppDropdownMenu>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {list.rows.length === 0 ? (
          <AppTableEmpty title="لا يوجد عملاء مطابقين" description="جرّب تعديل الفلاتر أو البحث." />
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
