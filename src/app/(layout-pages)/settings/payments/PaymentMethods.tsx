"use client"

// طرق الدفع -- which ways this branch takes money, and what each one costs it.
//
// The list is the built-in catalogue with the branch's overrides applied, so a new organization
// sees every method it could switch on without anything being seeded. A row the branch has not
// touched is marked, because a fee it has never confirmed is a placeholder rather than the rate
// its provider actually charges.

import { useCallback, useEffect, useState } from "react"
import {
  Banknote,
  Building2,
  CalendarClock,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Info,
  Loader2,
  MoreVertical,
  Plus,
  RotateCcw,
  Settings2,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import {
  posPaymentMethodsService,
  type PaymentKind,
  type PaymentMethod,
} from "@/features/pos/services/pos-payment-methods.service"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#E8EBF0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#98A2B3]"

// An icon per settlement kind rather than a brand mark: the repo carries no mada/visa/tabby
// artwork, and drawing an approximation of someone's logo is worse than an honest symbol.
const KIND_MARK: Record<PaymentKind, { icon: LucideIcon; tint: string }> = {
  cash: { icon: Banknote, tint: "bg-[#e4f7ec] text-[#1f9d55]" },
  card: { icon: CreditCard, tint: "bg-[#eef4ff] text-[#2878ff]" },
  wallet: { icon: Smartphone, tint: "bg-[#efe9ff] text-[#8b5cf6]" },
  transfer: { icon: Building2, tint: "bg-[#e2f6f4] text-[#12a594]" },
  bnpl: { icon: CalendarClock, tint: "bg-[#fff3dc] text-[#e08b00]" },
}

const KIND_LABEL: Record<PaymentKind, string> = {
  cash: "نقدي",
  card: "بطاقة",
  wallet: "محفظة رقمية",
  transfer: "تحويل بنكي",
  bnpl: "دفع لاحق",
}

const NOTES = [
  "يمكنك تفعيل أو إيقاف أي طريقة دفع حسب احتياجات فرعك.",
  "قد تختلف رسوم المعاملة حسب اتفاقك مع مزود الخدمة.",
  "تأكد من ضبط إعدادات الأجهزة لربط أجهزة الدفع (مثل أجهزة مدى).",
]

const ADD_NOTES = [
  "تأكد من صحة بيانات الربط قبل التفعيل.",
  "قد تختلف رسوم المعاملة حسب مزود الخدمة.",
  "يمكنك تعديل الإعدادات لاحقاً من صفحة طرق الدفع.",
]

const PERCENT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

// Quick-fill tiles for the add-method dialog -- picking one presets the kind and a starting
// name/subtitle, which the fields below stay fully editable after. Icons are the same per-kind
// marks the table already uses (see KIND_MARK's own note): no mada/STC/Apple artwork exists in
// this repo, so brand-distinct tiles fall back to sharing their kind's generic icon rather than
// an invented logo.
interface PaymentPreset {
  key: string
  kind: PaymentKind
  label: string
  tileSubtitle: string
  name: string
  description: string
}

const PAYMENT_PRESETS: PaymentPreset[] = [
  {
    key: "cash",
    kind: "cash",
    label: "دفع نقدي",
    tileSubtitle: "المدفوعات النقدية",
    name: "نقدي",
    description: "الدفع النقدي عند الاستلام",
  },
  {
    key: "transfer",
    kind: "transfer",
    label: "تحويل بنكي",
    tileSubtitle: "تحويل مباشر",
    name: "تحويل بنكي",
    description: "الدفع عبر التحويل البنكي المباشر",
  },
  {
    key: "mada",
    kind: "card",
    label: "مدى",
    tileSubtitle: "بطاقات مدى",
    name: "مدى",
    description: "الدفع باستخدام بطاقات مدى البنكية",
  },
  {
    key: "stc_pay",
    kind: "wallet",
    label: "STC Pay",
    tileSubtitle: "الدفع عبر STC Pay",
    name: "STC Pay",
    description: "الدفع عبر تطبيق STC Pay",
  },
  {
    key: "apple_pay",
    kind: "wallet",
    label: "Apple Pay",
    tileSubtitle: "الدفع عبر آبل باي",
    name: "Apple Pay",
    description: "الدفع عبر Apple Pay",
  },
  {
    key: "card",
    kind: "card",
    label: "بطاقة بنكية",
    tileSubtitle: "مدى، فيزا، ماستركارد",
    name: "",
    description: "",
  },
]

// The dialog never asks for a technical code -- one is derived from the name so the field list
// matches the design exactly. Arabic (or any non-ASCII) collapses to nothing, so the fallback and
// a random suffix are what actually keep it unique and non-empty, not the name itself.
function generateMethodCode(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base || "method"}_${suffix}`
}

const EMPTY_CUSTOM = {
  presetKey: "card",
  name: "",
  subtitle: "",
  kind: "card" as PaymentKind,
  enabled: true,
  feePercent: "0",
  merchantId: "",
  apiKey: "",
}

function buildEditDraft(method: PaymentMethod | null) {
  return {
    name: method?.name ?? "",
    subtitle: method?.subtitle ?? "",
    enabled: method?.enabled ?? true,
    feePercent: method ? String(method.feePercent) : "0",
    merchantId: method?.merchantId ?? "",
    apiKey: method?.apiKey ?? "",
  }
}

export default function PaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyCode, setBusyCode] = useState<string | null>(null)

  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [editDraft, setEditDraft] = useState(buildEditDraft(null))
  const [editApiKeyVisible, setEditApiKeyVisible] = useState(false)
  const [creating, setCreating] = useState(false)
  const [custom, setCustom] = useState(EMPTY_CUSTOM)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PaymentMethod | null>(null)

  const openSettings = (method: PaymentMethod) => {
    setEditing(method)
    setEditDraft(buildEditDraft(method))
    setEditApiKeyVisible(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setMethods(await posPaymentMethodsService.list())
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(
        status === 403 ? "لا تملك صلاحية عرض طرق الدفع." : "تعذر تحميل طرق الدفع. حاول مرة أخرى."
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
    toast.error(status === 403 ? "لا تملك صلاحية تعديل طرق الدفع." : fallback, {
      description: status === 403 ? "تواصل مع مالك الحساب لمنحك صلاحية pos:manage." : undefined,
    })
  }

  const toggle = async (method: PaymentMethod, enabled: boolean) => {
    setBusyCode(method.code)
    // Applied optimistically: a switch that waits for a round trip before moving feels broken,
    // and the response replaces the whole list either way.
    setMethods((current) =>
      current.map((entry) => (entry.code === method.code ? { ...entry, enabled } : entry))
    )
    try {
      setMethods(
        await posPaymentMethodsService.save(method.code, {
          enabled,
          feePercent: method.feePercent,
          merchantId: method.merchantId,
          apiKey: method.apiKey,
        })
      )
    } catch (error) {
      setMethods((current) =>
        current.map((entry) =>
          entry.code === method.code ? { ...entry, enabled: !enabled } : entry
        )
      )
      failed(error, "تعذر تغيير حالة طريقة الدفع.")
    } finally {
      setBusyCode(null)
    }
  }

  const saveSettings = async () => {
    if (!editing) return

    const parsed = Number(editDraft.feePercent)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("أدخل نسبة رسوم بين 0 و 100.")
      return
    }
    if (editing.isCustom && !editDraft.name.trim()) {
      toast.error("أدخل اسم طريقة الدفع.")
      return
    }

    setBusyCode(editing.code)
    try {
      setMethods(
        await posPaymentMethodsService.save(editing.code, {
          enabled: editDraft.enabled,
          feePercent: parsed,
          merchantId: editDraft.merchantId.trim() || null,
          apiKey: editDraft.apiKey.trim() || null,
          // A catalogue entry's name/subtitle are fixed wording -- see save()'s own note -- so
          // sending them for one would just be ignored server-side, but only a custom method's
          // form even shows these fields to begin with.
          ...(editing.isCustom
            ? { name: editDraft.name.trim(), subtitle: editDraft.subtitle.trim() || null }
            : {}),
        })
      )
      toast.success("تم حفظ إعدادات طريقة الدفع.")
      setEditing(null)
    } catch (error) {
      failed(error, "تعذر حفظ الإعدادات.")
    } finally {
      setBusyCode(null)
    }
  }

  const createCustom = async () => {
    const parsed = Number(custom.feePercent)
    if (!custom.name.trim()) {
      toast.error("أدخل اسم طريقة الدفع.")
      return
    }
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("أدخل نسبة رسوم بين 0 و 100.")
      return
    }

    setBusyCode("new")
    try {
      setMethods(
        await posPaymentMethodsService.createCustom({
          code: generateMethodCode(custom.name),
          name: custom.name.trim(),
          subtitle: custom.subtitle.trim() || null,
          kind: custom.kind,
          enabled: custom.enabled,
          feePercent: parsed,
          merchantId: custom.merchantId.trim() || null,
          apiKey: custom.apiKey.trim() || null,
        })
      )
      toast.success("تمت إضافة طريقة الدفع.")
      setCreating(false)
      setCustom(EMPTY_CUSTOM)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      if (status === 409) {
        toast.error("طريقة بهذا الاسم موجودة بالفعل.", { description: "جرّب اسماً مختلفاً." })
      } else {
        failed(error, "تعذر إضافة طريقة الدفع.")
      }
    } finally {
      setBusyCode(null)
    }
  }

  const remove = async () => {
    if (!pendingDelete?.id) return

    setBusyCode(pendingDelete.code)
    try {
      await posPaymentMethodsService.remove(pendingDelete.id)
      toast.success("تم حذف طريقة الدفع.", { description: pendingDelete.name })
      setPendingDelete(null)
      setMethods(await posPaymentMethodsService.list())
    } catch (error) {
      failed(error, "تعذر حذف طريقة الدفع.")
    } finally {
      setBusyCode(null)
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل طرق الدفع...
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
    <div className="flex flex-col gap-5">
      {/* RTL: the copy is written first so the icon tile lands on its left, and the action falls
          to the far left of the row. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>طرق الدفع</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>إدارة طرق الدفع المتاحة في نقطة البيع</p>
        </div>

        <Button
          className="h-auto gap-2 rounded-[10px] bg-[#2563eb] px-[18px] py-2.5 text-[13px] font-bold text-white hover:bg-[#1d4ed8]"
          onClick={() => setCreating(true)}
        >
          <Plus className="size-4" />
          إضافة طريقة دفع
        </Button>
      </div>

      <section className={cn(PANEL, "overflow-hidden")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-center">
            <thead>
              <tr className="bg-[#f1f5fc]">
                {[
                  { key: "method", label: "طريقة الدفع", align: "text-right" },
                  { key: "status", label: "الحالة", align: "text-center" },
                  { key: "settings", label: "الإعدادات", align: "text-center" },
                  { key: "fee", label: "رسوم المعاملة", align: "text-center" },
                  { key: "actions", label: "الإجراءات", align: "text-center" },
                ].map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      "whitespace-nowrap border-b border-[#e8edf3] px-[18px] py-[13px] text-[12px] font-semibold",
                      MUTED,
                      column.align
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {methods.map((method, index) => {
                const mark = KIND_MARK[method.kind]
                const busy = busyCode === method.code

                return (
                  <tr
                    key={method.code}
                    className={cn(
                      "border-b border-[#eef2f8] last:border-b-0",
                      index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                    )}
                  >
                    {/* RTL: the mark is written first so it lands to the right of the name. */}
                    <td className="px-[18px] py-4 text-right">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-[12px]",
                            mark.tint
                          )}
                        >
                          <mark.icon className="size-[20px]" />
                        </span>
                        <div className="min-w-0">
                          <p className={cn("truncate text-[13.5px] font-bold", HEADING)}>
                            {method.name}
                          </p>
                          <p className={cn("mt-0.5 truncate text-[12px]", MUTED)}>
                            {method.subtitle || KIND_LABEL[method.kind]}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-[18px] py-4">
                      <Switch
                        checked={method.enabled}
                        disabled={busy}
                        aria-label={method.name}
                        onCheckedChange={(next) => void toggle(method, next)}
                        className="h-6 w-11 data-[state=checked]:bg-[#2563eb] [&>span]:size-5"
                      />
                    </td>

                    <td className="px-[18px] py-4">
                      <Button
                        variant="outline"
                        className="h-auto gap-1.5 rounded-[8px] border-[#e8edf3] px-3 py-1.5 text-[12px] font-medium text-[#334155] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                        onClick={() => openSettings(method)}
                      >
                        <Settings2 className="size-3.5" />
                        إعدادات
                      </Button>
                    </td>

                    <td className="px-[18px] py-4">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2.5 py-1 text-[13px] font-bold",
                          method.feePercent === 0
                            ? "bg-[#f1f5f9] text-[#667085]"
                            : cn("bg-[#eff6ff]", HEADING)
                        )}
                      >
                        {PERCENT.format(method.feePercent)}%
                      </span>
                      {/* A fee nobody has confirmed is a placeholder, not the provider's rate. */}
                      {!method.configured ? (
                        <span className="mt-0.5 block text-[10px] text-[#98A2B3]">غير مؤكدة</span>
                      ) : null}
                    </td>

                    <td className="px-[18px] py-4">
                      <RowActions
                        method={method}
                        busy={busy}
                        onSettings={() => openSettings(method)}
                        onDelete={() => setPendingDelete(method)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* RTL: the icon is written first so it lands to the right of the heading. */}
      <section className="rounded-[12px] border border-[#c7d9ff] bg-[#eff6ff] px-[18px] py-4">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-[#2563eb] text-white">
            <Info className="size-3" />
          </span>
          <h2 className={cn("text-[13px] font-bold", HEADING)}>معلومات مهمة</h2>
        </div>
        <ul className="flex flex-col gap-1.5">
          {NOTES.map((note) => (
            <li key={note} className="flex gap-2 text-[12.5px] leading-[1.6] text-[#334155]">
              <span className="mt-[7px] size-[5px] shrink-0 rounded-full bg-[#2563eb]" />
              {note}
            </li>
          ))}
        </ul>
      </section>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            setEditApiKeyVisible(false)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[36rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              إعدادات {editing?.name}
            </DialogTitle>
            <DialogDescription className={cn("text-[12px]", MUTED)}>
              {editing?.isCustom
                ? "طريقة الدفع الخاصة بفرعك -- يمكنك تعديل بياناتها بالكامل"
                : "رسوم المعاملة وبيانات الربط التي يخصمها مزود الخدمة من كل عملية"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {editing?.isCustom ? (
              <>
                <div>
                  <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                    اسم طريقة الدفع <span className="text-[#e0484d]">*</span>
                  </Label>
                  <Input
                    value={editDraft.name}
                    aria-label="اسم طريقة الدفع"
                    className={FIELD_CLASS}
                    onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                  />
                </div>
                <div>
                  <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                    الوصف (اختياري)
                  </Label>
                  <Input
                    value={editDraft.subtitle}
                    aria-label="وصف طريقة الدفع"
                    maxLength={200}
                    className={FIELD_CLASS}
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, subtitle: event.target.value })
                    }
                  />
                </div>
              </>
            ) : null}

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                الحالة
              </Label>
              <div className="flex h-11 items-center gap-2.5">
                <Switch
                  checked={editDraft.enabled}
                  onCheckedChange={(enabled) => setEditDraft({ ...editDraft, enabled })}
                  className="data-[state=checked]:bg-[#1f9d55]"
                />
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    editDraft.enabled
                      ? "bg-[#e4f7ec] text-[#1f9d55]"
                      : "bg-[#F2F5FA] text-[#667085]"
                  )}
                >
                  {editDraft.enabled ? (
                    <>
                      <Check className="size-3" strokeWidth={3} />
                      مفعل
                    </>
                  ) : (
                    "معطل"
                  )}
                </span>
              </div>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                رسوم المعاملة (%)
              </Label>
              {/* RTL: the field is written first so the unit chip sits on its left. */}
              <div className="flex overflow-hidden rounded-[12px] border border-[#E8EBF0] bg-white">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={editDraft.feePercent}
                  aria-label="رسوم المعاملة"
                  className="h-11 rounded-none border-0 bg-transparent text-[13px] focus-visible:ring-0"
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, feePercent: event.target.value })
                  }
                />
                <span
                  className={cn(
                    "flex w-12 shrink-0 items-center justify-center border-s border-[#E8EBF0] bg-[#F7F9FC] text-[12px] font-semibold",
                    MUTED
                  )}
                >
                  %
                </span>
              </div>
              <p className={cn("mt-1.5 text-[10.5px]", MUTED)}>
                اتركها 0 إذا لم يكن هناك رسوم على هذه الطريقة
              </p>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                رقم الحساب التجاري (Merchant ID)
              </Label>
              <Input
                value={editDraft.merchantId}
                aria-label="رقم الحساب التجاري"
                className={cn(FIELD_CLASS, "[direction:ltr]")}
                onChange={(event) => setEditDraft({ ...editDraft, merchantId: event.target.value })}
              />
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                مفتاح API (اختياري)
              </Label>
              <div className="relative">
                <button
                  type="button"
                  aria-label={editApiKeyVisible ? "إخفاء مفتاح API" : "إظهار مفتاح API"}
                  onClick={() => setEditApiKeyVisible((value) => !value)}
                  className="absolute inset-y-0 start-3 flex items-center text-[#98A2B3] hover:text-[#0b1738]"
                >
                  {editApiKeyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <Input
                  type={editApiKeyVisible ? "text" : "password"}
                  value={editDraft.apiKey}
                  aria-label="مفتاح API"
                  className={cn(FIELD_CLASS, "ps-9 [direction:ltr]")}
                  onChange={(event) => setEditDraft({ ...editDraft, apiKey: event.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="bg-[#2878ff] text-white hover:bg-[#1f66e0]"
              disabled={busyCode !== null}
              onClick={() => void saveSettings()}
            >
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false)
            setCustom(EMPTY_CUSTOM)
            setApiKeyVisible(false)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[44rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[16px] font-extrabold", HEADING)}>
              إضافة طريقة دفع جديدة
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px]", MUTED)}>
              اختر طريقة الدفع وقم بإعداد البيانات المطلوبة
            </DialogDescription>
          </DialogHeader>

          {/* Preset tiles */}
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {PAYMENT_PRESETS.map((preset) => {
              const selected = preset.key === custom.presetKey
              const mark = KIND_MARK[preset.kind]
              const Icon = mark.icon
              return (
                <button
                  key={preset.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setCustom((prev) => ({
                      ...prev,
                      presetKey: preset.key,
                      kind: preset.kind,
                      name: preset.name,
                      subtitle: preset.description,
                    }))
                  }
                  className={cn(
                    "relative flex flex-col items-center gap-1.5 rounded-[14px] border p-3 text-center transition-colors",
                    selected
                      ? "border-[#2878ff] bg-[#f5f8ff]"
                      : "border-[#E8EBF0] bg-white hover:border-[#c7d9ff]"
                  )}
                >
                  {selected ? (
                    <span className="absolute start-2 top-2 flex size-4 items-center justify-center rounded-full bg-[#2878ff] text-white">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-[10px]",
                      mark.tint
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className={cn("text-[12px] font-bold", HEADING)}>{preset.label}</span>
                  <span className={cn("text-[10px] leading-tight", MUTED)}>
                    {preset.tileSubtitle}
                  </span>
                </button>
              )
            })}
          </div>

          {/* معلومات طريقة الدفع */}
          <div className="border-t border-[#EEF1F6] pt-4">
            <h3 className={cn("mb-3 text-[13.5px] font-extrabold", HEADING)}>
              معلومات طريقة الدفع
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  اسم طريقة الدفع <span className="text-[#e0484d]">*</span>
                </Label>
                <Input
                  value={custom.name}
                  aria-label="اسم طريقة الدفع"
                  placeholder="مثال: مدى"
                  className={FIELD_CLASS}
                  onChange={(event) => setCustom({ ...custom, name: event.target.value })}
                />
                <p className={cn("mt-1.5 text-[10.5px]", MUTED)}>سيظهر هذا الاسم في شاشة الدفع</p>
              </div>

              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  الوصف (اختياري)
                </Label>
                <Input
                  value={custom.subtitle}
                  aria-label="وصف طريقة الدفع"
                  maxLength={200}
                  placeholder="مثال: الدفع باستخدام بطاقات مدى البنكية"
                  className={FIELD_CLASS}
                  onChange={(event) => setCustom({ ...custom, subtitle: event.target.value })}
                />
                <p className={cn("mt-1.5 text-left text-[10.5px]", MUTED)}>
                  {custom.subtitle.length}/200
                </p>
              </div>

              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  الحالة
                </Label>
                <div className="flex h-11 items-center gap-2.5">
                  <Switch
                    checked={custom.enabled}
                    onCheckedChange={(enabled) => setCustom({ ...custom, enabled })}
                    className="data-[state=checked]:bg-[#1f9d55]"
                  />
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      custom.enabled ? "bg-[#e4f7ec] text-[#1f9d55]" : "bg-[#F2F5FA] text-[#667085]"
                    )}
                  >
                    {custom.enabled ? (
                      <>
                        <Check className="size-3" strokeWidth={3} />
                        مفعل
                      </>
                    ) : (
                      "معطل"
                    )}
                  </span>
                </div>
                <p className={cn("mt-1.5 text-[10.5px]", MUTED)}>
                  سيتم إظهار هذه الطريقة في شاشة الدفع
                </p>
              </div>

              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  رسوم المعاملة (%)
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-[12px] text-[#98A2B3]">
                    %
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={custom.feePercent}
                    aria-label="رسوم المعاملة للطريقة الجديدة"
                    className={cn(FIELD_CLASS, "ps-7")}
                    onChange={(event) => setCustom({ ...custom, feePercent: event.target.value })}
                  />
                </div>
                <p className={cn("mt-1.5 text-[10.5px]", MUTED)}>
                  نسبة الرسوم التي تضاف على كل عملية دفع
                </p>
              </div>
            </div>
          </div>

          {/* إعدادات إضافية */}
          <div className="border-t border-[#EEF1F6] pt-4">
            <h3 className={cn("mb-3 text-[13.5px] font-extrabold", HEADING)}>إعدادات إضافية</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  رقم الحساب التجاري (Merchant ID)
                </Label>
                <Input
                  value={custom.merchantId}
                  aria-label="رقم الحساب التجاري"
                  placeholder="12345678"
                  className={cn(FIELD_CLASS, "[direction:ltr]")}
                  onChange={(event) => setCustom({ ...custom, merchantId: event.target.value })}
                />
                <p className={cn("mt-1.5 text-[10.5px]", MUTED)}>
                  يمكنك الحصول على رقم الحساب من مزود الخدمة
                </p>
              </div>

              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  مفتاح API (اختياري)
                </Label>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={apiKeyVisible ? "إخفاء مفتاح API" : "إظهار مفتاح API"}
                    onClick={() => setApiKeyVisible((value) => !value)}
                    className="absolute inset-y-0 start-3 flex items-center text-[#98A2B3] hover:text-[#0b1738]"
                  >
                    {apiKeyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <Input
                    type={apiKeyVisible ? "text" : "password"}
                    value={custom.apiKey}
                    aria-label="مفتاح API"
                    className={cn(FIELD_CLASS, "ps-9 [direction:ltr]")}
                    onChange={(event) => setCustom({ ...custom, apiKey: event.target.value })}
                  />
                </div>
                <p className={cn("mt-1.5 text-[10.5px]", MUTED)}>يستخدم للربط مع مزود الخدمة</p>
              </div>
            </div>
          </div>

          {/* ملاحظات مهمة */}
          <div className="rounded-[14px] bg-[#f5f8ff] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Info className="size-4 text-[#2878ff]" />
              <span className={cn("text-[12.5px] font-extrabold", "text-[#2878ff]")}>
                ملاحظات مهمة
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {ADD_NOTES.map((note) => (
                <li
                  key={note}
                  className={cn("flex items-start gap-2 text-[12px] leading-6", MUTED)}
                >
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-[#98A2B3]" />
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="gap-1.5 bg-[#2878ff] text-white hover:bg-[#1f66e0]"
              disabled={busyCode !== null}
              onClick={() => void createCustom()}
            >
              <Plus className="size-4" />
              إضافة طريقة الدفع
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false)
                setCustom(EMPTY_CUSTOM)
                setApiKeyVisible(false)
              }}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              حذف طريقة الدفع؟
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              سيتم حذف <span className={cn("font-bold", HEADING)}>{pendingDelete?.name}</span> من
              طرق الدفع المتاحة في نقطة البيع.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              className="bg-[#e0484d] text-white hover:bg-[#c93f44]"
              disabled={busyCode !== null}
              onClick={() => void remove()}
            >
              حذف
            </Button>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RowActions({
  method,
  busy,
  onSettings,
  onDelete,
}: {
  method: PaymentMethod
  busy: boolean
  onSettings: () => void
  onDelete: () => void
}) {
  // Radix releases its pointer-events lock as the menu closes; opening a dialog in the same tick
  // mounts it under that lock and freezes the page. preventDefault must not be used on onSelect
  // -- it suppresses the close itself.
  const afterClose = (action: () => void) => () => setTimeout(action, 0)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`إجراءات ${method.name}`}
          disabled={busy}
          className="mx-auto flex size-8 cursor-pointer items-center justify-center rounded-lg text-[#98A2B3] transition-colors hover:bg-[#F2F5FA] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-[12px] [direction:rtl]">
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          onSelect={afterClose(onSettings)}
        >
          <Settings2 className="size-4" />
          تعديل الرسوم
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px] text-[#e0484d] focus:text-[#e0484d]"
          // A built-in method is disabled rather than deleted -- it still exists as a way to
          // pay, this branch just does not take it.
          disabled={!method.isCustom}
          title={method.isCustom ? undefined : "الطرق المدمجة تُوقف بدل حذفها"}
          onSelect={afterClose(onDelete)}
        >
          <Trash2 className="size-4" />
          حذف الطريقة
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
