"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Building2,
  Calendar,
  Camera,
  Clock,
  CreditCard,
  FileText,
  Globe2,
  Headphones,
  Layers,
  Lock,
  Trash2,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import {
  AppAvatar,
  AppAvatarFallback,
  AppAvatarImage,
  AppButton,
  AppCard,
  AppInput,
  AppPasswordInput,
} from "@/components/app"

import { useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"
import { MADAR_CONTACT_EMAIL } from "@/features/marketing-site/marketing-constants"
import { ROUTES } from "@/constants/routes"

// Scoped to this page only -- the app's global design tokens (--primary, etc.) are a
// different blue and are shared across every page, so reskinning them isn't in scope here.
const NAVY = "#102A5C"
const MINT = "#18B89A"
const MINT_LIGHT = "#E8F8F4"
const PURPLE = "#7357D8"
const PURPLE_LIGHT = "#F1EEFF"
const DANGER = "#E5484D"
const DANGER_LIGHT = "#FFF0F0"

// Deterministic display labels for codes the org itself stores -- not fabricated data, just
// formatting of the real stored country/currency code (falls back to the raw code otherwise).
const COUNTRY_LABELS: Record<string, string> = {
  SA: "المملكة العربية السعودية",
  AE: "الإمارات العربية المتحدة",
  KW: "الكويت",
  QA: "قطر",
  BH: "البحرين",
  OM: "عُمان",
  EG: "مصر",
  JO: "الأردن",
  IQ: "العراق",
  MA: "المغرب",
}

const CURRENCY_LABELS: Record<string, string> = {
  SAR: "الريال السعودي",
  USD: "الدولار الأمريكي",
  AED: "الدرهم الإماراتي",
  KWD: "الدينار الكويتي",
  QAR: "الريال القطري",
  BHD: "الدينار البحريني",
  OMR: "الريال العماني",
  EGP: "الجنيه المصري",
  JOD: "الدينار الأردني",
  EUR: "اليورو",
  GBP: "الجنيه الإسترليني",
}

function formatCountry(code: string | undefined) {
  if (!code) return ""
  return COUNTRY_LABELS[code.toUpperCase()] ?? code
}

function formatCurrency(code: string | undefined) {
  if (!code) return ""
  const label = CURRENCY_LABELS[code.toUpperCase()]
  return label ? `${label} (${code.toUpperCase()})` : code
}

function ComingSoonPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      قريباً
    </span>
  )
}

function SectionIcon({
  icon,
  tint,
}: {
  icon: React.ReactNode
  tint: "mint" | "purple" | "danger"
}) {
  const styles =
    tint === "mint"
      ? { background: MINT_LIGHT, color: MINT }
      : tint === "purple"
        ? { background: PURPLE_LIGHT, color: PURPLE }
        : { background: DANGER_LIGHT, color: DANGER }
  return (
    <span
      className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl"
      style={styles}
    >
      {icon}
    </span>
  )
}

function getInitials(name: string | undefined) {
  if (!name) return "؟"
  const parts = name.trim().split(/\s+/)
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
  return initials.toUpperCase() || "؟"
}

interface EditableFieldProps {
  label: string
  value: string
  displayValue?: string
  placeholder?: string
  onSave: (value: string) => Promise<void>
}

function EditableField({ label, value, displayValue, placeholder, onSave }: EditableFieldProps) {
  const [draft, setDraft] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setDraft(value)
    }
  }, [value, isEditing])

  async function handleSave() {
    const trimmed = draft.trim()
    if (trimmed === value) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    try {
      await onSave(trimmed)
      setIsEditing(false)
      toast.success("تم الحفظ")
    } catch {
      toast.error("تعذّر الحفظ. حاول مرة أخرى.")
    } finally {
      setIsSaving(false)
    }
  }

  if (!isEditing) {
    return (
      <div className="flex min-h-[55px] items-center justify-between gap-3 border-b border-[#F0F1F4] py-3 last:border-b-0">
        <AppButton
          type="button"
          size="sm"
          onClick={() => setIsEditing(true)}
          className="h-9 w-[82px] shrink-0 border border-[#DDD6FE] bg-white text-[13px] font-semibold shadow-none hover:bg-[#F1EEFF]"
          style={{ color: PURPLE }}
        >
          تعديل
        </AppButton>
        <div className="min-w-0 flex-1 text-end">
          <p className="truncate text-sm font-semibold text-foreground">
            {(displayValue ?? value) || <span className="text-muted-foreground">—</span>}
          </p>
        </div>
        <p className="w-[110px] shrink-0 text-xs text-[#667085]">{label}</p>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 border-b border-[#F0F1F4] py-3 last:border-b-0">
      <AppInput
        label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        wrapperClassName="flex-1"
      />
      <div className="flex shrink-0 gap-1.5 pb-0.5">
        <AppButton type="button" size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "جارٍ الحفظ…" : "حفظ"}
        </AppButton>
        <AppButton
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(value)
            setIsEditing(false)
          }}
          disabled={isSaving}
        >
          إلغاء
        </AppButton>
      </div>
    </div>
  )
}

