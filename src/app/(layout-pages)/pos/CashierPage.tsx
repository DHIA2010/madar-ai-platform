"use client"

// الكاشير -- replaces the old standalone POS portal. The cashier screen lives inside madar.app
// itself: same session, same users (Administration → Users), same real product/customer/payment
// data as the rest of the app.
//
// Gated behind a real open shift (pos_shifts): a sale has to be attributed to a counted cash
// float the same way a physical till works, and the top bar's "وردية مفتوحة" widget reads that
// same real record. Checkout calls the real POST /v1/pos/invoices this session already built --
// a completed sale here is a real row in pos_invoices, not a client-only demo total.
//
// Held orders (معلقة) are real, backend-persisted rows (pos_held_orders) rather than
// browser-only state -- a crash or refresh must not silently lose a customer's in-progress cart.
// Returns (إرجاع) reuse the same real PATCH /v1/pos/invoices/:id/status the Invoices page's
// "تسجيل إرجاع" action already calls -- one real implementation, not a second one here.
// Deliberately still absent: favorites (no such backend).

import { useEffect, useMemo, useRef, useState } from "react"
import {
  BadgePercent,
  Banknote,
  Calendar,
  Check,
  Clock,
  Coins,
  CreditCard,
  Eye,
  Grid2x2,
  Landmark,
  Layers,
  List,
  Loader2,
  LayoutGrid,
  Maximize,
  Minus,
  Percent,
  PiggyBank,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  StickyNote,
  Store,
  Trash2,
  Undo2,
  UserPlus,
  UserRound,
  Wallet,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"
import {
  posInvoicesService,
  VAT_RATE,
  type Invoice,
} from "@/features/pos/services/pos-invoices.service"
import { posShiftsService, type Shift } from "@/features/pos/services/pos-shifts.service"
import {
  posHeldOrdersService,
  type HeldOrder,
} from "@/features/pos/services/pos-held-orders.service"
import { CashMovementDialog } from "@/app/(layout-pages)/shifts/CashMovementDialog"
import { ShiftCloseDialog } from "@/app/(layout-pages)/shifts/ShiftCloseDialog"
import {
  posPaymentMethodsService,
  type PaymentKind,
} from "@/features/pos/services/pos-payment-methods.service"
import {
  productListService,
  type ProductRecord,
} from "@/features/products/services/product-list.service"
import { customerListService } from "@/features/customers/services/customer-list.service"
import type { CustomerRecord } from "@/features/customers/types"

import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const HEADING = "text-[#0d1b3e]"
// A darker secondary gray than the app's usual #8098b4 -- that shade read as too faint for this
// screen's own labels and captions.
const MUTED = "text-[#5b6b85]"
const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
function formatAmount(value: number): string {
  return `${AMOUNT_FORMAT.format(value)} ر.س`
}

// One real icon per real payment kind -- not brand logos (no Visa/Mastercard/mada/Apple mark
// assets exist in this app), just an honest category glyph.
const PAYMENT_KIND_ICON: Record<PaymentKind, typeof Wallet> = {
  cash: Banknote,
  card: CreditCard,
  wallet: Smartphone,
  transfer: Landmark,
  bnpl: Calendar,
  credit: UserRound,
  prepaid: PiggyBank,
}

const TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
})
const DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

interface CartLine {
  productId: string
  productName: string
  unitPrice: number
  quantity: number
}

// One settling method's row in the split-payment section -- an invoice can use more than one of
// these, each with its own amount, rather than picking a single method for the whole total.
// One settling method's tile in the split-payment grid -- radio at the outer edge, icon+name at
// the inner edge, a subtitle, then an amount field with a "ر.س" suffix. An invoice can use more
// than one of these at once, each with its own amount.
function PaymentTile({
  icon: Icon,
  name,
  subtitle,
  amount,
  selected,
  onAmountChange,
  onSelectFull,
}: {
  icon: typeof Wallet
  name: string
  subtitle: string
  amount: string
  selected: boolean
  onAmountChange: (value: string) => void
  // Clicking the card itself (not the field) fills in the full amount this method still needs to
  // cover -- the common "tap to pay with this" gesture. Clicking directly into the field instead
  // just focuses/selects its current text, for typing a deliberate split amount.
  onSelectFull: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      onClick={onSelectFull}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-[18px] border bg-white p-3.5 transition-colors",
        selected ? "border-[#2563eb]" : "border-[#e5e9f0]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-[#2563eb] bg-[#2563eb]" : "border-[#c7d2e0] bg-white"
          )}
        >
          {selected ? <span className="size-2 rounded-full bg-white" /> : null}
        </span>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("whitespace-nowrap text-[15px] font-bold", HEADING)}>{name}</span>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-[#eaf1fe] text-[#2563eb]">
            <Icon className="size-[18px]" />
          </span>
        </div>
      </div>
      <p className={cn("text-[12px] leading-5", MUTED)}>{subtitle}</p>
      <div dir="ltr" className="relative mt-auto">
        <Input
          ref={inputRef}
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.stopPropagation()}
          placeholder="0.00"
          className={cn(FIELD_CLASS, "h-11 pe-11 text-[14px] text-left")}
        />
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 end-3.5 my-auto h-fit text-[13px] font-semibold",
            MUTED
          )}
        >
          ر.س
        </span>
      </div>
    </div>
  )
}

// One choice in the discount dialog's "نوع الخصم" row -- same radio-left, icon+label-right card
// pattern as PaymentTile, just without a subtitle or amount field of its own.
function DiscountTypeOption({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: typeof Wallet
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-2 rounded-[14px] border bg-white px-3.5 py-3 transition-colors",
        selected ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e5e9f0]"
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-[#2563eb] bg-[#2563eb]" : "border-[#c7d2e0] bg-white"
        )}
      >
        {selected ? <span className="size-2 rounded-full bg-white" /> : null}
      </span>
      <span className="flex items-center gap-2.5">
        <span className={cn("whitespace-nowrap text-[13.5px] font-bold", HEADING)}>{label}</span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eaf1fe] text-[#2563eb]">
          <Icon className="size-4" />
        </span>
      </span>
    </button>
  )
}

