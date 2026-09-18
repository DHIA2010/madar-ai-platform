"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDateRangeFilter,
  AppDialog,
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "@/components/app"

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

export function CustomerStatement({ customerId }: { customerId: string }) {
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
          vatRate={vatRate}
          amount={amount}
          onAmountChange={setAmount}
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
    </div>
  )
}

function AccountTransactionDialog({
  type,
  customerName,
  vatRate,
  amount,
  onAmountChange,
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
  vatRate: number
  amount: string
  onAmountChange: (value: string) => void
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
      contentClassName="w-[92vw] max-w-[30rem] rounded-[16px] p-5 [direction:rtl]"
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
            <input
              disabled
              value={DATE_FORMAT.format(new Date())}
              className={cn(FIELD_CLASS, "h-11 w-full px-3 text-[#8098b4]")}
            />
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
      </div>
    </AppDialog>
  )
}
