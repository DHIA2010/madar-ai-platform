"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  Banknote,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileDown,
  FileText,
  Landmark,
  Layers,
  Loader2,
  Mail,
  Paperclip,
  Phone,
  Printer,
  RotateCcw,
  ShoppingBag,
  Wallet,
  X,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDateField,
  AppDateRangeFilter,
  AppDialog,
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useCustomer } from "../hooks"
import { customerListService } from "../services/customer-list.service"
import type {
  AccountStatement,
  AccountTransaction,
  AccountTransactionType,
  CreateAccountTransactionInput,
  CustomerSegment,
} from "../types"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
const PAGE_SIZE = 10

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
function formatAmount(value: number): string {
  return `${AMOUNT_FORMAT.format(value)} ر.س`
}

const DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
})
function formatDate(value: string | null): string {
  return value ? DATE_FORMAT.format(new Date(value)) : "—"
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})
function formatDateTime(value: string): string {
  return DATE_TIME_FORMAT.format(new Date(value))
}

const SEGMENT_META: Record<CustomerSegment, { label: string; bg: string; text: string }> = {
  VIP: { label: "VIP", bg: "bg-[#f5f0ff]", text: "text-[#7c3aed]" },
  Loyal: { label: "دائم", bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  "One Time": { label: "لمرة واحدة", bg: "bg-[#f4f6fa]", text: "text-[#5b6b85]" },
  New: { label: "جديد", bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
}

// A method-code -> name lookup is loaded lazily on demand from the real POS payment-methods
// catalog (the same source of truth CashierPage uses), so a receipt's description reads
// honestly ("شحن المحفظة عبر تحويل بنكي") instead of a raw code.
type MethodNameMap = Record<string, string>

// A real payment method eligible to fund a receipt/payment -- only the code/name/kind this
// dialog actually needs, fetched lazily from the same POS payment-methods catalog as
// methodNames.
interface AccountMethodOption {
  code: string
  name: string
  kind: string
  enabled: boolean
}

// Same rate as src/features/pos/services/pos-invoices.service.ts's VAT_RATE -- duplicated rather
// than statically imported, matching this file's existing dynamic-only coupling to the POS
// feature (see the payment-methods import below).
const VAT_RATE = 0.15

const TRANSACTION_TYPE_META: Record<
  AccountTransactionType,
  {
    label: string
    verb: string
    icon: typeof ArrowDownCircle
    color: string
    bg: string
    direction: 1 | -1
  }
> = {
  receipt: {
    label: "سند قبض",
    verb: "قبض",
    icon: ArrowDownCircle,
    color: "#16a34a",
    bg: "#f0fdf4",
    direction: 1,
  },
  payment: {
    label: "سند صرف",
    verb: "صرف",
    icon: ArrowUpCircle,
    color: "#dc2626",
    bg: "#fef2f2",
    direction: -1,
  },
  sale: {
    label: "فاتورة بيع",
    verb: "بيع",
    icon: ShoppingBag,
    color: "#dc2626",
    bg: "#fef2f2",
    direction: -1,
  },
  return: {
    label: "إرجاع فاتورة",
    verb: "إرجاع",
    icon: RotateCcw,
    color: "#16a34a",
    bg: "#f0fdf4",
    direction: 1,
  },
}

const TRANSACTION_TYPE_OPTIONS: AppSearchableSelectOption[] = [
  { value: "all", label: "جميع العمليات" },
  ...(Object.keys(TRANSACTION_TYPE_META) as AccountTransactionType[]).map((type) => ({
    value: type,
    label: TRANSACTION_TYPE_META[type].label,
    icon: TRANSACTION_TYPE_META[type].icon,
    tint: `bg-[${TRANSACTION_TYPE_META[type].bg}] text-[${TRANSACTION_TYPE_META[type].color}]`,
  })),
]

const PAYMENT_METHOD_KIND_ICON: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
  wallet: Wallet,
}

// A receipt covers real money physically handed over or transferred, same as it used to fund a
// wallet top-up -- "wallet"-kind methods (Apple Pay/STC Pay) are included here. A payment
// voucher is the business handing money out through a real channel -- "wallet" methods are
// customer-facing collection channels, not something the business pays out through.
const RECEIPT_ELIGIBLE_KINDS = new Set(["cash", "card", "transfer", "wallet"])
const PAYMENT_ELIGIBLE_KINDS = new Set(["cash", "card", "transfer"])

const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const ALLOWED_ATTACHMENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"])

function fileToAttachment(file: File): Promise<{ contentType: string; dataBase64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? "")
      resolve({ contentType: file.type, dataBase64: result.split(",")[1] ?? "" })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function describeTransaction(transaction: AccountTransaction, methodNames: MethodNameMap): string {
  if (transaction.type === "receipt" || transaction.type === "payment") {
    const methodName = transaction.paymentMethodCode
      ? (methodNames[transaction.paymentMethodCode] ?? transaction.paymentMethodCode)
      : "غير محدد"
    return transaction.type === "receipt" ? `مقبوض عبر ${methodName}` : `مصروف عبر ${methodName}`
  }
  if (transaction.type === "sale") {
    return transaction.invoiceNumber ? `فاتورة بيع ${transaction.invoiceNumber}` : "فاتورة بيع"
  }
  return transaction.invoiceNumber ? `إرجاع فاتورة ${transaction.invoiceNumber}` : "إرجاع فاتورة"
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-[#e8edf3] bg-white p-4">
      <div className="text-right">
        <p className={cn("text-[11px] font-semibold", MUTED)}>{label}</p>
        <p className="mt-1 text-[20px] font-extrabold" style={{ color: tone }}>
          {value}
        </p>
      </div>
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-[12px]"
        style={{ backgroundColor: `${tone}1a`, color: tone }}
      >
        <Icon className="size-5" />
      </span>
    </div>
  )
}

// The full (unpaginated, currently-filtered) transaction table -- shared by the print-only view
// and the PDF export tree, since both need the same "every row, no on-screen chrome" rendering
// rather than the live table's paginated slice. `canvasText` marks every cell with
// data-canvas-text: only the PDF export rasterizes this via html2canvas (which mis-renders mixed
// Arabic/Latin-digit content like these amounts and dates unless routed through the manual
// fillText redraw in handleExportPdf below) -- native browser printing has no such bug, so the
// print tree renders plain text.
function StatementTable({
  transactions,
  methodNames,
  canvasText = false,
}: {
  transactions: AccountTransaction[]
  methodNames: MethodNameMap
  canvasText?: boolean
}) {
  return (
    <table className="w-full text-right" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr className="border-b border-[#e1e7f0] text-[11px] font-semibold text-[#5b6b85]">
          <th className="px-3 py-2">#</th>
          <th className="px-3 py-2">المرجع</th>
          <th className="px-3 py-2">نوع العملية</th>
          <th className="px-3 py-2">الوصف</th>
          <th className="px-3 py-2">المبلغ</th>
          <th className="px-3 py-2">الرصيد بعد العملية</th>
          <th className="px-3 py-2">التاريخ والوقت</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction, index) => {
          const meta = TRANSACTION_TYPE_META[transaction.type]
          return (
            <tr key={transaction.id} className="border-b border-[#f1f4f9] text-[12px]">
              <td className="px-3 py-2 text-[#5b6b85]">{index + 1}</td>
              <td
                {...(canvasText ? { "data-canvas-text": true } : {})}
                className="px-3 py-2 font-mono text-[11px] text-[#0d1b3e]"
              >
                {transaction.reference}
              </td>
              <td
                {...(canvasText ? { "data-canvas-text": true } : {})}
                className="px-3 py-2"
                style={{ color: meta.color }}
              >
                {meta.verb}
              </td>
              <td
                {...(canvasText ? { "data-canvas-text": true } : {})}
                className="px-3 py-2 text-[#5b6b85]"
              >
                {describeTransaction(transaction, methodNames)}
              </td>
              <td
                {...(canvasText ? { "data-canvas-text": true } : {})}
                className="px-3 py-2 font-bold"
                style={{ color: meta.color }}
              >
                {meta.direction > 0 ? "+" : "-"}
                {formatAmount(transaction.amount)}
              </td>
              <td
                {...(canvasText ? { "data-canvas-text": true } : {})}
                className="px-3 py-2 font-semibold text-[#0d1b3e]"
              >
                {formatAmount(transaction.balanceAfter)}
              </td>
              <td
                {...(canvasText ? { "data-canvas-text": true } : {})}
                className="px-3 py-2 text-[#5b6b85]"
              >
                {formatDateTime(transaction.createdAt)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function CustomerStatement({ customerId }: { customerId: string }) {
  const { currentOrganization } = useWorkspace()
  const {
    customer,
    isLoading: isCustomerLoading,
    error: customerError,
    refetch: refetchCustomer,
  } = useCustomer(customerId)

  const [statement, setStatement] = useState<AccountStatement | null>(null)
  const [isStatementLoading, setIsStatementLoading] = useState(true)
  const [statementError, setStatementError] = useState<string | null>(null)
  // The real, currently-configured POS payment method catalog (every method, not just enabled
  // ones) -- used to translate any historical paymentMethodCode into a human name.
  const [paymentMethods, setPaymentMethods] = useState<AccountMethodOption[]>([])
  const methodNames: MethodNameMap = useMemo(() => {
    const map: MethodNameMap = {}
    for (const method of paymentMethods) map[method.code] = method.name
    return map
  }, [paymentMethods])

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [transactionType, setTransactionType] = useState<AccountTransactionType | "all">("all")
  const [page, setPage] = useState(1)

  // The organization's real configured tax rate (Settings -> الضرائب), not the hardcoded 15%
  // VAT_RATE fallback below -- a manually-recorded receipt/payment voucher's own tax breakdown
  // should match the same rate a real POS sale would use. Dynamic import, same as the
  // payment-methods fetch above, to avoid a static cross-feature import into @/features/pos.
  const [vatRate, setVatRate] = useState(VAT_RATE)
  useEffect(() => {
    let cancelled = false
    import("@/features/pos/services/tax-rates.service")
      .then(({ taxRatesService }) => taxRatesService.getDefaultRate())
      .then((rate) => {
        if (!cancelled) setVatRate(rate)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const refetchStatement = useCallback(() => {
    setIsStatementLoading(true)
    setStatementError(null)
    return customerListService
      .getAccountStatement(customerId, {
        from: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
        to: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
        type: transactionType === "all" ? undefined : transactionType,
      })
      .then(setStatement)
      .catch(() => setStatementError("تعذر تحميل كشف الحساب. حاول مرة أخرى."))
      .finally(() => setIsStatementLoading(false))
  }, [customerId, dateRange, transactionType])

  useEffect(() => {
    void refetchStatement()
  }, [refetchStatement])

  useEffect(() => {
    let cancelled = false
    import("@/features/pos/services/pos-payment-methods.service")
      .then(({ posPaymentMethodsService }) => posPaymentMethodsService.list())
      .then((methods) => {
        if (cancelled) return
        setPaymentMethods(
          methods.map((method) => ({
            code: method.code,
            name: method.name,
            kind: method.kind,
            enabled: method.enabled,
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setPaymentMethods([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // --- Receipt / payment voucher dialog (سند قبض / سند صرف) ---------------------------------

  const [dialogType, setDialogType] = useState<"receipt" | "payment" | null>(null)
  const [amount, setAmount] = useState("")
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [paymentMethodCode, setPaymentMethodCode] = useState("")
  // Defaults to today but stays editable -- e.g. to backdate a receipt collected earlier and only
  // entered into the system now.
  const [transactionDate, setTransactionDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [notes, setNotes] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const eligibleMethods = useMemo(() => {
    const allowedKinds = dialogType === "payment" ? PAYMENT_ELIGIBLE_KINDS : RECEIPT_ELIGIBLE_KINDS
    return paymentMethods.filter((method) => method.enabled && allowedKinds.has(method.kind))
  }, [paymentMethods, dialogType])

  const closeDialog = () => {
    setDialogType(null)
    setAmount("")
    setTaxInclusive(false)
    setPaymentMethodCode("")
    setTransactionDate(format(new Date(), "yyyy-MM-dd"))
    setNotes("")
    setAttachments([])
  }

  const addAttachments = (files: FileList | null) => {
    if (!files) return
    const incoming = Array.from(files)
    const accepted: File[] = []
    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        toast.error(`نوع الملف غير مدعوم: ${file.name}`)
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`الملف كبير جداً (الحد الأقصى 5 ميجابايت): ${file.name}`)
        continue
      }
      accepted.push(file)
    }
    setAttachments((current) => [...current, ...accepted].slice(0, MAX_ATTACHMENTS))
  }

  const submitTransaction = async () => {
    if (!customer || !dialogType) return
    const numericAmount = Math.round((Number(amount) || 0) * 100) / 100
    if (!(numericAmount > 0)) {
      toast.error("أدخل مبلغاً صحيحاً.")
      return
    }
    if (!paymentMethodCode) {
      toast.error("اختر طريقة الدفع.")
      return
    }
    if (!transactionDate) {
      toast.error("اختر تاريخ السند.")
      return
    }

    setIsSaving(true)
    try {
      const uploadedAttachments = await Promise.all(attachments.map(fileToAttachment))
      const taxAmount = taxInclusive
        ? Math.round((numericAmount - numericAmount / (1 + vatRate)) * 100) / 100
        : 0
      const input: CreateAccountTransactionInput = {
        amount: numericAmount,
        taxInclusive,
        taxAmount,
        paymentMethodCode,
        notes: notes.trim() || null,
        attachments: uploadedAttachments,
        transactionDate,
      }
      const updated =
        dialogType === "receipt"
          ? await customerListService.createReceipt(customerId, input)
          : await customerListService.createPayment(customerId, input)

      toast.success(
        `تم حفظ ${TRANSACTION_TYPE_META[dialogType].label}. رصيد العميل الآن ${formatAmount(
          updated.accountBalance ?? 0
        )}.`
      )
      closeDialog()
      void refetchCustomer()
      void refetchStatement()
    } catch {
      toast.error("تعذر حفظ السند.")
    } finally {
      setIsSaving(false)
    }
  }

  const transactions = useMemo(() => statement?.transactions ?? [], [statement])
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginatedTransactions = transactions.slice(pageStart, pageStart + PAGE_SIZE)

  const csvContent = useMemo(() => {
    const header = ["المرجع", "النوع", "الوصف", "المبلغ", "الرصيد بعد العملية", "التاريخ والوقت"]
    const rows = transactions.map((transaction) => [
      transaction.reference,
      TRANSACTION_TYPE_META[transaction.type].verb,
      describeTransaction(transaction, methodNames),
      transaction.amount.toFixed(2),
      transaction.balanceAfter.toFixed(2),
      formatDateTime(transaction.createdAt),
    ])
    return [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
  }, [transactions, methodNames])

  const downloadCsv = () => {
    const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `كشف-حساب-${customer?.name ?? customerId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Splits the full transaction list into groups small enough that each one's rasterized table
  // image always fits within a single PDF page -- mirrors ReportViewerPage's own PDF export
  // capturing one widget at a time rather than an unbounded grid in one shot, for the same reason
  // (a single overlong image would just overflow the page instead of flowing onto a new one).
  const EXPORT_CHUNK_SIZE = 18
  const exportChunks = useMemo(() => {
    const chunks: AccountTransaction[][] = []
    for (let i = 0; i < transactions.length; i += EXPORT_CHUNK_SIZE) {
      chunks.push(transactions.slice(i, i + EXPORT_CHUNK_SIZE))
    }
    return chunks
  }, [transactions])

  const [exportingPdf, setExportingPdf] = useState(false)
  const exportHeaderRef = useRef<HTMLDivElement>(null)
  const exportChunkRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Rasterizes an off-screen tree (statement header + every transaction, none of the page's own
  // header/filters/pagination/action buttons -- and none of the app's sidebar/topbar, which this
  // component never renders in the first place) into a downloadable PDF. Same html2canvas +
  // manual-fillText-redraw pipeline ReportViewerPage's own PDF export already uses and has been
  // verified against real Arabic/mixed-content text -- see its handleExportPdf for the full
  // rationale on every step here.
  const handleExportPdf = async () => {
    if (!customer || exportingPdf) return
    setExportingPdf(true)
    try {
      await Promise.all([new Promise((resolve) => setTimeout(resolve, 300)), document.fonts.ready])

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ])

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const marginMm = 12
      const pageWidthMm = pdf.internal.pageSize.getWidth()
      const pageHeightMm = pdf.internal.pageSize.getHeight()
      const contentWidthMm = pageWidthMm - marginMm * 2
      let cursorYMm = marginMm
      const canvasScale = 2

      const addNode = async (node: HTMLElement) => {
        const textNodes = Array.from(node.querySelectorAll<HTMLElement>("[data-canvas-text]"))
        const textCaptures = textNodes.map((el) => {
          const style = getComputedStyle(el)
          const range = document.createRange()
          range.selectNodeContents(el)
          return {
            el,
            text: el.textContent ?? "",
            color: style.color,
            font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
            previousColor: el.style.color,
            rect: range.getBoundingClientRect(),
          }
        })
        textCaptures.forEach(({ el }) => {
          el.style.color = "transparent"
        })

        const canvas = await html2canvas(node, {
          scale: canvasScale,
          backgroundColor: "#ffffff",
          // The org logo (only external image in this tree) needs this to actually draw instead
          // of silently tainting the canvas -- everything else here is same-origin/inline.
          useCORS: true,
        })

        textCaptures.forEach(({ el, previousColor }) => {
          el.style.color = previousColor
        })

        const ctx = canvas.getContext("2d")
        if (ctx) {
          const nodeRect = node.getBoundingClientRect()
          ctx.save()
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.scale(canvasScale, canvasScale)
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.direction = "rtl"
          for (const capture of textCaptures) {
            if (!capture.text.trim()) continue
            ctx.font = capture.font
            ctx.fillStyle = capture.color
            ctx.fillText(
              capture.text,
              capture.rect.left - nodeRect.left + capture.rect.width / 2,
              capture.rect.top - nodeRect.top + capture.rect.height / 2
            )
          }
          ctx.restore()
        }

        const imgHeightMm = (canvas.height * contentWidthMm) / canvas.width
        if (cursorYMm > marginMm && cursorYMm + imgHeightMm > pageHeightMm - marginMm) {
          pdf.addPage()
          cursorYMm = marginMm
        }
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.92),
          "JPEG",
          marginMm,
          cursorYMm,
          contentWidthMm,
          imgHeightMm
        )
        cursorYMm += imgHeightMm + 6
      }

      if (exportHeaderRef.current) await addNode(exportHeaderRef.current)
      for (let i = 0; i < exportChunks.length; i++) {
        const node = exportChunkRefs.current.get(i)
        if (node) await addNode(node)
      }

      const safeName = customer.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "customer"
      pdf.save(`كشف-حساب-${safeName}.pdf`)
    } finally {
      setExportingPdf(false)
    }
  }

  if (isCustomerLoading) {
    return (
      <div
        dir="rtl"
        className={cn("flex items-center justify-center gap-2 p-16 text-[13px]", MUTED)}
      >
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل بيانات العميل...
      </div>
    )
  }

  if (customerError || !customer) {
    return (
      <div dir="rtl" className="p-6">
        <p className="text-[13px] text-[#dc2626]">تعذر العثور على هذا العميل.</p>
      </div>
    )
  }

  const segmentMeta = SEGMENT_META[customer.segment]
  const accountBalance = customer.accountBalance ?? 0
  const balanceTone = accountBalance >= 0 ? "#16a34a" : "#dc2626"

  return (
    <div dir="rtl" className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <div className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
          <Link href={ROUTES.customers} className="hover:text-[#2563eb]">
            العملاء
          </Link>
          <span>/</span>
          <span className={HEADING}>كشف حساب العميل</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={ROUTES.customers}
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[#e8edf3] text-[#5b6b85] hover:bg-[#f4f6fa]"
            >
              <ArrowRight className="size-4" />
            </Link>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <FileText className="size-5" />
            </span>
            <div>
              <h1 className={cn("text-[18px] font-extrabold", HEADING)}>كشف حساب العميل</h1>
              <p className={cn("text-[12px]", MUTED)}>
                عرض جميع العمليات المالية المتعلقة بحساب العميل
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              icon={<ArrowDownCircle className="size-4" />}
              className="h-10 gap-1.5 rounded-[10px] bg-[#16a34a] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#15803d]"
              onClick={() => setDialogType("receipt")}
            >
              سند قبض
            </AppButton>
            <AppButton
              icon={<ArrowUpCircle className="size-4" />}
              className="h-10 gap-1.5 rounded-[10px] bg-[#dc2626] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#b91c1c]"
              onClick={() => setDialogType("payment")}
            >
              سند صرف
            </AppButton>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-[16px] border border-[#e8edf3] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[13px] font-bold text-[#2563eb]">
            {customer.name
              .split(" ")
              .map((part) => part[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <p className={cn("truncate text-[13.5px] font-bold", HEADING)}>{customer.name}</p>
            <p className={cn("truncate text-[10.5px]", MUTED)}>#{customerId.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-1 text-[12px]">
          {customer.phone ? (
            <span className={cn("flex items-center gap-1.5", MUTED)} dir="ltr">
              <Phone className="size-3.5" /> {customer.phone}
            </span>
          ) : null}
          {customer.email ? (
            <span className={cn("flex items-center gap-1.5", MUTED)} dir="ltr">
              <Mail className="size-3.5" /> {customer.email}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col justify-center gap-1 text-[12px]">
          <span className={cn("flex items-center gap-1.5", MUTED)}>
            <Calendar className="size-3.5" /> تاريخ التسجيل: {formatDate(customer.createdAt)}
          </span>
          {customer.region ? (
            <span className={cn("flex items-center gap-1.5", MUTED)}>
              <Building2 className="size-3.5" /> المنطقة: {customer.region}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-start justify-center gap-1.5">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
              segmentMeta.bg,
              segmentMeta.text
            )}
          >
            {segmentMeta.label}
          </span>
          <span className={cn("text-[11px]", MUTED)}>
            منصة: {customer.platform === "Madar" ? "مدار" : customer.platform}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label={accountBalance >= 0 ? "رصيد العميل (له)" : "رصيد العميل (عليه)"}
          value={formatAmount(Math.abs(accountBalance))}
          tone={balanceTone}
        />
        <StatCard
          icon={ArrowDownCircle}
          label="إجمالي الوارد"
          value={formatAmount(statement?.totalCredits ?? 0)}
          tone="#16a34a"
        />
        <StatCard
          icon={ArrowUpCircle}
          label="إجمالي الصادر"
          value={formatAmount(statement?.totalDebits ?? 0)}
          tone="#dc2626"
        />
        <StatCard
          icon={Layers}
          label="عدد العمليات"
          value={String(statement?.transactionCount ?? 0)}
          tone="#5b6b85"
        />
      </div>

      <div className="rounded-[16px] border border-[#e8edf3] bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <span className={cn("text-[11px] font-semibold", HEADING)}>الفترة الزمنية</span>
            <AppDateRangeFilter
              value={dateRange}
              onChange={(next) => {
                setDateRange(next)
                setPage(1)
              }}
            />
          </div>
          <div className="grid min-w-[150px] gap-1">
            <span className={cn("text-[11px] font-semibold", HEADING)}>نوع العملية</span>
            <AppSearchableSelect
              value={transactionType}
              onChange={(next) => {
                setTransactionType(next as AccountTransactionType | "all")
                setPage(1)
              }}
              options={TRANSACTION_TYPE_OPTIONS}
              ariaLabel="نوع العملية"
              triggerClassName="h-10"
            />
          </div>
        </div>
      </div>

      <div className="rounded-[16px] border border-[#e8edf3] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf3] p-4">
          <div>
            <p className={cn("text-[14px] font-extrabold", HEADING)}>سجل العمليات</p>
            <p className={cn("text-[11.5px]", MUTED)}>
              يعرض جميع سندات القبض والصرف، وعمليات البيع والإرجاع، وأثرها على رصيد العميل
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              variant="outline"
              icon={<Download className="size-3.5" />}
              onClick={downloadCsv}
              disabled={transactions.length === 0}
              className="h-9 gap-1.5 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85]"
            >
              تحميل CSV
            </AppButton>
            <AppButton
              variant="outline"
              icon={<Printer className="size-3.5" />}
              onClick={() => window.print()}
              disabled={transactions.length === 0}
              className="h-9 gap-1.5 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85]"
            >
              طباعة
            </AppButton>
            <AppButton
              variant="outline"
              icon={<FileDown className="size-3.5" />}
              onClick={() => void handleExportPdf()}
              disabled={transactions.length === 0 || exportingPdf}
              className="h-9 gap-1.5 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85]"
            >
              {exportingPdf ? "جاري التصدير..." : "تصدير PDF"}
            </AppButton>
          </div>
        </div>

        {isStatementLoading ? (
          <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل العمليات...
          </div>
        ) : statementError ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#dc2626]">{statementError}</p>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Wallet className="size-9 text-[#c7cedb]" />
            <p className={cn("text-[13px] font-bold", HEADING)}>لا توجد عمليات بعد</p>
            <p className={cn("text-[11.5px]", MUTED)}>
              ستظهر سندات القبض والصرف وعمليات البيع والإرجاع هنا فور حدوثها
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-right">
                <thead>
                  <tr className="border-b border-[#e8edf3] text-[11px] font-semibold text-[#8098b4]">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">المرجع</th>
                    <th className="px-4 py-3">نوع العملية</th>
                    <th className="px-4 py-3">الوصف</th>
                    <th className="px-4 py-3">المبلغ</th>
                    <th className="px-4 py-3">الرصيد بعد العملية</th>
                    <th className="px-4 py-3">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map((transaction, index) => {
                    const meta = TRANSACTION_TYPE_META[transaction.type]
                    return (
                      <tr
                        key={transaction.id}
                        className="border-b border-[#f1f4f9] text-[12.5px] last:border-b-0 hover:bg-[#fafbfd]"
                      >
                        <td className={cn("px-4 py-3", MUTED)}>{pageStart + index + 1}</td>
                        <td className={cn("px-4 py-3 font-mono text-[11.5px]", HEADING)}>
                          {transaction.reference}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ backgroundColor: meta.bg, color: meta.color }}
                          >
                            {meta.verb}
                          </span>
                        </td>
                        <td className={cn("px-4 py-3", MUTED)}>
                          {describeTransaction(transaction, methodNames)}
                        </td>
                        <td className="px-4 py-3 font-bold" style={{ color: meta.color }}>
                          {meta.direction > 0 ? "+" : "-"}
                          {formatAmount(transaction.amount)}
                        </td>
                        <td className={cn("px-4 py-3 font-semibold", HEADING)}>
                          {formatAmount(transaction.balanceAfter)}
                        </td>
                        <td className={cn("px-4 py-3", MUTED)}>
                          {formatDateTime(transaction.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-[#e8edf3] px-4 py-3">
              <p className={cn("text-[11.5px]", MUTED)}>
                عرض {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, transactions.length)} من{" "}
                {transactions.length} عملية
              </p>
              <div className="flex items-center gap-2">
                <AppButton
                  variant="outline"
                  className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="الصفحة السابقة"
                >
                  <ChevronRight className="size-4" />
                </AppButton>
                <span className={cn("text-[11.5px]", MUTED)}>
                  {currentPage} / {totalPages}
                </span>
                <AppButton
                  variant="outline"
                  className="size-8 rounded-[8px] border-[#e8edf3] p-0"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="الصفحة التالية"
                >
                  <ChevronLeft className="size-4" />
                </AppButton>
              </div>
            </div>
          </>
        )}
      </div>

      {dialogType ? (
        <AccountTransactionDialog
          type={dialogType}
          customerName={customer.name}
          customerAccountBalance={customer.accountBalance ?? 0}
          vatRate={vatRate}
          amount={amount}
          onAmountChange={setAmount}
          transactionDate={transactionDate}
          onTransactionDateChange={setTransactionDate}
          taxInclusive={taxInclusive}
          onTaxInclusiveChange={setTaxInclusive}
          paymentMethodCode={paymentMethodCode}
          onPaymentMethodChange={setPaymentMethodCode}
          eligibleMethods={eligibleMethods}
          notes={notes}
          onNotesChange={setNotes}
          attachments={attachments}
          onAddAttachments={addAttachments}
          onRemoveAttachment={(index) =>
            setAttachments((current) => current.filter((_, i) => i !== index))
          }
          isSaving={isSaving}
          onCancel={closeDialog}
          onSubmit={() => void submitTransaction()}
        />
      ) : null}

      {/* Print-only view of the full (unpaginated, currently-filtered) transaction table -- none
          of the breadcrumb, سند buttons, customer/stat cards, filter bar, or this section's own
          download/print buttons and pagination, none of which mean anything on paper. Portaled
          straight to <body> (same pattern as ReturnedInvoicesPage's own print target) since the
          print CSS below hides every other top-level element by selector, and this tree needs to
          be a sibling of them, not nested inside the (hidden) page content. */}
      {typeof document !== "undefined"
        ? createPortal(
            <div id="statement-print-target" className="hidden p-6 print:block" dir="rtl">
              <div className="mb-4 flex items-center justify-between gap-4 border-b border-[#e1e7f0] pb-3">
                <div>
                  <h1 className="text-[16px] font-extrabold text-[#0d1b3e]">كشف حساب العميل</h1>
                  <p className="mt-0.5 text-[12px] text-[#5b6b85]">{customer.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#5b6b85]">
                    تم إنشاؤه في{" "}
                    {new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
                      dateStyle: "long",
                      timeStyle: "short",
                    }).format(new Date())}
                  </p>
                </div>
                {currentOrganization ? (
                  <div className="flex shrink-0 items-center gap-2.5">
                    {currentOrganization.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentOrganization.logoUrl}
                        alt=""
                        className="size-10 shrink-0 rounded-[10px] object-contain"
                      />
                    ) : null}
                    <span className="text-[13px] font-bold text-[#0d1b3e]">
                      {currentOrganization.name}
                    </span>
                  </div>
                ) : null}
              </div>
              <StatementTable transactions={transactions} methodNames={methodNames} />
            </div>,
            document.body
          )
        : null}
      <style>{`
        @media print {
          body > *:not(#statement-print-target) { display: none !important; }
        }
      `}</style>

      {/* The tree handleExportPdf() rasterizes -- kept off-screen (not display:none, html2canvas
          needs a real layout to measure and capture), mounted only while exporting. Every color
          here is a hardcoded hex, never a Tailwind semantic class like bg-card/text-muted-
          foreground -- those resolve to oklch() custom properties (Tailwind v4's default theme),
          which html2canvas cannot parse. Same off-screen-at-a-huge-negative-offset setup
          ReportViewerPage's own PDF export uses -- see its comment for why. */}
      {exportingPdf ? (
        <div style={{ position: "fixed", top: 0, left: -99999, width: 760 }} dir="rtl">
          <div
            ref={exportHeaderRef}
            className="flex flex-col gap-4 bg-white p-4"
            style={{ width: 760 }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="mb-1 text-xl font-bold text-[#0d1b3e]">كشف حساب العميل</h1>
                <p data-canvas-text className="mb-1 text-sm text-[#5b6b85]">
                  {customer.name}
                </p>
                <p data-canvas-text className="text-[11px] text-[#95a4bd]">
                  تم إنشاؤه في{" "}
                  {new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
                    dateStyle: "long",
                    timeStyle: "short",
                  }).format(new Date())}
                </p>
              </div>
              {currentOrganization ? (
                <div className="flex shrink-0 items-center gap-2.5">
                  {currentOrganization.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentOrganization.logoUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-[10px] object-contain"
                    />
                  ) : null}
                  <span
                    data-canvas-text
                    className="overflow-hidden whitespace-nowrap text-[13px] font-bold text-[#0d1b3e]"
                  >
                    {currentOrganization.name}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-[10px] border border-[#e1e7f0] p-3">
                <p className="text-[10.5px] text-[#5b6b85]">
                  {(customer.accountBalance ?? 0) >= 0 ? "رصيد العميل (له)" : "رصيد العميل (عليه)"}
                </p>
                <p
                  data-canvas-text
                  className="mt-1 text-[15px] font-extrabold"
                  style={{ color: (customer.accountBalance ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}
                >
                  {formatAmount(Math.abs(customer.accountBalance ?? 0))}
                </p>
              </div>
              <div className="rounded-[10px] border border-[#e1e7f0] p-3">
                <p className="text-[10.5px] text-[#5b6b85]">إجمالي الوارد</p>
                <p data-canvas-text className="mt-1 text-[15px] font-extrabold text-[#16a34a]">
                  {formatAmount(statement?.totalCredits ?? 0)}
                </p>
              </div>
              <div className="rounded-[10px] border border-[#e1e7f0] p-3">
                <p className="text-[10.5px] text-[#5b6b85]">إجمالي الصادر</p>
                <p data-canvas-text className="mt-1 text-[15px] font-extrabold text-[#dc2626]">
                  {formatAmount(statement?.totalDebits ?? 0)}
                </p>
              </div>
              <div className="rounded-[10px] border border-[#e1e7f0] p-3">
                <p className="text-[10.5px] text-[#5b6b85]">عدد العمليات</p>
                <p data-canvas-text className="mt-1 text-[15px] font-extrabold text-[#0d1b3e]">
                  {String(statement?.transactionCount ?? 0)}
                </p>
              </div>
            </div>
          </div>

          {exportChunks.map((chunk, index) => (
            <div
              key={index}
              ref={(node) => {
                if (node) exportChunkRefs.current.set(index, node)
                else exportChunkRefs.current.delete(index)
              }}
              className="overflow-hidden rounded-[10px] border border-[#e1e7f0] bg-white"
              style={{ width: 760, marginTop: 12 }}
            >
              <StatementTable transactions={chunk} methodNames={methodNames} canvasText />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AccountTransactionDialog({
  type,
  customerName,
  customerAccountBalance,
  vatRate,
  amount,
  onAmountChange,
  transactionDate,
  onTransactionDateChange,
  taxInclusive,
  onTaxInclusiveChange,
  paymentMethodCode,
  onPaymentMethodChange,
  eligibleMethods,
  notes,
  onNotesChange,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  isSaving,
  onCancel,
  onSubmit,
}: {
  type: "receipt" | "payment"
  customerName: string
  customerAccountBalance: number
  vatRate: number
  amount: string
  onAmountChange: (value: string) => void
  transactionDate: string
  onTransactionDateChange: (value: string) => void
  taxInclusive: boolean
  onTaxInclusiveChange: (value: boolean) => void
  paymentMethodCode: string
  onPaymentMethodChange: (value: string) => void
  eligibleMethods: AccountMethodOption[]
  notes: string
  onNotesChange: (value: string) => void
  attachments: File[]
  onAddAttachments: (files: FileList | null) => void
  onRemoveAttachment: (index: number) => void
  isSaving: boolean
  onCancel: () => void
  onSubmit: () => void
}) {
  const meta = TRANSACTION_TYPE_META[type]
  const Icon = meta.icon
  const numericAmount = Math.round((Number(amount) || 0) * 100) / 100
  const taxAmount = taxInclusive
    ? Math.round((numericAmount - numericAmount / (1 + vatRate)) * 100) / 100
    : 0
  // Mirrors createAccountTransaction's own balanceDelta (native-customers-service.ts) exactly --
  // a receipt credits the account, a payment voucher debits it.
  const balanceAfter =
    customerAccountBalance + (type === "receipt" ? numericAmount : -numericAmount)
  const subtitle =
    type === "receipt"
      ? "تسجيل مبلغ حقيقي تم استلامه من العميل، يضاف إلى رصيده"
      : "تسجيل مبلغ يُمنح للعميل كسلفة/رصيد آجل، يخصم من رصيده"

  return (
    <AppDialog
      open={true}
      onOpenChange={(next) => {
        if (!next && !isSaving) onCancel()
      }}
      contentClassName="w-[92vw] max-w-[34rem] rounded-[16px] p-5 [direction:rtl]"
      title={
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ backgroundColor: meta.bg, color: meta.color }}
          >
            <Icon className="size-[18px]" />
          </span>
          <span className={cn("text-[15px] font-extrabold", HEADING)}>{meta.label}</span>
        </div>
      }
      description={<span className={cn("text-[12px]", MUTED)}>{subtitle}</span>}
      footer={
        <>
          <AppButton
            className="h-10 gap-2 rounded-[10px] px-5 text-[13px] font-semibold text-white"
            style={{ backgroundColor: meta.color }}
            disabled={isSaving}
            onClick={onSubmit}
          >
            {isSaving ? "جارٍ الحفظ..." : `حفظ ${meta.label}`}
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={isSaving}
            onClick={onCancel}
          >
            إلغاء
          </AppButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>التاريخ</label>
            <AppDateField value={transactionDate} onChange={onTransactionDateChange} />
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              رقم السند
            </label>
            <input
              disabled
              value="سيُنشأ تلقائياً بعد الحفظ"
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-[11px] text-[#8098b4]")}
            />
          </div>
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>العميل</label>
          <input
            disabled
            value={customerName}
            className={cn(FIELD_CLASS, "h-11 w-full px-3 text-[#8098b4]")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              طريقة الدفع <span className="text-[#dc2626]">*</span>
            </label>
            <AppSearchableSelect
              value={paymentMethodCode}
              onChange={onPaymentMethodChange}
              options={eligibleMethods.map((method) => ({
                value: method.code,
                label: method.name,
                icon: PAYMENT_METHOD_KIND_ICON[method.kind],
              }))}
              placeholder="اختر طريقة الدفع"
              ariaLabel="طريقة الدفع"
              triggerClassName="h-11"
            />
            {eligibleMethods.length === 0 ? (
              <p className="mt-1 text-[10.5px] text-[#c2410c]">
                لا توجد طريقة دفع مناسبة مفعّلة. فعّل واحدة من إعدادات نقطة البيع أولاً.
              </p>
            ) : null}
          </div>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              المبلغ <span className="text-[#dc2626]">*</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-left")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <label className="flex items-center gap-2 text-[12px] font-semibold">
            <input
              type="checkbox"
              checked={taxInclusive}
              onChange={(event) => onTaxInclusiveChange(event.target.checked)}
              className="size-4 rounded border-[#e8edf3]"
            />
            <span className={HEADING}>يشمل الضريبة؟</span>
          </label>
          <div>
            <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>الضريبة</label>
            <input
              disabled
              dir="ltr"
              value={taxAmount.toFixed(2)}
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-left text-[#8098b4]")}
            />
          </div>
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            ملاحظات (اختياري)
          </label>
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={2}
            maxLength={500}
            className={cn(
              FIELD_CLASS,
              "h-auto w-full resize-none px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-[#2563eb]"
            )}
          />
        </div>

        <div>
          <label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>المرفقات</label>
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-[#c7d3e3] bg-[#fafbfd] px-4 py-5 text-center hover:border-[#93a6c9]">
            <Paperclip className="size-5 text-[#2563eb]" />
            <span className={cn("text-[12px] font-semibold", HEADING)}>
              اسحب الملفات هنا أو اضغط للاختيار
            </span>
            <span className={cn("text-[10.5px]", MUTED)}>
              يدعم PDF, JPG, PNG (الحد الأقصى 5 ميجابايت)
            </span>
            <input
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                onAddAttachments(event.target.files)
                event.target.value = ""
              }}
            />
          </label>
          {attachments.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {attachments.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-[8px] border border-[#e8edf3] px-3 py-1.5 text-[11.5px]"
                >
                  <span className={cn("truncate", HEADING)}>{file.name}</span>
                  <AppButton
                    variant="ghost"
                    onClick={() => onRemoveAttachment(index)}
                    aria-label={`إزالة ${file.name}`}
                    className="size-5 shrink-0 rounded-full p-0 text-[#8098b4] hover:bg-[#fef2f2] hover:text-[#dc2626]"
                  >
                    <X className="size-3.5" />
                  </AppButton>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-[12px] border border-[#e8edf3] bg-[#f8fafc] p-3.5">
          <p className={cn("mb-2 text-[12px] font-bold", HEADING)}>ملخص العملية</p>
          <div className="flex flex-col gap-1.5 text-[12px]">
            <div className="flex items-center justify-between">
              <span className={MUTED}>المبلغ</span>
              <span className={cn("font-semibold", HEADING)}>{formatAmount(numericAmount)}</span>
            </div>
            {taxInclusive ? (
              <div className="flex items-center justify-between">
                <span className={MUTED}>منها ضريبة القيمة المضافة</span>
                <span className={cn("font-semibold", HEADING)}>{formatAmount(taxAmount)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-[#e8edf3] pt-1.5">
              <span className={MUTED}>رصيد العميل الحالي</span>
              <span className={cn("font-semibold", HEADING)}>
                {formatAmount(customerAccountBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={MUTED}>رصيد العميل بعد العملية</span>
              <span
                className="font-bold"
                style={{ color: balanceAfter >= 0 ? "#16a34a" : "#dc2626" }}
              >
                {formatAmount(balanceAfter)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppDialog>
  )
}