export default function CashierPage() {
  const { currentUser } = useAuth()
  const { currentOrganization, currentWorkspace, availableWorkspaces, switchWorkspace } =
    useWorkspace()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // --- Real shift status ---------------------------------------------------------------------

  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const loadShifts = () =>
    posShiftsService
      .list()
      .then(setShifts)
      .catch(() => setShifts([]))
  useEffect(() => {
    void loadShifts()
  }, [])

  const myOpenShift = useMemo(
    () =>
      shifts?.find(
        (shift) =>
          shift.status === "open" &&
          shift.cashierUserId === currentUser?.id &&
          shift.workspaceId === currentWorkspace?.id
      ) ?? null,
    [shifts, currentUser?.id, currentWorkspace?.id]
  )

  const [isOpenShiftDialogOpen, setIsOpenShiftDialogOpen] = useState(false)
  const [openingCashAmount, setOpeningCashAmount] = useState("")
  const [openingShift, setOpeningShift] = useState(false)

  const startShift = async () => {
    if (!currentUser || !currentWorkspace) return
    setOpeningShift(true)
    try {
      await posShiftsService.open({
        workspaceId: currentWorkspace.id,
        cashierUserId: currentUser.id,
        openingCashAmount: Number(openingCashAmount) || 0,
        openingNotes: null,
      })
      toast.success("تم فتح الوردية.")
      setIsOpenShiftDialogOpen(false)
      setOpeningCashAmount("")
      await loadShifts()
    } catch {
      toast.error("تعذر فتح الوردية.")
    } finally {
      setOpeningShift(false)
    }
  }

  // --- Real cash-drawer withdrawals/deposits, mid-shift -----------------------------------------
  // The dialog itself is shared with the shift detail page -- see CashMovementDialog.tsx.

  const [isCashMovementOpen, setIsCashMovementOpen] = useState(false)

  // --- Closing the open shift, right from its own badge -----------------------------------------
  // Same shared dialog the shifts list and shift detail page already use.

  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false)

  // --- Real today's totals for this branch ---------------------------------------------------

  const [todaySummary, setTodaySummary] = useState<{
    totalCompletedAmount: number
    completedCount: number
  } | null>(null)
  const loadTodaySummary = () => {
    if (!currentWorkspace) return
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    void posInvoicesService
      .summary({ workspaceId: currentWorkspace.id, from: startOfDay.toISOString() })
      .then(setTodaySummary)
      .catch(() => setTodaySummary(null))
  }
  useEffect(() => {
    loadTodaySummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id])

  // --- Real products + categories -------------------------------------------------------------

  const [products, setProducts] = useState<ProductRecord[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  useEffect(() => {
    setLoadingProducts(true)
    void productListService
      .listProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false))
  }, [currentWorkspace?.id])

  // Built from whatever categories the real products actually carry -- not a fixed list, since
  // pos_invoices/products has no seeded taxonomy to match a fixed set against.
  const categories = useMemo(() => {
    const set = new Set(products.map((product) => product.category).filter(Boolean))
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"))
  }, [products])

  const [selectedCategory, setSelectedCategory] = useState("all")
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const filteredProducts = useMemo(() => {
    const query = search.trim()
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory
      const matchesQuery = !query || product.name.includes(query) || product.sku.includes(query)
      return matchesCategory && matchesQuery && product.status === "Active"
    })
  }, [products, selectedCategory, search])

  // --- Cart ------------------------------------------------------------------------------------

  const [cart, setCart] = useState<CartLine[]>([])

  function addToCart(product: ProductRecord) {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: product.sellingPrice,
          quantity: 1,
        },
      ]
    })
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.productId !== productId))
      return
    }
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, quantity } : line))
    )
  }

  function clearCart() {
    setCart([])
  }

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)

  // --- Checkout ---------------------------------------------------------------------------------

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  // A real customer this sale is attributed to -- only ever set from an actual native ("Madar")
  // customer record (picking a synced storefront customer, or free-typing the name, leaves this
  // null). Required for any "credit" (آجل) or "prepaid" (محفظة العميل) amount, since both move a
  // real balance on that customer's own account. selectedCustomer carries their real
  // balanceDue/walletBalance for the checkout dialog's live context panel.
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null)
  // Committed discount configuration -- what the sale actually uses. A percentage is always
  // equivalent whether or not it's "of the tax-inclusive total" (tax scales both sides the same
  // way), so discountIncludesTax only changes the math for a fixed SAR value: it means the typed
  // amount is meant to come off the tax-INCLUSIVE total, so what actually gets subtracted from
  // the pre-tax subtotal is discountValue / (1 + VAT_RATE) -- see the `discount` memo below.
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState(false)
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent")
  const [discountValue, setDiscountValue] = useState("")
  const [discountIncludesTax, setDiscountIncludesTax] = useState(true)
  // Draft copies edited inside the dialog -- only committed to the state above on "تأكيد", so
  // opening the dialog and cancelling never silently changes the discount already applied.
  const [draftDiscountType, setDraftDiscountType] = useState<"percent" | "fixed">("percent")
  const [draftDiscountValue, setDraftDiscountValue] = useState("")
  const [draftDiscountIncludesTax, setDraftDiscountIncludesTax] = useState(true)
  // One entry per enabled payment method, keyed by code -- an invoice can now be split across
  // more than one, so this replaces the old single `paymentMethodCode` selection.
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({})
  const [paymentMethods, setPaymentMethods] = useState<
    Array<{ code: string; name: string; subtitle: string; kind: PaymentKind }>
  >([])
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    if (!isCheckoutOpen) return
    void posPaymentMethodsService
      .list()
      .then((methods) => {
        const enabled = methods.filter((method) => method.enabled)
        setPaymentMethods(
          enabled.map((method) => ({
            code: method.code,
            name: method.name,
            subtitle: method.subtitle,
            kind: method.kind,
          }))
        )
      })
      .catch(() => setPaymentMethods([]))
  }, [isCheckoutOpen])

  const discount = useMemo(() => {
    const raw = Number(discountValue)
    if (!raw || raw <= 0) return 0
    if (discountType === "percent") {
      const percent = Math.min(100, Math.max(0, raw))
      return Math.round(subtotal * (percent / 100) * 100) / 100
    }
    const amountOffSubtotal = discountIncludesTax ? raw / (1 + VAT_RATE) : raw
    return Math.round(Math.min(Math.max(0, amountOffSubtotal), subtotal) * 100) / 100
  }, [discountType, discountValue, discountIncludesTax, subtotal])
  const taxable = Math.max(0, subtotal - discount)
  const tax = Math.round(taxable * VAT_RATE * 100) / 100
  const total = Math.round((taxable + tax) * 100) / 100

  const paymentEntries = useMemo(
    () =>
      Object.entries(paymentAmounts)
        .map(([code, value]) => ({ code, amount: Math.round((Number(value) || 0) * 100) / 100 }))
        .filter((entry) => entry.amount > 0),
    [paymentAmounts]
  )
  const methodByCode = useMemo(
    () => new Map(paymentMethods.map((method) => [method.code, method])),
    [paymentMethods]
  )
  const sumByKind = (kind: PaymentKind) =>
    Math.round(
      paymentEntries
        .filter((entry) => methodByCode.get(entry.code)?.kind === kind)
        .reduce((sum, entry) => sum + entry.amount, 0) * 100
    ) / 100
  const deferredAmount = sumByKind("credit")
  const prepaidAmount = sumByKind("prepaid")
  const needsCustomerForDeferred = deferredAmount > 0 && !customerId
  const needsCustomerForPrepaid = prepaidAmount > 0 && !customerId
  const walletBalance = selectedCustomer?.walletBalance ?? 0
  const insufficientWallet =
    prepaidAmount > 0 && customerId !== null && prepaidAmount > walletBalance

  // Only cash can be handed over in excess and give change back -- a card/transfer/wallet/credit
  // tap is always for the exact amount asked, so any excess there is a real typo, not a tender to
  // make change from. cashEntries is practically ever at most one entry (the catalog has a single
  // "cash" code), but this stays correct if a branch ever adds a second cash-kind method.
  const cashEntries = paymentEntries.filter(
    (entry) => methodByCode.get(entry.code)?.kind === "cash"
  )
  const nonCashEntries = paymentEntries.filter(
    (entry) => methodByCode.get(entry.code)?.kind !== "cash"
  )
  const cashTendered =
    Math.round(cashEntries.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100
  const nonCashTotal =
    Math.round(nonCashEntries.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100
  const nonCashExcess = Math.max(0, Math.round((nonCashTotal - total) * 100) / 100)
  const neededFromCash = Math.max(0, Math.round((total - nonCashTotal) * 100) / 100)
  // The part of the cash handed over that actually settles the sale -- capped at what's still
  // owed once every other method is counted. Anything the cashier typed beyond that is real
  // physical cash to hand back as change, not extra revenue: only appliedCash is ever sent to
  // the backend as this invoice's cash payment line (see completeCheckout).
  const appliedCash = Math.min(cashTendered, neededFromCash)
  // Cash handed over beyond what the sale needed -- real change to hand back, shown in the same
  // "المبلغ المتبقي" bar once the sale is otherwise settled (see paymentSettled below).
  const changeDue = Math.max(0, Math.round((cashTendered - neededFromCash) * 100) / 100)
  const paidAmount = Math.round((nonCashTotal + cashTendered) * 100) / 100
  const stillOwed = Math.max(0, Math.round((total - (nonCashTotal + appliedCash)) * 100) / 100)
  const paymentSettled = stillOwed < 0.01 && nonCashExcess < 0.01 && paidAmount > 0
  const checkoutBlocked =
    !paymentSettled || needsCustomerForDeferred || needsCustomerForPrepaid || insufficientWallet

  const setPaymentAmount = (code: string, value: string) =>
    setPaymentAmounts((current) => ({ ...current, [code]: value }))

  const completeCheckout = async () => {
    // The checkout button itself is only ever shown when myOpenShift exists (see the cart
    // section below) -- this is a second, defensive check against calling this directly.
    if (!myOpenShift) {
      toast.error("لا توجد وردية مفتوحة.")
      return
    }
    if (!paymentSettled) {
      toast.error(
        nonCashExcess > 0
          ? "المبلغ المدخل عبر طريقة أخرى أكبر من الإجمالي."
          : `المبلغ المتبقي ${formatAmount(stillOwed)}`
      )
      return
    }
    if (needsCustomerForDeferred) {
      toast.error("اختر عميلاً لتسجيل المبلغ الآجل في حسابه.")
      return
    }
    if (needsCustomerForPrepaid) {
      toast.error("اختر عميلاً للخصم من رصيد محفظته.")
      return
    }
    if (insufficientWallet) {
      toast.error("رصيد محفظة العميل أقل من المبلغ المطلوب خصمه.")
      return
    }
    setCheckingOut(true)
    try {
      const invoice: Invoice = await posInvoicesService.create({
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        customerId,
        // Cash is capped at what the sale actually needs -- any excess the cashier typed is
        // physical change handed back, not extra revenue, so it never reaches the invoice.
        payments: [
          ...nonCashEntries.map((entry) => ({
            paymentMethodCode: entry.code,
            amount: entry.amount,
          })),
          ...(appliedCash > 0 && cashEntries[0]
            ? [{ paymentMethodCode: cashEntries[0].code, amount: appliedCash }]
            : []),
        ],
        discountAmount: discount,
        notes: orderNotes.trim() || null,
        items: cart.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
        })),
      })
      toast.success(`تمت العملية بنجاح — فاتورة ${invoice.invoiceNumber}`)
      clearCart()
      setCustomerName("")
      setCustomerPhone("")
      setCustomerId(null)
      setSelectedCustomer(null)
      setDiscountValue("")
      setDiscountType("percent")
      setDiscountIncludesTax(true)
      setPaymentAmounts({})
      setOrderNotes("")
      setIsCheckoutOpen(false)
      loadTodaySummary()
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      toast.error(status === 403 ? "لا تملك صلاحية إتمام البيع." : "تعذر إتمام العملية.", {
        description: status === 403 ? "تواصل مع مالك الحساب لمنحك صلاحية pos:manage." : undefined,
      })
    } finally {
      setCheckingOut(false)
    }
  }

  // --- Order note --------------------------------------------------------------------------------

  const [orderNotes, setOrderNotes] = useState("")
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState("")

  // --- Customer picker -----------------------------------------------------------------------
  // Prefills the free-text customerName/customerPhone snapshot from a real customer record --
  // an invoice's customer stays a snapshot either way (see pos-invoices.service.ts), not a link.

  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false)
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [customerSearch, setCustomerSearch] = useState("")

  const loadCustomers = () =>
    void customerListService
      .listCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]))
  useEffect(() => {
    if (!isCustomerDialogOpen) return
    loadCustomers()
  }, [isCustomerDialogOpen])

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim()
    if (!query) return customers
    return customers.filter(
      (customer) => customer.name.includes(query) || (customer.phone ?? "").includes(query)
    )
  }, [customers, customerSearch])

  // Creating a customer without leaving the cashier page -- a real row (platform: "Madar"),
  // merged into the same list a synced customer would appear in. See native-customers-service.ts.
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [savingCustomer, setSavingCustomer] = useState(false)

  const createNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error("أدخل اسم العميل.")
      return
    }
    setSavingCustomer(true)
    try {
      const created = await customerListService.createCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        email: null,
        notes: null,
      })
      toast.success("تم إضافة العميل.")
      setCustomerName(created.name)
      setCustomerPhone(created.phone ?? "")
      setCustomerId(created.id)
      setSelectedCustomer(created)
      setNewCustomerName("")
      setNewCustomerPhone("")
      setIsAddCustomerOpen(false)
      setIsCustomerDialogOpen(false)
    } catch {
      toast.error("تعذر إضافة العميل.")
    } finally {
      setSavingCustomer(false)
    }
  }

  // --- Wallet top-up -----------------------------------------------------------------------
  // Real money a cashier collected in advance -- the only way a customer's wallet_balance ever
  // grows (see native-customers-service.ts's topUpWallet). Only ever offered for a native
  // ("Madar") customer, since a synced storefront one has no real wallet column.

  const [topUpCustomer, setTopUpCustomer] = useState<CustomerRecord | null>(null)
  const [topUpAmount, setTopUpAmount] = useState("")
  const [toppingUpWallet, setToppingUpWallet] = useState(false)

  const submitWalletTopUp = async () => {
    if (!topUpCustomer) return
    const amount = Math.round((Number(topUpAmount) || 0) * 100) / 100
    if (!(amount > 0)) {
      toast.error("أدخل مبلغاً صحيحاً.")
      return
    }
    setToppingUpWallet(true)
    try {
      const updated = await customerListService.topUpWallet(topUpCustomer.id, amount)
      toast.success(`تم شحن محفظة ${updated.name} بمبلغ ${formatAmount(amount)}.`)
      setCustomers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      setSelectedCustomer((current) => (current?.id === updated.id ? updated : current))
      setTopUpCustomer(null)
      setTopUpAmount("")
    } catch {
      toast.error("تعذر شحن المحفظة.")
    } finally {
      setToppingUpWallet(false)
    }
  }

  // --- Returns -------------------------------------------------------------------------------
  // Reuses the real PATCH /v1/pos/invoices/:id/status the Invoices page's own "تسجيل إرجاع"
  // action already calls -- one real return flow, just reachable from here too.

  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)
  const [returnSearch, setReturnSearch] = useState("")
  const [returnCandidates, setReturnCandidates] = useState<Invoice[]>([])
  const [loadingReturnCandidates, setLoadingReturnCandidates] = useState(false)
  const [returningId, setReturningId] = useState<string | null>(null)

  useEffect(() => {
    if (!isReturnDialogOpen) return
    setLoadingReturnCandidates(true)
    void posInvoicesService
      .list({ status: "completed", search: returnSearch.trim() || undefined })
      .then(setReturnCandidates)
      .catch(() => setReturnCandidates([]))
      .finally(() => setLoadingReturnCandidates(false))
  }, [isReturnDialogOpen, returnSearch])

  const submitReturn = async (invoice: Invoice) => {
    setReturningId(invoice.id)
    try {
      await posInvoicesService.setStatus(invoice.id, "returned")
      toast.success(`تم تسجيل إرجاع الفاتورة ${invoice.invoiceNumber}`)
      setReturnCandidates((current) => current.filter((item) => item.id !== invoice.id))
      loadTodaySummary()
    } catch {
      toast.error("تعذر تسجيل الإرجاع.")
    } finally {
      setReturningId(null)
    }
  }

  // --- Held orders -----------------------------------------------------------------------------
  // Real rows (pos_held_orders), not browser-only state -- a crash or refresh must not silently
  // lose a customer's in-progress cart. Scoped to this cashier's own workspace, same as shifts.

  const [isHeldOrdersOpen, setIsHeldOrdersOpen] = useState(false)
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([])
  const [holdingOrder, setHoldingOrder] = useState(false)
  const [heldOrderBusyId, setHeldOrderBusyId] = useState<string | null>(null)

  const loadHeldOrders = () => {
    if (!currentWorkspace) return
    void posHeldOrdersService
      .list(currentWorkspace.id)
      .then(setHeldOrders)
      .catch(() => setHeldOrders([]))
  }
  useEffect(() => {
    loadHeldOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id])

  const holdCurrentOrder = async () => {
    if (!currentWorkspace || cart.length === 0) return
    setHoldingOrder(true)
    try {
      await posHeldOrdersService.hold({
        workspaceId: currentWorkspace.id,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        discountAmount: discount,
        notes: orderNotes.trim() || null,
        items: cart.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
        })),
      })
      toast.success("تم تعليق الطلب.")
      clearCart()
      setCustomerName("")
      setCustomerPhone("")
      setCustomerId(null)
      setSelectedCustomer(null)
      setDiscountValue("")
      setDiscountType("percent")
      setDiscountIncludesTax(true)
      setOrderNotes("")
      loadHeldOrders()
    } catch {
      toast.error("تعذر تعليق الطلب.")
    } finally {
      setHoldingOrder(false)
    }
  }

  const resumeHeldOrder = async (id: string) => {
    setHeldOrderBusyId(id)
    try {
      const held = await posHeldOrdersService.remove(id)
      setCart(
        held.items
          .filter((item): item is typeof item & { productId: string } => item.productId !== null)
          .map((item) => ({
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          }))
      )
      setCustomerName(held.customerName ?? "")
      setCustomerPhone(held.customerPhone ?? "")
      // A held cart has no real customer link of its own (pos_held_orders keeps only the
      // name/phone snapshot) -- resuming it starts fresh, not attributed to any customer account.
      setCustomerId(null)
      setSelectedCustomer(null)
      // A held cart only ever kept a flat SAR amount -- resumed as a "fixed value, not
      // tax-inclusive" discount, the one configuration that maps back to it exactly.
      setDiscountType("fixed")
      setDiscountValue(held.discountAmount ? String(held.discountAmount) : "")
      setDiscountIncludesTax(false)
      setOrderNotes(held.notes ?? "")
      setHeldOrders((current) => current.filter((order) => order.id !== id))
      setIsHeldOrdersOpen(false)
      toast.success("تم استئناف الطلب.")
    } catch {
      toast.error("تعذر استئناف الطلب.")
    } finally {
      setHeldOrderBusyId(null)
    }
  }

  const discardHeldOrder = async (id: string) => {
    setHeldOrderBusyId(id)
    try {
      await posHeldOrdersService.remove(id)
      setHeldOrders((current) => current.filter((order) => order.id !== id))
      toast.success("تم حذف الطلب المعلق.")
    } catch {
      toast.error("تعذر حذف الطلب.")
    } finally {
      setHeldOrderBusyId(null)
    }
  }

  // --- Render ------------------------------------------------------------------------------------

  if (shifts === null) {
    return (
      <div dir="rtl" className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        جارٍ التحميل...
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#e8edf3] bg-white px-3 py-2.5">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-[#e8edf3] px-3 py-1.5 text-[11.5px] font-semibold",
            HEADING
          )}
        >
          <Calendar className="size-3.5 text-[#8098b4]" />
          {DATE_FORMAT.format(now)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-[#e8edf3] px-3 py-1.5 text-[11.5px] font-semibold",
            HEADING
          )}
        >
          <Clock className="size-3.5 text-[#8098b4]" />
          {TIME_FORMAT.format(now)}
        </span>

        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-[#e8edf3] bg-[#f4f7fc] px-3 py-1.5 text-[11.5px] font-semibold",
            HEADING
          )}
        >
          <Eye className="size-3.5 text-[#8098b4]" />
          الفواتير
          <span className={HEADING}>{todaySummary?.completedCount ?? "—"}</span>
        </span>

        <span className="flex items-center gap-1.5 rounded-full border border-[#e8edf3] bg-[#eff6ff] px-3 py-1.5 text-[11.5px] font-semibold text-[#2563eb]">
          <Wallet className="size-3.5" />
          مبيعات اليوم
          {todaySummary ? formatAmount(todaySummary.totalCompletedAmount) : "—"}
        </span>

        {myOpenShift ? (
          <>
            <button
              type="button"
              onClick={() => setIsCloseShiftOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-[#dcfce7] bg-[#f0fdf4] px-3 py-1.5 text-[11.5px] font-semibold text-[#15803d] hover:border-[#bbf7d0]"
            >
              <span className="size-1.5 rounded-full bg-[#22c55e]" />
              وردية مفتوحة
              <span className={HEADING}>
                منذ {TIME_FORMAT.format(new Date(myOpenShift.openedAt))}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsCashMovementOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
            >
              <Wallet className="size-3.5" />
              سحب / إيداع
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpenShiftDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-3 py-1.5 text-[11.5px] font-semibold text-[#92400e]"
          >
            <span className="size-1.5 rounded-full bg-[#f59e0b]" />
            لا توجد وردية مفتوحة
          </button>
        )}

        <div className="w-[170px]">
          <AppSelect
            value={currentWorkspace?.id ?? ""}
            onValueChange={(workspaceId) => {
              if (currentOrganization)
                void switchWorkspace({ organizationId: currentOrganization.id, workspaceId })
            }}
          >
            <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
              <Store className="size-3.5 text-[#8098b4]" />
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {availableWorkspaces.map((workspace) => (
                <AppSelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </div>

        <div className="mr-auto flex items-center gap-2">
          <Button
            className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1d4ed8]"
            onClick={() => (window.location.href = ROUTES.dashboard)}
          >
            <LayoutGrid className="size-4" />
            لوحة التحكم
          </Button>
          <button
            type="button"
            aria-label="ملء الشاشة"
            onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
            className="flex size-10 items-center justify-center rounded-[10px] border border-[#e8edf3] text-[#5b6b85] hover:border-[#c7d9ff]"
          >
            <Maximize className="size-4" />
          </button>
        </div>
      </div>

      {/* Main layout: categories (right) | products (middle) | cart (left) */}
      <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-[#e8edf3] bg-white p-3">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <Grid2x2 className="size-4 text-[#8098b4]" />
            <span className={cn("text-[12.5px] font-bold", HEADING)}>الفئات</span>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "rounded-[8px] px-2.5 py-2 text-right text-[12.5px] font-semibold",
                selectedCategory === "all"
                  ? "bg-[#eff6ff] text-[#2563eb]"
                  : "text-[#5b6b85] hover:bg-[#f7faff]"
              )}
            >
              الكل
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  "rounded-[8px] px-2.5 py-2 text-right text-[12.5px] font-semibold",
                  selectedCategory === category
                    ? "bg-[#eff6ff] text-[#2563eb]"
                    : "text-[#5b6b85] hover:bg-[#f7faff]"
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#e8edf3] bg-white p-2.5">
            <button
              type="button"
              className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[#e8edf3] px-3 text-[12px] font-semibold text-[#5b6b85]"
            >
              <SlidersHorizontal className="size-4" />
              تصفية
            </button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="البحث في المنتجات..."
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>
            <button
              type="button"
              aria-label="عرض شبكي"
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex size-10 items-center justify-center rounded-[10px] border",
                viewMode === "grid"
                  ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                  : "border-[#e8edf3] text-[#5b6b85]"
              )}
            >
              <Grid2x2 className="size-4" />
            </button>
            <button
              type="button"
              aria-label="عرض قائمة"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex size-10 items-center justify-center rounded-[10px] border",
                viewMode === "list"
                  ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                  : "border-[#e8edf3] text-[#5b6b85]"
              )}
            >
              <List className="size-4" />
            </button>
          </div>

          {loadingProducts ? (
            <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل المنتجات...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div
              className={cn(
                "rounded-2xl border border-dashed border-[#e8edf3] bg-white p-10 text-center text-[12.5px]",
                MUTED
              )}
            >
              لا توجد منتجات مطابقة.
            </div>
          ) : (
            <div
              className={cn(
                viewMode === "grid"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
                  : "flex flex-col gap-2"
              )}
            >
              {filteredProducts.map((product) =>
                viewMode === "grid" ? (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className="flex flex-col items-start gap-2 rounded-2xl border border-[#e8edf3] bg-white p-3 text-right transition-colors hover:border-[#c7d9ff]"
                  >
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] bg-[#f4f7fc]">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image}
                          alt={product.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Store className="size-6 text-[#c7d3e3]" />
                      )}
                    </div>
                    <p
                      className={cn(
                        "line-clamp-2 text-[12px] font-semibold leading-tight",
                        HEADING
                      )}
                    >
                      {product.name}
                    </p>
                    <p className={cn("text-[10.5px]", MUTED)}>SKU: {product.sku || "—"}</p>
                    <div className="flex w-full items-center justify-between">
                      <span className={cn("text-[13px] font-extrabold", HEADING)}>
                        {formatAmount(product.sellingPrice)}
                      </span>
                      <span className="flex size-7 items-center justify-center rounded-full bg-[#2563eb] text-white">
                        <Plus className="size-4" />
                      </span>
                    </div>
                  </button>
                ) : (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[#e8edf3] bg-white p-3 text-right transition-colors hover:border-[#c7d9ff]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#f4f7fc]">
                        {product.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image}
                            alt={product.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Store className="size-5 text-[#c7d3e3]" />
                        )}
                      </div>
                      <div>
                        <p className={cn("text-[12.5px] font-semibold", HEADING)}>{product.name}</p>
                        <p className={cn("text-[10.5px]", MUTED)}>SKU: {product.sku || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-[13px] font-extrabold", HEADING)}>
                        {formatAmount(product.sellingPrice)}
                      </span>
                      <span className="flex size-8 items-center justify-center rounded-full bg-[#2563eb] text-white">
                        <Plus className="size-4" />
                      </span>
                    </div>
                  </button>
                )
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-[#e8edf3] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className={cn("text-[14px] font-extrabold", HEADING)}>الطلب الحالي</h2>
            {cart.length > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={holdingOrder}
                  onClick={() => void holdCurrentOrder()}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full border border-[#e8edf3] px-3 text-[11.5px] font-semibold disabled:opacity-50",
                    MUTED
                  )}
                >
                  <Layers className="size-3.5" />
                  {holdingOrder ? "جارٍ التعليق..." : "تعليق"}
                </button>
                <button
                  type="button"
                  onClick={clearCart}
                  aria-label="مسح الكل"
                  className="flex size-8 items-center justify-center rounded-full bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ) : null}
          </div>

          {customerName ? (
            <div>
              <Label className={cn("mb-1.5 block text-[11px] font-semibold", HEADING)}>
                العميل
              </Label>
              <div className="relative">
                <Input
                  value={customerName}
                  readOnly
                  onClick={() => setIsCustomerDialogOpen(true)}
                  className={cn(FIELD_CLASS, "cursor-pointer caret-transparent ps-9")}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomerName("")
                    setCustomerPhone("")
                    setCustomerId(null)
                    setSelectedCustomer(null)
                  }}
                  aria-label="إزالة العميل"
                  className="absolute inset-y-0 start-2 my-auto flex size-6 items-center justify-center rounded-full text-[#8098b4] hover:bg-[#fef2f2] hover:text-[#dc2626]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : null}

          {cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                <ShoppingCart className="size-6" />
              </span>
              <p className={cn("text-[13px] font-bold", HEADING)}>السلة فارغة</p>
              <p className={cn("max-w-[220px] text-[11.5px]", MUTED)}>
                قم بإضافة منتجات من القائمة لبدء الطلب
              </p>
            </div>
          ) : (
            <div className="flex max-h-[35vh] flex-col gap-2 overflow-y-auto">
              {cart.map((line) => (
                <div
                  key={line.productId}
                  className="flex items-center gap-2 rounded-[10px] border border-[#e8edf3] p-2"
                >
                  <div className="flex-1">
                    <p className={cn("text-[12px] font-semibold", HEADING)}>{line.productName}</p>
                    <p className={cn("text-[10.5px]", MUTED)}>{formatAmount(line.unitPrice)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.productId, line.quantity - 1)}
                      className="flex size-6 items-center justify-center rounded-md border border-[#e8edf3] text-[#5b6b85]"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className={cn("w-5 text-center text-[12px] font-semibold", HEADING)}>
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(line.productId, line.quantity + 1)}
                      className="flex size-6 items-center justify-center rounded-md border border-[#e8edf3] text-[#5b6b85]"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateQuantity(line.productId, 0)}
                    aria-label="حذف"
                    className="flex size-6 items-center justify-center rounded-md text-[#dc2626] hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2 border-t border-[#eef2f8] pt-3 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", HEADING)}>
                الأصناف <span className="text-[#2563eb]">{cart.length}</span>
              </span>
              <span className={cn("font-semibold", HEADING)}>
                المجموع الفرعي <span className="font-bold">{formatAmount(subtotal)}</span>
              </span>
            </div>

            <p className={cn("text-[13px] font-extrabold", HEADING)}>الدفع</p>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={cn("font-semibold", HEADING)}>الخصم</span>
                <button
                  type="button"
                  onClick={() => {
                    setDraftDiscountType(discountType)
                    setDraftDiscountValue(discountValue)
                    setDraftDiscountIncludesTax(discountIncludesTax)
                    setIsDiscountDialogOpen(true)
                  }}
                  aria-label="إضافة خصم"
                  className="flex size-6 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb] hover:bg-[#dbeafe]"
                >
                  <Plus className="size-3.5" />
                </button>
                {discount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountValue("")
                      setDiscountType("percent")
                      setDiscountIncludesTax(true)
                    }}
                    aria-label="إزالة الخصم"
                    className="flex size-6 items-center justify-center rounded-full bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <span className={HEADING}>{formatAmount(discount)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", HEADING)}>الإجمالي بعد الخصم</span>
              <span className={HEADING}>{formatAmount(taxable)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", HEADING)}>
                الضريبة ({Math.round(VAT_RATE * 100)}٪)
              </span>
              <span className={HEADING}>{formatAmount(tax)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[15px] font-extrabold">
              <span className={HEADING}>الإجمالي المستحق</span>
              <span className="text-[#2563eb]">{formatAmount(total)}</span>
            </div>
          </div>

          {myOpenShift ? (
            <Button
              disabled={cart.length === 0}
              className="h-12 gap-2 rounded-[12px] bg-[#2563eb] text-[13.5px] font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
              onClick={() => setIsCheckoutOpen(true)}
            >
              <Wallet className="size-4" />
              المتابعة إلى الدفع
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="rounded-[10px] bg-[#fffbeb] px-3 py-2.5 text-center text-[12px] font-semibold text-[#92400e]">
                لا توجد وردية مفتوحة. افتح وردية قبل البيع.
              </p>
              <Button
                className="h-12 gap-2 rounded-[12px] bg-[#2563eb] text-[13.5px] font-bold text-white hover:bg-[#1d4ed8]"
                onClick={() => setIsOpenShiftDialogOpen(true)}
              >
                <Clock className="size-4" />
                فتح وردية جديدة
              </Button>
            </div>
          )}

          {/* RTL: written in reverse of reading order so معلقة lands rightmost and ملاحظة
              leftmost, matching the reference (same first-child-is-rightmost rule already
              applied to the shift status strip). */}
          <div className="grid grid-cols-4 gap-1 border-t border-[#eef2f8] pt-3">
            <button
              type="button"
              onClick={() => setIsHeldOrdersOpen(true)}
              className="flex flex-col items-center gap-1.5 rounded-[10px] p-1.5 hover:bg-[#f7faff]"
            >
              <span className="relative flex size-10 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb]">
                <Layers className="size-[18px]" />
                {heldOrders.length > 0 ? (
                  <span className="absolute -top-1.5 -end-1.5 flex size-[18px] items-center justify-center rounded-full bg-[#2563eb] text-[9px] font-bold text-white">
                    {heldOrders.length}
                  </span>
                ) : null}
              </span>
              <span className={cn("text-[11px] font-semibold", MUTED)}>معلقة</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCustomerDialogOpen(true)}
              className="flex flex-col items-center gap-1.5 rounded-[10px] p-1.5 hover:bg-[#f7faff]"
            >
              <span className="flex size-10 items-center justify-center rounded-[10px] bg-[#f0fdf4] text-[#16a34a]">
                <UserRound className="size-[18px]" />
              </span>
              <span className={cn("text-[11px] font-semibold", MUTED)}>عميل</span>
            </button>

            <button
              type="button"
              onClick={() => setIsReturnDialogOpen(true)}
              className="flex flex-col items-center gap-1.5 rounded-[10px] p-1.5 hover:bg-[#f7faff]"
            >
              <span className="flex size-10 items-center justify-center rounded-[10px] bg-[#fef2f2] text-[#dc2626]">
                <Undo2 className="size-[18px]" />
              </span>
              <span className={cn("text-[11px] font-semibold", MUTED)}>إرجاع</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNoteDraft(orderNotes)
                setIsNoteDialogOpen(true)
              }}
              className="flex flex-col items-center gap-1.5 rounded-[10px] p-1.5 hover:bg-[#f7faff]"
            >
              <span className="relative flex size-10 items-center justify-center rounded-[10px] bg-[#fffbeb] text-[#d97706]">
                <StickyNote className="size-[18px]" />
                {orderNotes ? (
                  <span className="absolute -top-1 -end-1 size-2 rounded-full bg-[#d97706]" />
                ) : null}
              </span>
              <span className={cn("text-[11px] font-semibold", MUTED)}>ملاحظة</span>
            </button>
          </div>
        </section>
      </div>

      {/* Open shift dialog -- reachable from the top bar's warning chip or the cart's own prompt,
          whichever the cashier notices first. The rest of the screen (browsing, building a cart)
          stays usable without a shift; only the actual sale is gated. */}
      <Dialog open={isOpenShiftDialogOpen} onOpenChange={setIsOpenShiftDialogOpen}>
        <DialogContent className="sm:max-w-[24rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              بدء وردية جديدة
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              أدخل المبلغ النقدي في الدرج عند بداية الوردية.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              المبلغ الافتتاحي
            </Label>
            <div className="relative">
              <Wallet className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={openingCashAmount}
                onChange={(event) => setOpeningCashAmount(event.target.value)}
                placeholder="0.00"
                className={cn(FIELD_CLASS, "h-11 ps-9")}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={openingShift}
              onClick={() => void startShift()}
            >
              {openingShift ? "جارٍ الفتح..." : "بدء الوردية"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              disabled={openingShift}
              onClick={() => setIsOpenShiftDialogOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CashMovementDialog
        shiftId={isCashMovementOpen ? (myOpenShift?.id ?? null) : null}
        onOpenChange={setIsCashMovementOpen}
        onRecorded={() => setIsCashMovementOpen(false)}
      />

      <ShiftCloseDialog
        shift={isCloseShiftOpen ? myOpenShift : null}
        onOpenChange={setIsCloseShiftOpen}
        onClosed={() => {
          setIsCloseShiftOpen(false)
          void loadShifts()
        }}
      />

      {/* Checkout dialog -- a real split payment across one or more methods, opened by
          "المتابعة إلى الدفع". Customer and discount are set from the cart sidebar; this dialog
          is purely about settling the already-computed total. */}
      <Dialog
        open={isCheckoutOpen}
        onOpenChange={(open) => !checkingOut && setIsCheckoutOpen(open)}
      >
        <DialogContent className="sm:max-w-[58rem] [direction:rtl]">
          <DialogHeader className="flex-row items-start gap-3 text-right">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <Wallet className="size-5" />
            </span>
            <div>
              <DialogTitle className={cn("text-[18px] font-extrabold", HEADING)}>
                الرجاء دفع {formatAmount(total)}
              </DialogTitle>
              <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
                من خلال الطرق الآتية
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pe-1">
            {paymentMethods.length === 0 ? (
              <p className="rounded-[10px] bg-[#fffbeb] px-3 py-2.5 text-center text-[12px] font-semibold text-[#92400e]">
                لا توجد طريقة دفع مفعّلة لهذا الفرع. فعّل واحدة من إعدادات طرق الدفع.
              </p>
            ) : (
              // flex-wrap, not CSS grid: grid's column tracks are shared across every row, so an
              // incomplete last row (7 enabled methods wrapping to 4 + 3, say) would sit at the
              // same narrow width as a full row with empty space beside it. Flex rows are
              // independent -- grow=1 spreads each row's own leftover space across just the
              // tiles actually on it, so a shorter last row's tiles end up wider, not squeezed.
              <div className="flex flex-wrap gap-2.5">
                {paymentMethods.map((method) => (
                  <div key={method.code} className="grow shrink-0 basis-[260px]">
                    <PaymentTile
                      icon={PAYMENT_KIND_ICON[method.kind]}
                      name={method.name}
                      subtitle={method.subtitle}
                      amount={paymentAmounts[method.code] ?? ""}
                      selected={(Number(paymentAmounts[method.code]) || 0) > 0}
                      onAmountChange={(value) => setPaymentAmount(method.code, value)}
                      onSelectFull={() => {
                        // Tapping a card makes it the sole method for the whole total, clearing
                        // any other card -- if the whole total were already covered by another
                        // card (the common case, one method picked at a time), splitting it
                        // instead of switching to this one would always land the tap on 0.00 and
                        // read as "this card can't be picked." A deliberate split is still typed
                        // by hand into more than one field, not built by tapping cards in turn.
                        setPaymentAmounts({ [method.code]: total.toFixed(2) })
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-[16px] bg-[#f4f7fc] p-4">
                <div className="flex shrink-0 items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf1fe] text-[#2563eb]">
                    <UserRound className="size-5" />
                  </span>
                  <div className="min-w-0 text-right">
                    <p className={cn("text-[11.5px]", MUTED)}>العميل المحدد</p>
                    <p className={cn("max-w-[220px] truncate text-[15px] font-bold", HEADING)}>
                      {selectedCustomer.name}
                    </p>
                  </div>
                </div>
                <div className="h-10 w-px shrink-0 bg-[#dfe4ec]" />
                <div className="flex shrink-0 items-center gap-3">
                  <div className="min-w-0 text-right">
                    <p className={cn("text-[11.5px]", MUTED)}>رصيد العميل الحالي</p>
                    <p className="text-[15px] font-bold text-[#2563eb]">
                      {formatAmount(walletBalance)}
                    </p>
                  </div>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf1fe] text-[#2563eb]">
                    <PiggyBank className="size-5" />
                  </span>
                </div>
              </div>
            ) : null}

            {paidAmount > 0 ? (
              <div
                className={cn(
                  "flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[12.5px] font-bold",
                  nonCashExcess > 0
                    ? "bg-[#fef2f2] text-[#dc2626]"
                    : paymentSettled
                      ? "bg-[#f0fdf4] text-[#15803d]"
                      : "bg-[#fffbeb] text-[#92400e]"
                )}
              >
                <span>
                  {nonCashExcess > 0
                    ? "المبلغ المدخل عبر طريقة أخرى أكبر من الإجمالي"
                    : "المبلغ المتبقي"}
                </span>
                <span>
                  {formatAmount(
                    nonCashExcess > 0 ? nonCashExcess : stillOwed > 0 ? stillOwed : changeDue
                  )}
                </span>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="h-11 flex-1 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={checkingOut || checkoutBlocked}
              onClick={() => void completeCheckout()}
            >
              {checkingOut ? "جارٍ التأكيد..." : "إتمام العملية"}
              {checkingOut ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              disabled={checkingOut}
              onClick={() => setIsCheckoutOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount -- a percentage (always equivalent whether or not it's "of the tax-inclusive
          total") or a fixed SAR value (where that toggle actually changes the math, see the
          `discount` memo above). Draft state only commits to the real discount on "تأكيد". */}
      <Dialog open={isDiscountDialogOpen} onOpenChange={setIsDiscountDialogOpen}>
        <DialogContent className="sm:max-w-[34rem] [direction:rtl]">
          <DialogHeader className="flex-row items-start gap-3 text-right">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <BadgePercent className="size-5" />
            </span>
            <div>
              <DialogTitle className={cn("text-[17px] font-extrabold", HEADING)}>
                إضافة خصم على الفاتورة
              </DialogTitle>
              <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
                يمكنك إضافة خصم بقيمة محددة أو بنسبة مئوية
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className={cn("shrink-0 text-[13px] font-bold", HEADING)}>نوع الخصم</span>
              <div className="grid flex-1 grid-cols-2 gap-2.5">
                <DiscountTypeOption
                  icon={Percent}
                  label="نسبة مئوية"
                  selected={draftDiscountType === "percent"}
                  onClick={() => setDraftDiscountType("percent")}
                />
                <DiscountTypeOption
                  icon={Coins}
                  label="قيمة محددة"
                  selected={draftDiscountType === "fixed"}
                  onClick={() => setDraftDiscountType("fixed")}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={cn("shrink-0 text-[13px] font-bold", HEADING)}>قيمة الخصم</span>
              <div className="flex-1">
                <div className="flex items-center overflow-hidden rounded-[10px] border border-[#e8edf3] bg-white">
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    max={draftDiscountType === "percent" ? 100 : undefined}
                    step="0.01"
                    value={draftDiscountValue}
                    onChange={(event) => setDraftDiscountValue(event.target.value)}
                    placeholder="0"
                    className="h-12 flex-1 border-0 bg-transparent px-4 text-left text-[15px] font-semibold text-[#0d1b3e] outline-none placeholder:text-[#8098b4]"
                  />
                  <span className="flex h-12 shrink-0 items-center justify-center bg-[#f4f7fc] px-5 text-[15px] font-bold text-[#5b6b85]">
                    {draftDiscountType === "percent" ? "%" : "ر.س"}
                  </span>
                </div>
                <p className={cn("mt-1.5 text-[11px]", MUTED)}>
                  {draftDiscountType === "percent"
                    ? "أدخل نسبة الخصم من 0 إلى 100"
                    : "أدخل قيمة الخصم بالريال السعودي"}
                </p>
              </div>
            </div>

            <div className="rounded-[12px] bg-[#f4f7fc] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className={cn("text-[13px] font-bold", HEADING)}>هل الخصم يشمل الضريبة؟</p>
                <button
                  type="button"
                  onClick={() => setDraftDiscountIncludesTax((current) => !current)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] border px-3 py-2 transition-colors",
                    draftDiscountIncludesTax
                      ? "border-[#2563eb] bg-[#eff6ff]"
                      : "border-[#e5e9f0] bg-white"
                  )}
                >
                  <span
                    className={cn(
                      "text-[12.5px] font-bold",
                      draftDiscountIncludesTax ? "text-[#2563eb]" : HEADING
                    )}
                  >
                    يشمل الضريبة
                  </span>
                  <Checkbox
                    checked={draftDiscountIncludesTax}
                    onCheckedChange={(checked) => setDraftDiscountIncludesTax(checked === true)}
                    className="pointer-events-none size-5"
                  />
                </button>
              </div>
              <p className={cn("mt-1.5 text-[10.5px] leading-5", MUTED)}>
                في حال التفعيل، سيتم احتساب الخصم على المبلغ شامل الضريبة
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="h-11 flex-1 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={() => {
                setDiscountType(draftDiscountType)
                setDiscountValue(draftDiscountValue)
                setDiscountIncludesTax(draftDiscountIncludesTax)
                setIsDiscountDialogOpen(false)
              }}
            >
              تأكيد
              <Check className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              onClick={() => setIsDiscountDialogOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order note */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="sm:max-w-[22rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              ملاحظة على الطلب
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              تُحفظ مع الفاتورة عند إتمام الدفع.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            rows={4}
            placeholder="مثال: بدون سكر، تغليف هدية..."
            className="resize-none text-[13px]"
          />
          <DialogFooter className="gap-2">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={() => {
                setOrderNotes(noteDraft.trim())
                setIsNoteDialogOpen(false)
              }}
            >
              حفظ
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              onClick={() => setIsNoteDialogOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer picker */}
      <Dialog
        open={isCustomerDialogOpen}
        onOpenChange={(open) => {
          setIsCustomerDialogOpen(open)
          if (!open) setIsAddCustomerOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-[24rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              اختيار عميل
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              يملأ اسم العميل ورقم الجوال في الفاتورة.
            </DialogDescription>
          </DialogHeader>

          {isAddCustomerOpen ? (
            <div className="flex flex-col gap-3">
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  اسم العميل
                </Label>
                <Input
                  value={newCustomerName}
                  onChange={(event) => setNewCustomerName(event.target.value)}
                  placeholder="مثال: أحمد محمد"
                  className={cn(FIELD_CLASS, "h-11")}
                />
              </div>
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  رقم الجوال (اختياري)
                </Label>
                <Input
                  value={newCustomerPhone}
                  onChange={(event) => setNewCustomerPhone(event.target.value)}
                  placeholder="05xxxxxxxx"
                  className={cn(FIELD_CLASS, "h-11")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-11 flex-1 gap-2 rounded-[10px] bg-[#2563eb] text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
                  disabled={savingCustomer}
                  onClick={() => void createNewCustomer()}
                >
                  {savingCustomer ? "جارٍ الحفظ..." : "حفظ العميل"}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
                  disabled={savingCustomer}
                  onClick={() => setIsAddCustomerOpen(false)}
                >
                  رجوع
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
                  <Input
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="البحث بالاسم أو الجوال..."
                    className={cn(FIELD_CLASS, "h-11 ps-9")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(true)}
                  aria-label="إضافة عميل جديد"
                  className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#c7d9ff] bg-[#eff6ff] px-3 text-[12px] font-semibold text-[#2563eb]"
                >
                  <UserPlus className="size-4" />
                </button>
              </div>
              <div className="flex max-h-[16rem] flex-col gap-1.5 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setCustomerName("")
                    setCustomerPhone("")
                    setCustomerId(null)
                    setSelectedCustomer(null)
                    setIsCustomerDialogOpen(false)
                  }}
                  className="rounded-[10px] border border-dashed border-[#e8edf3] p-2.5 text-right text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
                >
                  عميل نقدي (بلا بيانات)
                </button>
                {filteredCustomers.length === 0 ? (
                  <p className={cn("py-6 text-center text-[12px]", MUTED)}>
                    لا يوجد عملاء مطابقون.
                  </p>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        setCustomerName(customer.name)
                        setCustomerPhone(customer.phone ?? "")
                        // Only a native ("Madar") customer has a real row this sale can be
                        // attributed to -- a synced storefront customer's id isn't a real
                        // customers.id, so it stays a name/phone snapshot only, same as before.
                        const isNative = customer.platform === "Madar"
                        setCustomerId(isNative ? customer.id : null)
                        setSelectedCustomer(isNative ? customer : null)
                        setIsCustomerDialogOpen(false)
                      }}
                      className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e8edf3] p-2.5 text-right hover:border-[#c7d9ff]"
                    >
                      <div className="min-w-0">
                        <p className={cn("text-[12.5px] font-semibold", HEADING)}>
                          {customer.name}
                        </p>
                        <p className={cn("text-[11px]", MUTED)}>
                          {customer.phone ?? customer.email}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {customer.platform === "Madar" ? (
                          <span className="rounded-full bg-[#eafaf0] px-2 py-0.5 text-[10px] font-semibold text-[#0f9d58]">
                            محفظة {formatAmount(customer.walletBalance ?? 0)}
                          </span>
                        ) : null}
                        {customer.platform === "Madar" && (customer.balanceDue ?? 0) > 0 ? (
                          <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[10px] font-semibold text-[#dc2626]">
                            مستحق {formatAmount(customer.balanceDue ?? 0)}
                          </span>
                        ) : null}
                        {customer.platform === "Madar" ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation()
                              setTopUpCustomer(customer)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return
                              event.stopPropagation()
                              event.preventDefault()
                              setTopUpCustomer(customer)
                            }}
                            className="rounded-full border border-[#c7d9ff] px-2 py-0.5 text-[10px] font-semibold text-[#2563eb] hover:bg-[#eff6ff]"
                          >
                            شحن
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Wallet top-up -- real money collected in advance, credited to a native customer's real
          wallet_balance (see native-customers-service.ts's topUpWallet). */}
      <Dialog
        open={topUpCustomer !== null}
        onOpenChange={(open) => !toppingUpWallet && !open && setTopUpCustomer(null)}
      >
        <DialogContent className="sm:max-w-[22rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              شحن محفظة {topUpCustomer?.name}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              الرصيد الحالي: {formatAmount(topUpCustomer?.walletBalance ?? 0)}
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>المبلغ</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={topUpAmount}
              onChange={(event) => setTopUpAmount(event.target.value)}
              placeholder="0.00"
              className={cn(FIELD_CLASS, "h-11 text-left")}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={toppingUpWallet || !(Number(topUpAmount) > 0)}
              onClick={() => void submitWalletTopUp()}
            >
              {toppingUpWallet ? "جارٍ الشحن..." : "شحن المحفظة"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              disabled={toppingUpWallet}
              onClick={() => setTopUpCustomer(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Returns -- reuses the real invoice status change (PATCH /v1/pos/invoices/:id/status) */}
      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent className="sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              تسجيل إرجاع
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              ابحث عن الفاتورة برقمها أو اسم العميل لتسجيل إرجاعها.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
            <Input
              value={returnSearch}
              onChange={(event) => setReturnSearch(event.target.value)}
              placeholder="رقم الفاتورة أو اسم العميل..."
              className={cn(FIELD_CLASS, "h-11 ps-9")}
            />
          </div>
          <div className="flex max-h-[18rem] flex-col gap-1.5 overflow-y-auto">
            {loadingReturnCandidates ? (
              <div
                className={cn("flex items-center justify-center gap-2 py-6 text-[12.5px]", MUTED)}
              >
                <Loader2 className="size-4 animate-spin" />
                جارٍ البحث...
              </div>
            ) : returnCandidates.length === 0 ? (
              <p className={cn("py-6 text-center text-[12px]", MUTED)}>لا توجد فواتير مطابقة.</p>
            ) : (
              returnCandidates.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e8edf3] p-2.5"
                >
                  <div>
                    <p className={cn("text-[12.5px] font-bold", HEADING)}>
                      {invoice.invoiceNumber}
                    </p>
                    <p className={cn("text-[11px]", MUTED)}>
                      {invoice.customerName ?? "عميل نقدي"} · {formatAmount(invoice.totalAmount)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={returningId === invoice.id}
                    className="h-8 rounded-[8px] border-[#fecaca] px-3 text-[11.5px] font-semibold text-[#dc2626] hover:bg-[#fef2f2]"
                    onClick={() => void submitReturn(invoice)}
                  >
                    {returningId === invoice.id ? "جارٍ..." : "تسجيل إرجاع"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Held orders -- real backend-persisted parked carts (pos_held_orders) */}
      <Dialog open={isHeldOrdersOpen} onOpenChange={setIsHeldOrdersOpen}>
        <DialogContent className="sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              الطلبات المعلقة
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              علّق الطلب الحالي لخدمة عميل آخر، أو استأنف طلبا معلقا.
            </DialogDescription>
          </DialogHeader>

          {cart.length > 0 ? (
            <Button
              variant="outline"
              disabled={holdingOrder}
              className="h-11 gap-2 rounded-[10px] border-[#c7d9ff] bg-[#eff6ff] text-[13px] font-semibold text-[#2563eb]"
              onClick={() => void holdCurrentOrder()}
            >
              <Layers className="size-4" />
              {holdingOrder ? "جارٍ التعليق..." : "علّق الطلب الحالي"}
            </Button>
          ) : null}

          <div className="flex max-h-[18rem] flex-col gap-1.5 overflow-y-auto">
            {heldOrders.length === 0 ? (
              <p className={cn("py-6 text-center text-[12px]", MUTED)}>لا توجد طلبات معلقة.</p>
            ) : (
              heldOrders.map((order) => {
                const orderTotal = order.items.reduce(
                  (sum, item) => sum + item.unitPrice * item.quantity,
                  0
                )
                const busy = heldOrderBusyId === order.id
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-2 rounded-[10px] border border-[#e8edf3] p-2.5"
                  >
                    <div>
                      <p className={cn("text-[12.5px] font-bold", HEADING)}>
                        {order.customerName ?? "عميل نقدي"}
                      </p>
                      <p className={cn("text-[11px]", MUTED)}>
                        {order.items.length} منتج · {formatAmount(orderTotal)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        disabled={busy}
                        className="h-8 rounded-[8px] bg-[#2563eb] px-3 text-[11.5px] font-semibold text-white hover:bg-[#1d4ed8]"
                        onClick={() => void resumeHeldOrder(order.id)}
                      >
                        استئناف
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        className="h-8 rounded-[8px] border-[#e8edf3] px-2.5 text-[#dc2626] hover:bg-[#fef2f2]"
                        aria-label="حذف"
                        onClick={() => void discardHeldOrder(order.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