function StatColumn({
  label,
  value,
  comingSoon,
}: {
  label: string
  value: React.ReactNode
  comingSoon?: boolean
}) {
  return (
    <div className="border-e border-[#F0F1F4] px-4 py-4 text-center last:border-e-0">
      {comingSoon ? (
        <>
          <p className="text-sm font-bold text-muted-foreground">—</p>
          <p className="mt-2 text-[12px] text-[#667085]">{label}</p>
          <div className="mt-1.5 flex justify-center">
            <ComingSoonPill />
          </div>
        </>
      ) : (
        <>
          <p className="text-[15px] font-bold text-foreground">{value}</p>
          <p className="mt-2 text-[12px] text-[#667085]">{label}</p>
        </>
      )}
    </div>
  )
}

function ChangePasswordForm() {
  const { changePassword } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setErrorText(null)

    if (newPassword.length < 12) {
      setErrorText("يجب ألا تقل كلمة المرور الجديدة عن 12 حرفاً.")
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorText("كلمتا المرور الجديدتان غير متطابقتين.")
      return
    }

    setIsSaving(true)
    try {
      await changePassword({ currentPassword, newPassword })
      toast.success("تم تغيير كلمة المرور. سيتم تسجيل خروجك الآن.")
      // The backend revokes every other active session on a successful change, and the current
      // one isn't excluded -- redirect to login rather than leave the UI on a stale session.
      window.setTimeout(() => {
        window.location.href = "/auth/basic/login/"
      }, 1200)
    } catch {
      setErrorText("كلمة المرور الحالية غير صحيحة.")
    } finally {
      setIsSaving(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border border-[#E8EBF0] px-3.5 text-start transition-colors hover:bg-[#FAFBFC]"
      >
        <span className="text-muted-foreground">‹</span>
        <div className="flex-1 text-end">
          <p className="text-sm font-semibold text-foreground">تغيير كلمة المرور</p>
          <p className="text-xs text-[#667085]">تحديث كلمة المرور الخاصة بحسابك</p>
        </div>
        <Lock className="size-4 shrink-0" style={{ color: PURPLE }} />
      </button>
    )
  }

  return (
    <form className="space-y-3 rounded-xl border border-[#E8EBF0] p-4" onSubmit={handleSubmit}>
      <AppPasswordInput
        label="كلمة المرور الحالية"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <AppPasswordInput
        label="كلمة المرور الجديدة"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
        helperText="12 حرفاً على الأقل."
      />
      <AppPasswordInput
        label="تأكيد كلمة المرور الجديدة"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />
      {errorText ? <p className="text-xs text-rose-600">{errorText}</p> : null}
      <div className="flex justify-end gap-2">
        <AppButton
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setExpanded(false)
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            setErrorText(null)
          }}
          disabled={isSaving}
        >
          إلغاء
        </AppButton>
        <AppButton type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
        </AppButton>
      </div>
    </form>
  )
}

