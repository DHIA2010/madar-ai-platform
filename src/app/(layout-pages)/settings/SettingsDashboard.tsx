"use client"

import { useEffect, useRef, useState } from "react"
import {
  Building2,
  Camera,
  CreditCard,
  FileText,
  Globe2,
  Headphones,
  Layers,
  Lock,
  Trash2,
  Users,
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

function ComingSoonPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
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

interface EditableFieldProps {
  label: string
  value: string
  placeholder?: string
  onSave: (value: string) => Promise<void>
}

function EditableField({ label, value, placeholder, onSave }: EditableFieldProps) {
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
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-b-0">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold text-foreground">
            {value || <span className="text-muted-foreground">—</span>}
          </p>
        </div>
        <AppButton type="button" variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
          تعديل
        </AppButton>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 border-b border-border/60 py-2.5 last:border-b-0">
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
        className="flex w-full items-center justify-between rounded-xl border border-border/60 px-4 py-3 text-start transition-colors hover:bg-muted/50"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">تغيير كلمة المرور</p>
          <p className="text-xs text-muted-foreground">تحديث كلمة المرور الخاصة بحسابك</p>
        </div>
        <span className="text-muted-foreground">‹</span>
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border/60 p-4">
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
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">إدارة حسابك وتفضيلاتك والفوترة والدعم</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* معلومات المؤسسة */}
          <AppCard
            title="معلومات المؤسسة"
            subtitle="بيانات مؤسستك وحسابك على منصة مدار"
            icon={<Building2 className="size-4 text-muted-foreground" />}
            className="rounded-2xl border-border/60 shadow-sm"
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
                  className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full border-2 border-card bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
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
              <p className="text-xs text-muted-foreground">
                PNG أو JPEG أو WEBP أو GIF، بحد أقصى 3 ميجابايت.
              </p>
            </div>

            <div className="mt-4">
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
                placeholder="مثال: SA"
                onSave={(value) => saveField("country", value)}
              />
              <EditableField
                label="العملة (عملة التقارير)"
                value={currentOrganization?.currency ?? ""}
                onSave={(value) => saveField("currency", value)}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/60 p-3 text-center">
                <p className="text-lg font-bold text-foreground">
                  {stats ? `${stats.connected}` : "—"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  عدد المنصات المتصلة
                  {stats ? ` (من أصل ${stats.total})` : ""}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 p-3 text-center">
                <p className="text-lg font-bold text-foreground">{stats ? stats.userCount : "—"}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">عدد المستخدمين</p>
              </div>
              <div className="rounded-xl border border-border/60 p-3 text-center">
                <p className="text-sm font-bold text-muted-foreground">—</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">تاريخ بداية الاشتراك</p>
                <ComingSoonPill />
              </div>
              <div className="rounded-xl border border-border/60 p-3 text-center">
                <p className="text-sm font-bold text-muted-foreground">—</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">الباقة الحالية / المتبقي</p>
                <ComingSoonPill />
              </div>
            </div>
          </AppCard>

          {/* الاشتراك والفوترة -- ملخص */}
          <AppCard
            title="الاشتراك والفوترة"
            subtitle="تفاصيل اشتراك الحساب الحالي ودورة الفوترة"
            icon={<Layers className="size-4 text-muted-foreground" />}
            className="rounded-2xl border-border/60 shadow-sm"
          >
            <div className="flex items-start gap-2.5">
              <div>
                <p className="text-xs leading-6 text-muted-foreground">
                  تفاصيل الاشتراك والفوترة قيد التطوير حالياً.
                </p>
                <ComingSoonPill />
              </div>
            </div>
          </AppCard>

          {/* الأمان وكلمة المرور */}
          <AppCard
            title="الأمان وكلمة المرور"
            subtitle="إدارة أمان حسابك وتغيير كلمة المرور"
            icon={<Lock className="size-4 text-muted-foreground" />}
            className="rounded-2xl border-border/60 shadow-sm"
          >
            <ChangePasswordForm />
          </AppCard>

          {/* الاشتراك والفوترة -- تفاصيل */}
          <AppCard
            title="الاشتراك والفوترة"
            subtitle="إدارة طرق الدفع والفواتير"
            icon={<CreditCard className="size-4 text-muted-foreground" />}
            className="rounded-2xl border-border/60 shadow-sm"
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
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-4 py-3 opacity-60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <row.icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.subtitle}</p>
                    </div>
                  </div>
                  <ComingSoonPill />
                </div>
              ))}
            </div>
          </AppCard>

          {/* حذف الحساب */}
          <AppCard className="rounded-2xl border-rose-200/60 shadow-sm">
            <div className="flex items-center justify-between gap-2 opacity-60">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Trash2 className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-rose-600">حذف الحساب</p>
                  <p className="text-xs text-muted-foreground">
                    حذف حسابك وجميع بياناتك بشكل نهائي
                  </p>
                </div>
              </div>
              <ComingSoonPill />
            </div>
          </AppCard>
        </div>

        {/* الشريط الجانبي */}
        <div className="space-y-4">
          <AppCard className="rounded-2xl border-border/60 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Globe2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {currentOrganization?.name ?? "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {shortOrgId}
                </p>
              </div>
            </div>
          </AppCard>

          <AppCard className="rounded-2xl border-border/60 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Headphones className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">تحتاج مساعدة؟</p>
                <p className="text-xs text-muted-foreground">فريق الدعم في مدار لمساعدتك</p>
              </div>
            </div>
            <AppButton
              variant="outline"
              size="sm"
              fullWidth
              className="mt-3"
              onClick={() => {
                window.location.href = `mailto:${MADAR_CONTACT_EMAIL}`
              }}
            >
              تواصل معنا
            </AppButton>
          </AppCard>

          <AppCard className="rounded-2xl border-border/60 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Users className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {stats ? stats.userCount : "—"} مستخدمين
                </p>
                <p className="text-xs text-muted-foreground">في هذه المؤسسة</p>
              </div>
            </div>
          </AppCard>
        </div>
      </div>
    </div>
  )
}
