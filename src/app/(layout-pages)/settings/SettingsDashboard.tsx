"use client"

import {
  Bell,
  Building2,
  Calendar as CalendarIcon,
  Camera,
  ChevronLeft,
  Clock,
  Crown,
  FileText,
  Globe2,
  Headphones,
  Lock,
  Monitor,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { AppButton, AppCard } from "@/components/app"

// --- Mock data (first-pass theme build; will be wired to real account data next) ---

interface SettingsRow {
  title: string
  subtitle: string
  icon: LucideIcon
  tone: string
  danger?: boolean
}

const settingsRows: SettingsRow[] = [
  {
    title: "تغيير كلمة المرور",
    subtitle: "تحديث كلمة المرور الخاصة بحسابك",
    icon: Lock,
    tone: "bg-indigo-50 text-indigo-600",
  },
  {
    title: "تفضيلات الإشعارات",
    subtitle: "إدارة الإشعارات البريدية والتنبيهات داخل المنصة",
    icon: Bell,
    tone: "bg-blue-50 text-blue-600",
  },
  {
    title: "اللغة والمنطقة",
    subtitle: "تغيير اللغة، المنطقة، والعملة",
    icon: Globe2,
    tone: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "الجلسات النشطة",
    subtitle: "عرض وإدارة الأجهزة والجلسات النشطة",
    icon: Monitor,
    tone: "bg-violet-50 text-violet-600",
  },
  {
    title: "حذف الحساب",
    subtitle: "حذف حسابك وجميع بياناتك بشكل نهائي",
    icon: Trash2,
    tone: "bg-rose-50 text-rose-600",
    danger: true,
  },
]

export default function SettingsDashboard() {
  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">إدارة حسابك وتفضيلاتك والفوترة والدعم</p>
      </div>

      <AppCard
        title="معلومات الحساب"
        subtitle="عرض وتحديث معلومات حسابك الشخصية"
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative shrink-0">
              <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xl font-bold text-white">
                م
              </div>
              <button
                type="button"
                aria-label="تغيير الصورة"
                className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full border-2 border-card bg-emerald-500 text-white transition-colors hover:bg-emerald-600"
              >
                <Camera className="size-3" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-muted-foreground">الاسم</p>
                <p className="text-sm font-semibold text-foreground">محمد أحمد</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">البريد الإلكتروني</p>
                <p className="text-sm font-semibold text-foreground">admin@madar.ai</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الدور</p>
                <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  <Building2 className="size-3.5" />
                  مدير الحساب
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">تاريخ الانضمام</p>
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarIcon className="size-3.5 text-muted-foreground" />
                  15 مارس 2024
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">آخر تسجيل دخول</p>
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Clock className="size-3.5 text-muted-foreground" />
                  منذ 5 دقائق
                </p>
              </div>
            </div>
          </div>

          <AppButton variant="outline" icon={<Pencil className="size-4" />}>
            تعديل الملف الشخصي
          </AppButton>
        </div>
      </AppCard>

      <AppCard
        title="إعدادات الحساب"
        subtitle="إدارة تفضيلات حسابك وإعدادات الأمان"
        className="rounded-2xl border-border/60 shadow-sm"
        contentClassName="p-0"
      >
        <div className="divide-y divide-border/60">
          {settingsRows.map((row) => {
            const Icon = row.icon
            return (
              <button
                key={row.title}
                type="button"
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-start transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      row.tone
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <div>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        row.danger ? "text-rose-600" : "text-foreground"
                      )}
                    >
                      {row.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.subtitle}</p>
                  </div>
                </div>
                <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </div>
      </AppCard>

      <div>
        <h2 className="text-lg font-bold text-foreground">الفوترة والدعم</h2>
        <p className="text-sm text-muted-foreground">
          إدارة اشتراكك والفواتير والحصول على المساعدة
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AppCard className="rounded-2xl border-border/60 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Headphones className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">مركز الدعم</p>
              <p className="text-xs text-muted-foreground">تواصل مع فريق الدعم</p>
            </div>
            <AppButton variant="outline" size="sm" fullWidth>
              تواصل مع الدعم
            </AppButton>
          </div>
        </AppCard>

        <AppCard className="rounded-2xl border-border/60 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <FileText className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">الفواتير والسجلات</p>
              <p className="text-xs text-muted-foreground">عرض الفواتير والسجلات المالية</p>
            </div>
            <AppButton variant="outline" size="sm" fullWidth>
              عرض الفواتير
            </AppButton>
          </div>
        </AppCard>

        <AppCard className="rounded-2xl border-border/60 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <Crown className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">الخطة الحالية</p>
              <p className="text-sm font-bold text-foreground">الباقة الاحترافية</p>
              <p className="text-xs text-muted-foreground">تجديد في 15 يونيو 2025</p>
            </div>
            <AppButton
              size="sm"
              fullWidth
              className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
            >
              إدارة الاشتراك
            </AppButton>
          </div>
        </AppCard>
      </div>
    </div>
  )
}
