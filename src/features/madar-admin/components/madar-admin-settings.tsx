"use client"

import { useState } from "react"
import { toast } from "sonner"

import { AppButton, AppCard, AppInput, AppSwitch, AppTextarea } from "@/components/app"

// Platform-wide settings, local-only for this UI-only pass -- same discipline as the rest of
// src/features/madar-admin (no persistence yet, a real settings endpoint replaces this later).
export function MadarAdminSettings() {
  const [platformName, setPlatformName] = useState("مدار")
  const [supportEmail, setSupportEmail] = useState("support@madar.my")
  const [announcementBanner, setAnnouncementBanner] = useState("")
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [newSignupsEnabled, setNewSignupsEnabled] = useState(true)
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true)
  const [fraudAlertsEnabled, setFraudAlertsEnabled] = useState(true)

  function handleSave() {
    toast.success("تم حفظ إعدادات المنصة.")
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">إعدادات المنصة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إعدادات عامة تؤثر على منصة مدار بالكامل لجميع العملاء.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppCard title="الإعدادات العامة" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">اسم المنصة</label>
              <AppInput
                value={platformName}
                onChange={(event) => setPlatformName(event.target.value)}
                className="h-11 rounded-[10px]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                البريد الإلكتروني للدعم الفني
              </label>
              <AppInput
                type="email"
                value={supportEmail}
                onChange={(event) => setSupportEmail(event.target.value)}
                className="h-11 rounded-[10px]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                شريط إعلان (اختياري)
              </label>
              <AppTextarea
                value={announcementBanner}
                onChange={(event) => setAnnouncementBanner(event.target.value)}
                placeholder="يظهر في أعلى لوحة تحكم جميع العملاء..."
                rows={3}
                className="rounded-[10px]"
              />
            </div>
          </div>
        </AppCard>

        <AppCard title="التشغيل والوصول" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <div>
                <p className="text-sm text-foreground">وضع الصيانة</p>
                <p className="text-xs text-muted-foreground">
                  يمنع تسجيل الدخول لجميع العملاء مؤقتاً
                </p>
              </div>
              <AppSwitch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <div>
                <p className="text-sm text-foreground">السماح بتسجيل عملاء جدد</p>
                <p className="text-xs text-muted-foreground">إيقافها يغلق التسجيل الجديد فقط</p>
              </div>
              <AppSwitch checked={newSignupsEnabled} onCheckedChange={setNewSignupsEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <p className="text-sm text-foreground">تقرير أسبوعي عبر البريد</p>
              <AppSwitch checked={weeklyDigestEnabled} onCheckedChange={setWeeklyDigestEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <p className="text-sm text-foreground">تنبيهات النشاط المشبوه</p>
              <AppSwitch checked={fraudAlertsEnabled} onCheckedChange={setFraudAlertsEnabled} />
            </div>
          </div>
        </AppCard>
      </div>

      <div className="flex justify-end">
        <AppButton className="h-11 rounded-[10px] px-8 font-semibold" onClick={handleSave}>
          حفظ الإعدادات
        </AppButton>
      </div>
    </div>
  )
}