export default function SettingsDashboard() {
  const {
    currentOrganization,
    updateOrganization,
    uploadOrganizationLogo,
    getConnectedPlatformsCount,
  } = useWorkspace()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [stats, setStats] = useState<{
    connected: number
    total: number
    userCount: number
  } | null>(null)

  useEffect(() => {
    if (!currentOrganization?.id) return
    let cancelled = false
    getConnectedPlatformsCount(currentOrganization.id)
      .then((result) => {
        if (!cancelled) setStats(result)
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrganization?.id, getConnectedPlatformsCount])

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !currentOrganization) return

    setIsUploadingLogo(true)
    try {
      await uploadOrganizationLogo(currentOrganization.id, file)
      toast.success("تم تحديث الشعار")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر رفع الشعار")
    } finally {
      setIsUploadingLogo(false)
    }
  }

  async function saveField(field: "name" | "storeName" | "country" | "currency", value: string) {
    if (!currentOrganization) return
    if (field === "name") {
      await updateOrganization(currentOrganization.id, { name: value })
    } else if (field === "currency") {
      await updateOrganization(currentOrganization.id, { currency: value })
    } else {
      await updateOrganization(currentOrganization.id, {
        settings: { [field]: value },
      })
    }
  }

  const shortOrgId = currentOrganization ? `org_${currentOrganization.id.slice(0, 10)}` : ""

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-[26px] font-bold text-foreground">الإعدادات</h1>
        <p className="mt-1 text-sm text-[#667085]">إدارة حسابك وتفضيلاتك والفوترة والدعم</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* معلومات المؤسسة */}
          <AppCard
            title="معلومات المؤسسة"
            subtitle="بيانات مؤسستك وحسابك على منصة مدار"
            icon={<SectionIcon tint="mint" icon={<Building2 className="size-6" />} />}
            className="rounded-[18px] border-[#E8EBF0] shadow-[0_2px_8px_rgba(16,42,92,0.03)]"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <AppAvatar className="size-16">
                  {currentOrganization?.logoUrl ? (
                    <AppAvatarImage src={currentOrganization.logoUrl} />
                  ) : null}
                  <AppAvatarFallback className="text-lg font-bold">
                    {getInitials(currentOrganization?.name)}
                  </AppAvatarFallback>
                </AppAvatar>
                <button
                  type="button"
                  aria-label="تغيير الشعار"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full border-2 border-card text-white transition-colors disabled:opacity-60"
                  style={{ background: MINT }}
                >
                  <Camera className="size-3" />
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
              <div>
                <AppButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="h-9 text-xs"
                >
                  {isUploadingLogo ? "جارٍ الرفع…" : "تغيير الشعار"}
                </AppButton>
                <p className="mt-1.5 text-xs text-[#98A2B3]">
                  PNG أو JPEG أو WEBP أو GIF، بحد أقصى 3 ميجابايت.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <EditableField
                label="اسم المؤسسة"
                value={currentOrganization?.name ?? ""}
                onSave={(value) => saveField("name", value)}
              />
              <EditableField
                label="اسم المتجر"
                value={currentOrganization?.settings.storeName ?? ""}
                placeholder="أضف اسم المتجر"
                onSave={(value) => saveField("storeName", value)}
              />
              <EditableField
                label="الدولة"
                value={currentOrganization?.settings.country ?? ""}
                displayValue={formatCountry(currentOrganization?.settings.country) || undefined}
                placeholder="مثال: SA"
                onSave={(value) => saveField("country", value)}
              />
              <EditableField
                label="العملة (عملة التقارير)"
                value={currentOrganization?.currency ?? ""}
                displayValue={formatCurrency(currentOrganization?.currency) || undefined}
                placeholder="مثال: SAR"
                onSave={(value) => saveField("currency", value)}
              />
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-xl border border-[#F0F1F4] sm:grid-cols-4">
              <StatColumn label="الباقة الحالية" value={null} comingSoon />
              <StatColumn label="تاريخ بداية الاشتراك" value={null} comingSoon />
              <StatColumn label="عدد المستخدمين" value={stats ? stats.userCount : "—"} />
              <StatColumn
                label={`عدد المنصات المتصلة${stats ? ` (من أصل ${stats.total})` : ""}`}
                value={stats ? stats.connected : "—"}
              />
            </div>
          </AppCard>

          {/* الاشتراك والفوترة -- ملخص */}
          <div className="grid gap-5 lg:grid-cols-2">
            <AppCard
              title="الاشتراك والفوترة"
              subtitle="تفاصيل اشتراكك الحالي ودورة الفوترة"
              icon={<SectionIcon tint="purple" icon={<Calendar className="size-6" />} />}
              className="rounded-[18px] border-[#E8EBF0] shadow-[0_2px_8px_rgba(16,42,92,0.03)]"
            >
              <div className="flex items-center justify-between text-xs text-[#667085]">
                <span>تاريخ بداية الاشتراك</span>
                <span className="font-semibold text-foreground">—</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[#667085]">
                <span>تاريخ انتهاء الاشتراك</span>
                <span className="font-semibold text-foreground">—</span>
              </div>

              <div className="mt-5">
                <div className="relative h-1.5 rounded-full bg-[#F0F1F4]">
                  <span className="absolute -start-0.5 -top-1 size-3.5 rounded-full border-2 border-white bg-[#D0D5DD]" />
                  <span className="absolute -end-0.5 -top-1 size-3.5 rounded-full border-2 border-white bg-[#D0D5DD]" />
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#98A2B3]">
                  <span>—</span>
                  <ComingSoonPill />
                  <span>—</span>
                </div>
              </div>
            </AppCard>

            <div
              className="rounded-2xl p-5"
              style={{ background: MINT_LIGHT, border: "1px solid #E8F3EF" }}
            >
              <p className="text-sm font-semibold text-foreground">المتبقي على الاشتراك</p>
              <p className="mt-3 text-2xl font-bold text-muted-foreground">قريباً</p>
              <p className="mt-1 text-xs text-[#667085]">
                تفاصيل الاشتراك والفوترة قيد التطوير حالياً.
              </p>
              <AppButton
                type="button"
                variant="outline"
                size="sm"
                fullWidth
                disabled
                className="mt-4 bg-white"
              >
                إدارة الاشتراك والفوترة
              </AppButton>
            </div>
          </div>

          {/* Lower settings grid: الاشتراك والفوترة + الأمان وكلمة المرور */}
          <div className="grid gap-5 lg:grid-cols-2">
            <AppCard
              title="الاشتراك والفوترة"
              subtitle="إدارة طرق الدفع والفواتير"
              icon={<SectionIcon tint="mint" icon={<Wallet className="size-6" />} />}
              className="rounded-[18px] border-[#E8EBF0] shadow-[0_2px_8px_rgba(16,42,92,0.03)]"
            >
              <div className="space-y-2">
                {[
                  {
                    icon: Layers,
                    title: "تفاصيل الباقة",
                    subtitle: "عرض تفاصيل الباقة الحالية والحدود",
                  },
                  {
                    icon: CreditCard,
                    title: "طرق الدفع",
                    subtitle: "إدارة بطاقات الدفع وطرق السداد",
                  },
                  {
                    icon: FileText,
                    title: "الفواتير والسجلات",
                    subtitle: "عرض الفواتير وتاريخ المعاملات",
                  },
                ].map((row) => (
                  <div
                    key={row.title}
                    className="flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-[#E8EBF0] px-3.5 opacity-60"
                  >
                    <ComingSoonPill />
                    <div className="flex flex-1 items-center justify-end gap-2.5 text-end">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{row.title}</p>
                        <p className="text-xs text-[#667085]">{row.subtitle}</p>
                      </div>
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: MINT_LIGHT, color: MINT }}
                      >
                        <row.icon className="size-4" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </AppCard>

            <AppCard
              title="الأمان وكلمة المرور"
              subtitle="إدارة أمان حسابك وتغيير كلمة المرور"
              icon={<SectionIcon tint="purple" icon={<Lock className="size-6" />} />}
              className="rounded-[18px] border-[#E8EBF0] shadow-[0_2px_8px_rgba(16,42,92,0.03)]"
            >
              <ChangePasswordForm />
            </AppCard>
          </div>

          {/* حذف الحساب */}
          <div
            className="flex min-h-[84px] flex-col items-stretch justify-between gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center"
            style={{ borderColor: "#F5DADB" }}
          >
            <ComingSoonPill />
            <div className="flex flex-1 items-center justify-end gap-3.5 text-end">
              <div>
                <p className="text-[15px] font-bold" style={{ color: DANGER }}>
                  حذف الحساب
                </p>
                <p className="mt-0.5 text-xs text-[#667085]">حذف حسابك وجميع بياناتك بشكل نهائي</p>
              </div>
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: DANGER_LIGHT, color: DANGER }}
              >
                <Trash2 className="size-5" />
              </span>
            </div>
          </div>

          <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#EEF0F4] pt-5 text-xs text-[#98A2B3] sm:flex-row">
            <p>© {new Date().getFullYear()} مدار. جميع الحقوق محفوظة</p>
            <div className="flex items-center gap-4">
              <Link href={ROUTES.terms} className="hover:text-[#667085]">
                الشروط والأحكام
              </Link>
              <Link href={ROUTES.privacy} className="hover:text-[#667085]">
                سياسة الخصوصية
              </Link>
            </div>
          </footer>
        </div>

        {/* الشريط الجانبي */}
        <div className="space-y-5">
          <AppCard className="rounded-[18px] border-[#E8EBF0] shadow-[0_2px_8px_rgba(16,42,92,0.03)]">
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "#EEF2FF", color: NAVY }}
              >
                <Globe2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {currentOrganization?.name ?? "—"}
                </p>
                <p className="truncate text-xs text-[#98A2B3]" dir="ltr">
                  {shortOrgId}
                </p>
              </div>
            </div>
          </AppCard>

          <AppCard className="rounded-[18px] border-[#E8EBF0] shadow-[0_2px_8px_rgba(16,42,92,0.03)]">
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: PURPLE_LIGHT, color: PURPLE }}
              >
                <Headphones className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">تحتاج مساعدة؟</p>
                <p className="text-xs text-[#667085]">فريق الدعم في مدار لمساعدتك</p>
              </div>
            </div>
            <AppButton
              variant="outline"
              size="sm"
              fullWidth
              className="mt-3 border-[#DDD6FE] bg-white hover:bg-[#F1EEFF]"
              style={{ color: PURPLE }}
              onClick={() => {
                window.location.href = `mailto:${MADAR_CONTACT_EMAIL}`
              }}
            >
              تواصل معنا
            </AppButton>
          </AppCard>

          <AppCard className="rounded-[18px] border-[#E8EBF0] shadow-[0_2px_8px_rgba(16,42,92,0.03)]">
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: MINT_LIGHT, color: MINT }}
              >
                <Clock className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {stats ? stats.userCount : "—"} مستخدمين
                </p>
                <p className="text-xs text-[#667085]">في هذه المؤسسة</p>
              </div>
            </div>
          </AppCard>
        </div>
      </div>
    </div>
  )
}
