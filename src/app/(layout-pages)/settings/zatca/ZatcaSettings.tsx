"use client"

// الفوترة الإلكترونية (ZATCA) -- Phase 2 (Integration Phase) device onboarding. Every step here
// except "الربط عبر OTP" runs with no live ZATCA dependency at all: generating a device/CSR is
// entirely local (see backend zatca-devices-service.ts), and Compliance Checks/Production only
// ever act on a device that already went through that one OTP-gated step. Once a device reaches
// "production", every new sale is signed automatically (PosInvoicesService.create()) and can be
// reported manually from the invoice detail panel ("الإبلاغ إلى الهيئة").

import { useCallback, useEffect, useState } from "react"
import {
  Check,
  Copy,
  FileText,
  Info,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/features/workspace"
import {
  zatcaService,
  type CreateZatcaDeviceInput,
  type ZatcaComplianceCheckResult,
  type ZatcaCsrEnvironment,
  type ZatcaDevice,
} from "@/features/pos/services/zatca.service"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#E8EBF0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#98A2B3]"

const ENVIRONMENT_LABEL: Record<ZatcaCsrEnvironment, string> = {
  sandbox: "بيئة تجريبية (Sandbox)",
  simulation: "بيئة محاكاة (Simulation)",
  production: "بيئة الإنتاج (Production)",
}

const STATUS_META: Record<ZatcaDevice["status"], { label: string; tint: string; dot: string }> = {
  draft: { label: "بانتظار الربط (OTP)", tint: "bg-[#f2f4f8] text-[#667085]", dot: "bg-[#98A2B3]" },
  compliance: {
    label: "التوافق (Compliance)",
    tint: "bg-[#eef4ff] text-[#2878ff]",
    dot: "bg-[#2878ff]",
  },
  production: {
    label: "مُفعَّل للإنتاج",
    tint: "bg-[#e9f8ef] text-[#1f9d55]",
    dot: "bg-[#1f9d55]",
  },
}

const DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

interface Draft {
  commonName: string
  environment: ZatcaCsrEnvironment
  vatNumber: string
  organizationName: string
  organizationUnit: string
  location: string
  industry: string
}

function emptyDraft(defaults: {
  organizationName: string
  vatNumber: string
  location: string
}): Draft {
  return {
    commonName: "",
    environment: "sandbox",
    vatNumber: defaults.vatNumber,
    organizationName: defaults.organizationName,
    organizationUnit: "",
    location: defaults.location,
    industry: "",
  }
}

// The EGS serial number ZATCA's certificate schema requires ("1-<vendor>|2-<product>|3-<unique
// id>") is never something a merchant types or looks up -- it is self-declared by the software
// vendor, ZATCA only requires the third part to be unique per device. Deriving it from the
// branch's (or, with no branch selected, the organization's) own id keeps every device's serial
// unique automatically and keeps this entirely invisible to the merchant, who has no reason to
// understand ZATCA's certificate internals.
function buildEgsSerialNumber(scopeId: string): string {
  return `1-Madar|2-POS|3-${scopeId}`
}

export default function ZatcaSettings() {
  const { currentOrganization, currentWorkspace } = useWorkspace()

  const [devices, setDevices] = useState<ZatcaDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(
    emptyDraft({ organizationName: "", vatNumber: "", location: "" })
  )

  const [otpByDevice, setOtpByDevice] = useState<Record<string, string>>({})
  const [complianceResults, setComplianceResults] = useState<
    Record<string, ZatcaComplianceCheckResult[]>
  >({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setDevices(await zatcaService.listDevices())
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(
        status === 403 ? "لا تملك صلاحية عرض إعدادات الفوترة الإلكترونية." : "تعذر تحميل الأجهزة."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const failed = (error: unknown, fallback: string) => {
    const status = error instanceof AppError ? error.status : undefined
    const code = error instanceof AppError ? error.code : undefined
    toast.error(
      status === 403
        ? "لا تملك صلاحية إدارة الفوترة الإلكترونية."
        : code === "ZATCA_DEVICE_WRONG_STATUS"
          ? "حالة الجهاز الحالية لا تسمح بهذا الإجراء."
          : fallback,
      { description: status === 403 ? "تواصل مع مالك الحساب لمنحك صلاحية pos:manage." : undefined }
    )
  }

  const openCreate = () => {
    setDraft(
      emptyDraft({
        organizationName: currentOrganization?.name ?? "",
        vatNumber: currentOrganization?.settings.taxNumber ?? "",
        location: currentOrganization?.settings.addressShort ?? "",
      })
    )
    setCreating(true)
  }

  const submitCreate = async () => {
    if (!draft.commonName.trim()) return toast.error("أدخل اسماً لهذا الجهاز.")
    if (!/^\d{15}$/.test(draft.vatNumber.trim()))
      return toast.error("الرقم الضريبي يجب أن يتكون من 15 رقماً.")
    if (!draft.organizationName.trim()) return toast.error("أدخل اسم المنشأة المسجّل.")
    if (!draft.organizationUnit.trim()) return toast.error("أدخل اسم الفرع أو الوحدة.")
    if (!draft.location.trim()) return toast.error("أدخل عنوان الجهاز/الفرع.")
    if (!draft.industry.trim()) return toast.error("أدخل النشاط التجاري.")
    if (!currentOrganization) return toast.error("تعذر تحديد المنشأة الحالية.")

    setBusyId("new")
    try {
      const input: CreateZatcaDeviceInput = {
        workspaceId: currentWorkspace?.id ?? null,
        commonName: draft.commonName.trim(),
        environment: draft.environment,
        vatNumber: draft.vatNumber.trim(),
        organizationName: draft.organizationName.trim(),
        organizationUnit: draft.organizationUnit.trim(),
        egsSerialNumber: buildEgsSerialNumber(currentWorkspace?.id ?? currentOrganization.id),
        location: draft.location.trim(),
        industry: draft.industry.trim(),
      }
      await zatcaService.createDevice(input)
      toast.success("تم إنشاء الجهاز وتوليد طلب التوقيع (CSR).")
      setCreating(false)
      await load()
    } catch (error) {
      failed(error, "تعذر إنشاء الجهاز.")
    } finally {
      setBusyId(null)
    }
  }

  const copyCsr = async (device: ZatcaDevice) => {
    await navigator.clipboard.writeText(device.csr)
    setCopiedId(device.id)
    toast.success("تم نسخ طلب التوقيع (CSR).")
    setTimeout(() => setCopiedId((current) => (current === device.id ? null : current)), 2000)
  }

  const submitOtp = async (device: ZatcaDevice) => {
    const otp = (otpByDevice[device.id] ?? "").trim()
    if (!otp) return toast.error("أدخل رمز التحقق (OTP) من بوابة فاتورة.")

    setBusyId(device.id)
    try {
      await zatcaService.submitOtp(device.id, otp)
      toast.success("تم الربط بنجاح -- تم الحصول على شهادة التوافق (Compliance CSID).")
      setOtpByDevice((prev) => ({ ...prev, [device.id]: "" }))
      await load()
    } catch (error) {
      failed(error, "تعذر التحقق من رمز OTP. تأكد من صحته وحاول مجدداً.")
    } finally {
      setBusyId(null)
    }
  }

  const runComplianceChecks = async (device: ZatcaDevice) => {
    setBusyId(device.id)
    try {
      const results = await zatcaService.runComplianceChecks(device.id)
      setComplianceResults((prev) => ({ ...prev, [device.id]: results }))
      toast.success("تم تشغيل فحوصات التوافق.")
    } catch (error) {
      failed(error, "تعذر تشغيل فحوصات التوافق.")
    } finally {
      setBusyId(null)
    }
  }

  const exchangeProduction = async (device: ZatcaDevice) => {
    setBusyId(device.id)
    try {
      await zatcaService.exchangeProduction(device.id)
      toast.success("تم تفعيل الجهاز للإنتاج -- ستُوقَّع الفواتير القادمة تلقائياً.")
      await load()
    } catch (error) {
      failed(error, "تعذر الحصول على شهادة الإنتاج.")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل إعدادات الفوترة الإلكترونية...
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}>
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>
            الفوترة الإلكترونية (هيئة الزكاة والضريبة والجمارك)
          </h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            ربط أجهزة نقاط البيع بمنصة فاتورة -- المرحلة الثانية (Integration Phase)
          </p>
        </div>

        <Button
          className="h-auto gap-2 rounded-[10px] bg-[#2563eb] px-[18px] py-2.5 text-[13px] font-bold text-white hover:bg-[#1d4ed8]"
          onClick={openCreate}
        >
          <Plus className="size-4" />
          إضافة جهاز جديد
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-[12px] bg-[#eef4ff] p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-[#2878ff]" />
        <p className="text-[11.5px] leading-6 text-[#2878ff]">
          توليد الجهاز وطلب التوقيع (CSR) لا يحتاج أي اتصال بمنصة فاتورة. خطوة &quot;الربط عبر
          OTP&quot; وحدها تحتاج رمز تحقق حقيقياً من حساب المنشأة على بوابة فاتورة (Fatoora) -- بعدها
          تُشغَّل فحوصات التوافق ثم يُصدر جهازك شهادة الإنتاج، ومن تلك اللحظة تُوقَّع كل عملية بيع
          تلقائياً ويمكن إبلاغها للهيئة من تفاصيل الفاتورة.
        </p>
      </div>

      {devices.length === 0 ? (
        <div className={cn(PANEL, "flex flex-col items-center gap-2 p-10 text-center")}>
          <ShieldCheck className="size-8 text-[#98A2B3]" />
          <p className={cn("text-[13px] font-bold", HEADING)}>لا يوجد جهاز مسجّل بعد</p>
          <p className={cn("text-[12px]", MUTED)}>
            أضف جهازاً لتوليد طلب توقيع (CSR) وبدء الربط مع منصة فاتورة.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {devices.map((device) => {
            const meta = STATUS_META[device.status]
            const busy = busyId === device.id
            const results = complianceResults[device.id] ?? []
            return (
              <section key={device.id} className={cn(PANEL, "flex flex-col gap-4 p-5")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("text-[14px] font-extrabold", HEADING)}>
                      {device.commonName}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                        meta.tint
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", meta.dot)} />
                      {meta.label}
                    </span>
                  </div>
                  <span className={cn("text-[11px]", MUTED)}>
                    أُنشئ {DATE_FORMAT.format(new Date(device.createdAt))} -- آخر عداد ICV:{" "}
                    {device.lastIcv}
                  </span>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label
                      className={cn("flex items-center gap-1.5 text-[12px] font-bold", HEADING)}
                    >
                      <FileText className="size-3.5" />
                      طلب التوقيع (CSR)
                    </Label>
                    <button
                      type="button"
                      onClick={() => void copyCsr(device)}
                      className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#2878ff] hover:text-[#1f66e0]"
                    >
                      {copiedId === device.id ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedId === device.id ? "تم النسخ" : "نسخ"}
                    </button>
                  </div>
                  <pre className="max-h-32 overflow-auto rounded-[10px] border border-[#e8edf3] bg-[#f7f9fc] p-3 text-[10.5px] leading-5 text-[#5b6b85] [direction:ltr]">
                    {device.csr}
                  </pre>
                </div>

                {device.status === "draft" ? (
                  <div className="flex flex-col gap-2 border-t border-[#eef2f8] pt-3.5 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Label className={cn("mb-1.5 block text-[12px] font-bold", HEADING)}>
                        رمز التحقق (OTP) من بوابة فاتورة
                      </Label>
                      <Input
                        value={otpByDevice[device.id] ?? ""}
                        placeholder="أدخل رمز OTP"
                        className={FIELD_CLASS}
                        onChange={(event) =>
                          setOtpByDevice((prev) => ({ ...prev, [device.id]: event.target.value }))
                        }
                      />
                    </div>
                    <Button
                      className="h-11 gap-2 rounded-[10px] bg-[#2878ff] text-[13px] font-bold text-white hover:bg-[#1f66e0]"
                      disabled={busy}
                      onClick={() => void submitOtp(device)}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                      الربط عبر OTP
                    </Button>
                  </div>
                ) : null}

                {device.status === "compliance" ? (
                  <div className="flex flex-col gap-3 border-t border-[#eef2f8] pt-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-10 gap-2 rounded-[10px] text-[12.5px] font-semibold"
                        disabled={busy}
                        onClick={() => void runComplianceChecks(device)}
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                        تشغيل فحوصات التوافق (Compliance Checks)
                      </Button>
                      <Button
                        className="h-10 gap-2 rounded-[10px] bg-[#1f9d55] text-[12.5px] font-bold text-white hover:bg-[#188045]"
                        disabled={busy}
                        onClick={() => void exchangeProduction(device)}
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                        الحصول على شهادة الإنتاج
                      </Button>
                    </div>
                    {results.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {results.map((result) => (
                          <div
                            key={result.scenario}
                            className="flex items-center justify-between rounded-[10px] bg-[#f7f9fc] px-3 py-2 text-[12px]"
                          >
                            <span className={HEADING}>{result.scenario}</span>
                            <span className="font-bold text-[#2878ff]">{result.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {device.status === "production" ? (
                  <div className="flex items-center gap-2 rounded-[10px] bg-[#e9f8ef] px-3.5 py-3 text-[12.5px] font-semibold text-[#1f9d55]">
                    <ShieldCheck className="size-4" />
                    الجهاز مفعَّل -- تُوقَّع كل عملية بيع جديدة تلقائياً ويمكن إبلاغها للهيئة من
                    تفاصيل الفاتورة.
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[32rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              إضافة جهاز جديد
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pe-1">
            <div>
              <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
                اسم الجهاز *
              </Label>
              <Input
                value={draft.commonName}
                placeholder="مثال: نقطة بيع -- الفرع الرئيسي"
                className={FIELD_CLASS}
                onChange={(event) => setDraft({ ...draft, commonName: event.target.value })}
              />
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
                البيئة *
              </Label>
              <Select
                dir="rtl"
                value={draft.environment}
                onValueChange={(next) =>
                  setDraft({ ...draft, environment: next as ZatcaCsrEnvironment })
                }
              >
                <SelectTrigger className={cn(FIELD_CLASS, "h-10! w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="rounded-[12px]">
                  {(Object.keys(ENVIRONMENT_LABEL) as ZatcaCsrEnvironment[]).map((environment) => (
                    <SelectItem
                      key={environment}
                      value={environment}
                      className="rounded-[8px] py-3.5 text-[13px]"
                    >
                      {ENVIRONMENT_LABEL[environment]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
                الرقم الضريبي (15 رقماً) *
              </Label>
              <Input
                value={draft.vatNumber}
                placeholder="3XXXXXXXXXXXXX3"
                className={FIELD_CLASS}
                onChange={(event) => setDraft({ ...draft, vatNumber: event.target.value })}
              />
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
                اسم المنشأة المسجّل *
              </Label>
              <Input
                value={draft.organizationName}
                className={FIELD_CLASS}
                onChange={(event) => setDraft({ ...draft, organizationName: event.target.value })}
              />
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
                الفرع / الوحدة *
              </Label>
              <Input
                value={draft.organizationUnit}
                placeholder="مثال: الفرع الرئيسي"
                className={FIELD_CLASS}
                onChange={(event) => setDraft({ ...draft, organizationUnit: event.target.value })}
              />
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
                عنوان الجهاز/الفرع *
              </Label>
              <Input
                value={draft.location}
                className={FIELD_CLASS}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              />
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
                النشاط التجاري *
              </Label>
              <Input
                value={draft.industry}
                placeholder="مثال: تجزئة، مطاعم"
                className={FIELD_CLASS}
                onChange={(event) => setDraft({ ...draft, industry: event.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="flex-row items-center gap-2.5 border-t border-[#eef2f8] pt-4">
            <Button
              variant="outline"
              className="h-11 w-28 shrink-0 rounded-[10px] border-[#e8edf3] text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:bg-[#f7f9fc] hover:text-[#0d1b3e]"
              disabled={busyId === "new"}
              onClick={() => setCreating(false)}
            >
              إلغاء
            </Button>
            <Button
              className="h-11 flex-1 gap-2 rounded-[10px] bg-[#2878ff] text-[13px] font-bold text-white hover:bg-[#1f66e0]"
              disabled={busyId === "new"}
              onClick={() => void submitCreate()}
            >
              {busyId === "new" ? <Loader2 className="size-4 animate-spin" /> : null}
              {busyId === "new" ? "جارٍ الإنشاء..." : "إنشاء الجهاز"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
