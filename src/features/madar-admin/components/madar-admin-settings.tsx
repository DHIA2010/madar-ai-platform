"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AppButton, AppCard, AppInput, AppSwitch, AppTextarea } from "@/components/app"

import { platformAdminService } from "../services"
import type { AdminPlatformSettings } from "../types/platform-admin.types"
import { MadarAdminWhatsAppSettings } from "./madar-admin-whatsapp-settings"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

// Where Cal.com sends bookings: this backend's public webhook route.
const CALCOM_WEBHOOK_URL = new URL(
  ["", "v1", "public", "webhooks", "calcom"].join(String.fromCharCode(47)),
  getClientEnvironment().API_BASE_URL
).toString()

type GeneralSettings = Pick<
  AdminPlatformSettings,
  | "platformName"
  | "supportEmail"
  | "announcementBanner"
  | "maintenanceMode"
  | "newSignupsEnabled"
  | "legalName"
  | "vatNumber"
  | "commercialRegistration"
  | "address"
  | "calcomWebhookSecret"
  | "quoteTerms"
  | "invoiceTerms"
>

// Platform-wide settings, saved to the backend and applied immediately: the announcement banner
// shows on every customer's dashboard, maintenance mode keeps everyone but Madar staff out, and
// turning sign-ups off closes registration. Trial length and renewal policy live on the packages
// page, next to the prices they go with.
export function MadarAdminSettings() {
  const [settings, setSettings] = useState<GeneralSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    platformAdminService
      .getSettings()
      .then((loaded) =>
        setSettings({
          platformName: loaded.platformName,
          supportEmail: loaded.supportEmail,
          announcementBanner: loaded.announcementBanner,
          maintenanceMode: loaded.maintenanceMode,
          newSignupsEnabled: loaded.newSignupsEnabled,
          legalName: loaded.legalName ?? "",
          vatNumber: loaded.vatNumber ?? "",
          commercialRegistration: loaded.commercialRegistration ?? "",
          address: loaded.address ?? "",
          calcomWebhookSecret: loaded.calcomWebhookSecret ?? "",
          quoteTerms: loaded.quoteTerms ?? "",
          invoiceTerms: loaded.invoiceTerms ?? "",
        })
      )
      .catch(() => toast.error("تعذر تحميل إعدادات المنصة."))
  }, [])

  function update<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current))
  }

  async function handleSave() {
    if (!settings) return
    if (!settings.platformName.trim() || !settings.supportEmail.includes("@")) {
      toast.error("يرجى إدخال اسم المنصة وبريد دعم صحيح.")
      return
    }
    setSaving(true)
    try {
      await platformAdminService.updateSettings(settings)
      toast.success("تم حفظ إعدادات المنصة.")
    } catch {
      toast.error("تعذر حفظ إعدادات المنصة.")
    } finally {
      setSaving(false)
    }
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
        <AppCard
          title="الإعدادات العامة"
          state={settings === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">اسم المنصة</label>
              <AppInput
                value={settings?.platformName ?? ""}
                onChange={(event) => update("platformName", event.target.value)}
                className="h-11 rounded-[10px]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                البريد الإلكتروني للدعم الفني
              </label>
              <AppInput
                type="email"
                dir="ltr"
                value={settings?.supportEmail ?? ""}
                onChange={(event) => update("supportEmail", event.target.value)}
                className="h-11 rounded-[10px] text-right"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                يظهر للعملاء عند الاشتراك في تطبيق بخيار &quot;تواصل معنا&quot;.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                شريط إعلان (اختياري)
              </label>
              <AppTextarea
                value={settings?.announcementBanner ?? ""}
                onChange={(event) => update("announcementBanner", event.target.value)}
                placeholder="يظهر في أعلى لوحة تحكم جميع العملاء..."
                rows={3}
                maxLength={300}
                className="rounded-[10px]"
              />
              <p className="mt-1 text-xs text-muted-foreground">اتركه فارغاً لإخفاء الشريط.</p>
            </div>
          </div>
        </AppCard>

        <AppCard
          title="التشغيل والوصول"
          state={settings === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <div>
                <p className="text-sm text-foreground">وضع الصيانة</p>
                <p className="text-xs text-muted-foreground">
                  يمنع دخول جميع العملاء مؤقتاً (فريق مدار مستثنى)
                </p>
              </div>
              <AppSwitch
                checked={settings?.maintenanceMode ?? false}
                onCheckedChange={(checked) => update("maintenanceMode", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-muted/40 px-3.5 py-3">
              <div>
                <p className="text-sm text-foreground">السماح بتسجيل عملاء جدد</p>
                <p className="text-xs text-muted-foreground">
                  إيقافها يغلق التسجيل الجديد فقط (الدعوات للفرق تبقى متاحة)
                </p>
              </div>
              <AppSwitch
                checked={settings?.newSignupsEnabled ?? true}
                onCheckedChange={(checked) => update("newSignupsEnabled", checked)}
              />
            </div>
            {settings?.maintenanceMode ? (
              <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
                عند الحفظ سيتم إخراج جميع العملاء من حساباتهم حتى إيقاف وضع الصيانة.
              </p>
            ) : null}
          </div>
        </AppCard>
      </div>

      <AppCard
        title="بيانات الفوترة"
        state={settings === null ? "loading" : "idle"}
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <p className="-mt-1 mb-4 text-sm text-muted-foreground">
          تظهر على عروض الأسعار والفواتير التي يرسلها فريق المبيعات.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["legalName", "الاسم القانوني للمنشأة", "rtl"],
              ["vatNumber", "الرقم الضريبي", "ltr"],
              ["commercialRegistration", "رقم السجل التجاري", "ltr"],
              ["address", "العنوان", "rtl"],
            ] as const
          ).map(([key, label, direction]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
              <AppInput
                value={settings?.[key] ?? ""}
                dir={direction}
                onChange={(event) => update(key, event.target.value)}
              />
            </div>
          ))}
        </div>
      </AppCard>

      <AppCard
        title="الشروط والأحكام"
        state={settings === null ? "loading" : "idle"}
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <p className="-mt-1 mb-4 text-sm text-muted-foreground">
          تُطبع أسفل كل عرض سعر وفاتورة. يمكن تعديلها لمستند واحد من صفحته دون تغيير البقية.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              [
                "quoteTerms",
                "شروط عروض الأسعار",
                "مثال: العرض صالح لمدة 14 يومًا من تاريخ الإصدار.",
              ],
              [
                "invoiceTerms",
                "شروط الفواتير",
                "مثال: يُستحق الدفع خلال 7 أيام من تاريخ الفاتورة.",
              ],
            ] as const
          ).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
              <AppTextarea
                rows={8}
                value={settings?.[key] ?? ""}
                placeholder={placeholder}
                onChange={(event) => update(key, event.target.value)}
                className="text-sm leading-6"
              />
            </div>
          ))}
        </div>
      </AppCard>

      <AppCard
        title="ربط Cal.com"
        state={settings === null ? "loading" : "idle"}
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <p className="-mt-1 mb-4 text-sm leading-6 text-muted-foreground">
          تصل الاجتماعات المحجوزة من رابط Cal.com إلى العملاء المحتملين تلقائيًا. في Cal.com أضف
          Webhook بالرابط أدناه، واختر أحداث الحجز (الإنشاء، الطلب، إعادة الجدولة، الإلغاء، الرفض)،
          ثم الصق السر نفسه هنا.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">رابط المشترك</label>
            <AppInput
              readOnly
              dir="ltr"
              value={CALCOM_WEBHOOK_URL}
              onFocus={(event) => event.target.select()}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">السر</label>
            <AppInput
              type="password"
              dir="ltr"
              autoComplete="off"
              placeholder="نفس السر المكتوب في Cal.com"
              value={settings?.calcomWebhookSecret ?? ""}
              onChange={(event) => update("calcomWebhookSecret", event.target.value)}
            />
          </div>
        </div>
      </AppCard>

      <div className="flex justify-end">
        <AppButton
          className="h-11 rounded-[10px] px-8 font-semibold"
          loading={saving}
          disabled={settings === null}
          onClick={handleSave}
        >
          حفظ الإعدادات
        </AppButton>
      </div>

      <MadarAdminWhatsAppSettings />
    </div>
  )
}
