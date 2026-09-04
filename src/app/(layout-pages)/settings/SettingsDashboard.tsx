"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  CreditCard,
  Layers,
  LayoutGrid,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppInput, AppPasswordInput } from "@/components/app"

import { useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"
import { ROUTES } from "@/constants/routes"

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
    <span className="inline-flex items-center rounded-full bg-[#F0F1F4] px-2.5 py-0.5 text-[10px] font-semibold text-[#98A2B3]">
      قريباً
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

function CardHeader({
  title,
  subtitle,
  icon,
  tint,
  size = 48,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  tint: "mint" | "violet"
  size?: number
}) {
  const bg = tint === "mint" ? "#E8F8F4" : "#F1EEFF"
  return (
    <div className="mb-5 flex items-start justify-between">
      <div>
        <h2 className="text-[17px] font-bold text-[#18233A]">{title}</h2>
        <p className="mt-1 text-[11px] text-[#667085]">{subtitle}</p>
      </div>
      <div
        className="flex shrink-0 items-center justify-center rounded-2xl"
        style={{ width: size, height: size, background: bg }}
      >
        {icon}
      </div>
    </div>
  )
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
      <div className="flex items-center justify-between border-b border-[#EEF0F4] py-3 last:border-b-0">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 rounded-xl border border-[#DDD6FE] bg-white px-4 py-1.5 text-xs font-bold text-[#7357D8] transition-opacity hover:opacity-80"
        >
          تعديل
          <Pencil className="size-3" />
        </button>
        <div className="flex min-w-0 items-center gap-6">
          <span className="truncate text-xs font-bold text-[#18233A]">
            {(displayValue ?? value) || <span className="text-[#98A2B3]">—</span>}
          </span>
          <span className="shrink-0 text-xs text-[#52607A]">{label}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 border-b border-[#EEF0F4] py-3 last:border-b-0">
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

function StatCell({
  label,
  value,
  comingSoon,
}: {
  label: string
  value: React.ReactNode
  comingSoon?: boolean
}) {
  return (
    <div className="flex flex-col items-end gap-1 border-e border-[#EEF0F4] px-5 py-3 last:border-e-0">
      <span className="text-[10px] text-[#667085]">{label}</span>
      {comingSoon ? (
        <ComingSoonPill />
      ) : (
        <span className="text-[13px] font-bold text-[#18233A]">{value}</span>
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
        className="flex w-full items-center justify-between rounded-xl border border-[#E8EBF0] px-4 py-3 text-start transition-colors hover:bg-[#FAFBFC]"
      >
        <ChevronLeft className="size-[18px] shrink-0 text-[#18233A]" />
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-bold text-[#18233A]">تغيير كلمة المرور</span>
          <span className="mt-0.5 text-[9px] text-[#667085]">تحديث كلمة المرور الخاصة بحسابك</span>
        </div>
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

function ListRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#E8EBF0] px-4 py-2.5 opacity-70 transition-colors">
      <ComingSoonPill />
      <div className="flex items-center gap-2.5">
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-bold text-[#18233A]">{title}</span>
          <span className="mt-px text-[9px] text-[#667085]">{subtitle}</span>
        </div>
        <ChevronLeft className="size-[18px] shrink-0 text-[#18233A]" />
      </div>
    </div>
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

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-bold leading-tight text-[#18233A]">الإعدادات</h1>
        <p className="mt-1 text-[13px] text-[#667085]">إدارة حسابك وتفضيلاتك والفوترة والدعم</p>
      </div>

      {/* Organization Card */}
      <div
        className="rounded-2xl bg-white p-6"
        style={{ border: "1px solid #E8EBF0", boxShadow: "0 2px 10px rgba(16,42,92,0.04)" }}
      >
        <CardHeader
          title="معلومات المؤسسة"
          subtitle="بيانات مؤسستك وحسابك على منصة مدار"
          icon={<LayoutGrid className="size-[22px]" color="#18B89A" />}
          tint="mint"
        />

        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Logo */}
          <div className="flex shrink-0 flex-col items-center gap-3">
            <div className="flex size-[120px] items-center justify-center overflow-hidden rounded-2xl border border-[#E8EBF0] bg-white">
              {currentOrganization?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentOrganization.logoUrl}
                  alt={currentOrganization.name}
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-[#18233A]">
                  {getInitials(currentOrganization?.name)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={isUploadingLogo}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#E8EBF0] bg-white py-2 text-[11px] font-bold text-[#18233A] transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {isUploadingLogo ? "جارٍ الرفع…" : "تغيير الشعار"}
              <Upload className="size-3" />
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>

          {/* Info rows */}
          <div className="flex flex-1 flex-col">
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
        </div>

        {/* Stats sub-card */}
        <div className="mt-5 rounded-2xl" style={{ border: "1px solid #E8EBF0" }}>
          <div
            className="grid grid-cols-2 sm:grid-cols-4"
            style={{ borderBottom: "1px solid #EEF0F4" }}
          >
            <StatCell label="الباقة الحالية" value={null} comingSoon />
            <StatCell label="تاريخ بداية الاشتراك" value={null} comingSoon />
            <StatCell label="عدد المستخدمين" value={stats ? stats.userCount : "—"} />
            <StatCell
              label={`عدد المنصات المتصلة${stats ? ` (من أصل ${stats.total})` : ""}`}
              value={stats ? stats.connected : "—"}
            />
          </div>
          <div className="grid grid-cols-2">
            <div className="flex flex-col items-end gap-1 px-5 py-3 pe-5">
              <span className="text-[10px] text-[#667085]">المتبقي على الاشتراك</span>
              <ComingSoonPill />
            </div>
            <div
              className="flex flex-col items-end gap-1 border-e px-5 py-3 ps-5"
              style={{ borderColor: "#EEF0F4" }}
            >
              <span className="text-[10px] text-[#667085]">تاريخ انتهاء الاشتراك</span>
              <span className="text-xs font-bold text-[#18233A]">—</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Card */}
      <div
        className="rounded-2xl bg-white p-6"
        style={{ border: "1px solid #E8EBF0", boxShadow: "0 2px 10px rgba(16,42,92,0.04)" }}
      >
        <CardHeader
          title="الاشتراك والفوترة"
          subtitle="تفاصيل اشتراكك الحالي ودورة الفوترة"
          icon={<Layers className="size-[22px]" color="#7357D8" />}
          tint="violet"
        />

        <div className="flex flex-col gap-5 sm:flex-row">
          {/* Countdown mini-card */}
          <div
            className="flex shrink-0 flex-col items-center justify-between gap-3 rounded-2xl p-4 sm:w-[200px]"
            style={{ background: "#F5FCFA", border: "1px solid #DCEFE9" }}
          >
            <span className="text-xs font-bold text-[#18233A]">المتبقي على الاشتراك</span>
            <p className="text-lg font-bold text-[#98A2B3]">قريباً</p>
            <AppButton
              type="button"
              variant="outline"
              size="sm"
              fullWidth
              disabled
              className="border-[#E8EBF0] bg-white text-[10px] font-bold text-[#18233A]"
            >
              إدارة الاشتراك والفوترة
            </AppButton>
          </div>

          {/* Timeline */}
          <div className="flex flex-1 flex-col justify-center gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] text-[#667085]">تاريخ بداية الاشتراك</span>
                <span className="text-[13px] font-bold text-[#18233A]">—</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] text-[#667085]">تاريخ انتهاء الاشتراك</span>
                <span className="text-[13px] font-bold text-[#18233A]">—</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-center">
                <ComingSoonPill />
              </div>
              <div className="relative flex items-center" style={{ height: 8 }}>
                <div className="w-full rounded-full" style={{ height: 4, background: "#DCE2EA" }} />
                <span
                  className="absolute rounded-full border-2 border-white"
                  style={{ width: 10, height: 10, background: "#C9D2DF", right: -3 }}
                />
                <span
                  className="absolute rounded-full border-2 border-white"
                  style={{ width: 10, height: 10, background: "#C9D2DF", left: -3 }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[#667085]">
                <span>—</span>
                <span>—</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security + Billing row */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div
          className="rounded-2xl bg-white p-6"
          style={{ border: "1px solid #E8EBF0", boxShadow: "0 2px 10px rgba(16,42,92,0.04)" }}
        >
          <CardHeader
            title="الأمان وكلمة المرور"
            subtitle="إدارة أمان حسابك وتغيير كلمة المرور"
            icon={<ShieldCheck className="size-5" color="#7357D8" />}
            tint="violet"
            size={44}
          />
          <ChangePasswordForm />
        </div>

        <div
          className="rounded-2xl bg-white p-6"
          style={{ border: "1px solid #E8EBF0", boxShadow: "0 2px 10px rgba(16,42,92,0.04)" }}
        >
          <CardHeader
            title="الاشتراك والفوترة"
            subtitle="إدارة طرق الدفع والفواتير"
            icon={<CreditCard className="size-5" color="#18B89A" />}
            tint="mint"
            size={44}
          />
          <div className="flex flex-col gap-2">
            <ListRow title="تفاصيل الباقة" subtitle="عرض تفاصيل الباقة الحالية والحدود" />
            <ListRow title="طرق الدفع" subtitle="إدارة بيانات الدفع وطرق السداد" />
            <ListRow title="الفواتير والسجلات" subtitle="عرض الفواتير وتاريخ المعاملات" />
          </div>
        </div>
      </div>

      {/* Delete Account */}
      <div
        className="flex items-center justify-between rounded-2xl bg-white px-5 py-4"
        style={{ border: "1px solid #F5DADB" }}
      >
        <ComingSoonPill />
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-[#E5484D]">حذف الحساب</span>
            <span className="mt-0.5 text-[10px] text-[#667085]">
              حذف حسابك وجميع بياناتك بشكل نهائي
            </span>
          </div>
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "#FFF0F0" }}
          >
            <Trash2 className="size-5" color="#E5484D" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="pb-4 text-center text-[10px] text-[#667085]">
        © {new Date().getFullYear()} مدار. جميع الحقوق محفوظة &nbsp;|&nbsp;{" "}
        <Link href={ROUTES.privacy} className="hover:text-[#18233A]">
          سياسة الخصوصية
        </Link>
        &nbsp;|&nbsp;
        <Link href={ROUTES.terms} className="hover:text-[#18233A]">
          الشروط والأحكام
        </Link>
      </p>
    </div>
  )
}
