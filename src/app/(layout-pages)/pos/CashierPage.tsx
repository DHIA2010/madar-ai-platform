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

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import QRCode from "qrcode"
import {
  BadgePercent,
  Banknote,
  Calendar,
  Check,
  Clock,
  Coins,
  CreditCard,
  EllipsisVertical,
  Eye,
  Grid2x2,
  Landmark,
  Layers,
  List,
  Loader2,
  LayoutGrid,
  Maximize,
  Minus,
  PackagePlus,
  Pencil,
  Percent,
  PiggyBank,
  Plus,
  Search,
  ShoppingCart,
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
import { taxRatesService, type TaxRate } from "@/features/pos/services/tax-rates.service"
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
  type ProductDetail,
  type ProductRecord,
} from "@/features/products/services/product-list.service"
import { customerListService } from "@/features/customers/services/customer-list.service"
import type { CustomerRecord } from "@/features/customers/types"
import {
  posSettingsService,
  DEFAULT_POS_SETTINGS,
  type PosSettings,
} from "@/features/pos/services/pos-settings.service"
import { openCashDrawerIfPaired } from "@/features/pos/services/pos-hardware"

import { ThermalInvoiceReceipt } from "./ThermalInvoiceReceipt"

import {
  AppSearchableSelect,
  type AppSearchableSelectOption,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const HEADING = "text-[#0d1b3e]"
// A darker secondary gray than the app's usual #8098b4 -- that shade read as too faint for this
// screen's own labels and captions.
const MUTED = "text-[#5b6b85]"
const FIELD_CLASS =
  "h-10 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

// A short generated tone (Web Audio API) rather than an external asset file -- there is no real
// "beep.mp3" anywhere in this app to reuse, and generating one is simpler and lighter than
// adding a binary asset for a single short sound.
function playScanBeep() {
  if (typeof window === "undefined") return
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "square"
    oscillator.frequency.value = 1800
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.08)
    oscillator.onended = () => void context.close()
  } catch {
    // Best-effort only -- a failed beep must never interrupt a real sale.
  }
}

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

// Per-browser/till, not a real backend record -- "remember" here means "what this specific
// till's browser last used," which is what Settings -> الكاشير -> "الاحتفاظ بآخر وسيلة دفع"
// actually promises (a shared, cross-device "last payment method" isn't a real concept the
// backend tracks anywhere).
const LAST_PAYMENT_METHOD_STORAGE_KEY = "pos-last-payment-method"

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
  // Set only for a "variable" product (size/color etc.) -- which specific combination was
  // picked, so its OWN stock (product_variants.stock, not the parent product's, which a variable
  // product never carries any of) is what actually gets decremented at checkout. Two different
  // variants of the same product are two different cart lines -- see lineKey below, the identity
  // every cart lookup/update uses instead of productId alone.
  variantId: string | null
  // Display only (e.g. "L / أحمر") -- the picked combination's own option values joined the same
  // way the Add Product page's variants table already does.
  variantLabel: string | null
  productName: string
  unitPrice: number
  quantity: number
  // Snapshotted from the product at add-to-cart time, same as productName/unitPrice -- null
  // means "use the organization's default rate". Lets this screen's own live total match what
  // invoices-service.ts will actually charge for a cart mixing standard and exempt/custom-rated
  // products, instead of applying one blanket rate to the whole cart.
  taxRateId: string | null
  // Also snapshotted at add-to-cart time -- whether unitPrice already includes VAT (Settings ->
  // الضرائب -> "الأسعار تشمل الضريبة", or a per-product conversion). Splits the same shown price
  // into net/tax instead of always adding tax on top, matching invoices-service.ts's own
  // gross/net handling.
  priceIncludesTax: boolean
  // A discount on just this one line -- independent of, and stacks with, the order-wide discount
  // dialog below. Kept as the same three raw fields (type/value/includesTax) as the order-wide
  // discount rather than a single resolved amount, so reopening this line's own discount dialog
  // shows exactly what was chosen instead of a reverse-engineered guess. discountValue === ""
  // means no discount, the default for every new line.
  discountType: "percent" | "fixed"
  discountValue: string
  discountIncludesTax: boolean
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

// One cart row's own overflow menu -- replaces what used to be a single standalone "%" button
// with a small popover offering both per-line actions (adding a discount, and overriding this
// sale's own sell price) side by side, so a third one can be added later without the row itself
// running out of room for more icon buttons.
function CartLineActionsMenu({
  hasDiscount,
  onAddDiscount,
  onEditPrice,
  compact = false,
  // Both default true so every existing call site keeps working unchanged -- these only go
  // false when Settings -> الكاشير has turned "تطبيق الخصومات" / "السماح بتعديل السعر يدوياً"
  // off, matching the platform's original unconditional behavior otherwise.
  showDiscountOption = true,
  showPriceEditOption = true,
}: {
  hasDiscount: boolean
  onAddDiscount: () => void
  onEditPrice: () => void
  compact?: boolean
  showDiscountOption?: boolean
  showPriceEditOption?: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!showDiscountOption && !showPriceEditOption) {
    return null
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="خيارات إضافية"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border",
            compact ? "size-6" : "size-7",
            hasDiscount
              ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
              : "border-[#e8edf3] text-[#5b6b85]"
          )}
        >
          <EllipsisVertical className={compact ? "size-3" : "size-3.5"} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 gap-1 p-1.5 [direction:rtl]">
        {showDiscountOption ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onAddDiscount()
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-right text-[12.5px] font-semibold hover:bg-[#f4f7fc]",
              HEADING
            )}
          >
            <Percent className="size-4 text-[#5b6b85]" />
            إضافة خصم على الصنف
          </button>
        ) : null}
        {showPriceEditOption ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onEditPrice()
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-right text-[12.5px] font-semibold hover:bg-[#f4f7fc]",
              HEADING
            )}
          >
            <Pencil className="size-4 text-[#5b6b85]" />
            تعديل سعر البيع
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

// A per-browser preference, not tied to any one sale -- read once on mount so a refresh or a trip
// to another screen and back lands the cashier exactly where they left the cart/products switch.
const CART_PREVIEW_STORAGE_KEY = "madar.pos.cartPreviewOpen"

function readStoredCartPreviewOpen(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(CART_PREVIEW_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export default function CashierPage() {
  const { currentUser } = useAuth()
  const { currentOrganization, currentWorkspace } = useWorkspace()

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // The organization's real configured tax rates (Settings -> الضرائب), not the hardcoded 15%
  // VAT_RATE fallback -- fetched once so this screen's own live total/change-due preview always
  // matches what POST /v1/pos/invoices will actually charge (invoices-service.ts's create()
  // resolves the exact same default rate and per-product overrides). autoApplyTax off zeroes
  // every line regardless of any override, mirroring the backend's own precedence exactly.
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  useEffect(() => {
    taxRatesService
      .list()
      .then(setTaxRates)
      .catch(() => setTaxRates([]))
  }, [])
  const autoApplyTax = currentOrganization?.settings.taxAutoApplyToProducts !== false
  // Starts at VAT_RATE so the page has an immediate number to render before the fetch above
  // resolves, same reasoning as VAT_RATE's own comment.
  const vatRate = !autoApplyTax
    ? 0
    : (taxRates.find((rate) => rate.isDefault && rate.isActive)?.ratePercent ?? VAT_RATE * 100) /
      100
  const ratePercentById = useMemo(
    () =>
      new Map(
        taxRates.filter((rate) => rate.isActive).map((rate) => [rate.id, rate.ratePercent / 100])
      ),
    [taxRates]
  )
  // A cart line's own effective rate: its product's override if it has one and that override
  // still resolves to a real active rate, otherwise the organization's default -- identical
  // precedence to invoices-service.ts's create().
  const lineTaxRate = useCallback(
    (line: CartLine) => {
      if (!autoApplyTax) return 0
      if (line.taxRateId) {
        const overridden = ratePercentById.get(line.taxRateId)
        if (overridden !== undefined) return overridden
      }
      return vatRate
    },
    [autoApplyTax, ratePercentById, vatRate]
  )

  // Resolves one cart line's own discount (type/value/includesTax) to a plain currency amount --
  // the same treatment the order-wide `discount` memo below gives its own fields: a percentage is
  // computed against the line's raw (gross) subtotal, a fixed amount is converted from
  // tax-inclusive to net first when requested (using this line's own effective rate, not one
  // blanket VAT rate). Clamped to [0, lineNet] regardless of type -- exactly the same clamp
  // invoices-service.ts's create() independently applies to whatever number it receives here, so
  // the two never disagree about how much of this one line a discount can actually reach.
  const resolveLineDiscount = useCallback(
    (line: CartLine) => {
      const raw = Number(line.discountValue)
      if (!raw || raw <= 0) return 0
      const lineSubtotal = line.unitPrice * line.quantity
      const lineRate = lineTaxRate(line)
      const lineNet = line.priceIncludesTax ? lineSubtotal / (1 + lineRate) : lineSubtotal
      const amountOff =
        line.discountType === "percent"
          ? lineSubtotal * (Math.min(100, Math.max(0, raw)) / 100)
          : line.discountIncludesTax
            ? raw / (1 + lineRate)
            : raw
      return Math.round(Math.min(Math.max(0, amountOff), lineNet) * 100) / 100
    },
    [lineTaxRate]
  )

  // Real, persisted POS behavior settings (Settings -> الكاشير) -- see pos-settings-service.ts
  // on the backend for the exact defaults, every one of which matches this screen's own
  // hardcoded behavior before this settings page existed, so a workspace that never opens it
  // sees no change here either.
  const [posSettings, setPosSettings] = useState<PosSettings>(DEFAULT_POS_SETTINGS)
  useEffect(() => {
    posSettingsService
      .get()
      .then(setPosSettings)
      .catch(() => setPosSettings(DEFAULT_POS_SETTINGS))
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
  // Lets a cashier switch to a clear, focused view of everything already in the cart -- useful
  // once it's grown long enough that the small always-visible cart panel gets hard to scan -- and
  // back to browsing products, the same two-icon switch this replaced. Persisted to localStorage
  // (per-browser, not per-sale) so a page refresh or a trip to another screen and back to the
  // cashier keeps whichever view the cashier was actually looking at -- only switching the grid
  // icon itself, or picking a category, ever forces it back to the products board (see
  // selectCategory below and the grid button's own onClick).
  const [isCartPreviewOpen, setIsCartPreviewOpenState] = useState(readStoredCartPreviewOpen)
  const setIsCartPreviewOpen = useCallback((next: boolean) => {
    setIsCartPreviewOpenState(next)
    try {
      window.localStorage.setItem(CART_PREVIEW_STORAGE_KEY, String(next))
    } catch {
      // Best-effort only -- losing this preference across a reload isn't worth surfacing an
      // error over (a private window, blocked site data, etc.).
    }
  }, [])

  // Settings -> الكاشير -> "زر عرض الشبكة" / "زر عرض القائمة" -- when one of the two view
  // buttons is turned off, force the OTHER view instead of leaving the cashier stuck on a view
  // whose own switch-back button no longer exists. Both off is a real, if unlikely,
  // configuration -- there's simply no button to switch either way then, so whichever view is
  // already active just stays.
  useEffect(() => {
    // The `&& posSettings.show*View` guard on the DESTINATION view is what matters here -- with
    // both off, switching away from whichever view is active would just flip it back next
    // render (its own condition would then fire), an infinite loop React actually throws on
    // ("Maximum update depth exceeded"), confirmed live. Only ever switch toward a view that's
    // still actually enabled.
    if (!posSettings.showListView && isCartPreviewOpen && posSettings.showGridView) {
      setIsCartPreviewOpen(false)
    } else if (!posSettings.showGridView && !isCartPreviewOpen && posSettings.showListView) {
      setIsCartPreviewOpen(true)
    }
  }, [posSettings.showGridView, posSettings.showListView, isCartPreviewOpen, setIsCartPreviewOpen])

  const searchInputRef = useRef<HTMLInputElement>(null)

  // Picking a category is a browsing action -- it only makes sense against the products board, so
  // it always jumps back there even if the cart view was open. The cart view otherwise stays up
  // for as long as the cashier left it that way (switching categories on its own never touches
  // it), which is what lets a cashier flip to it, glance at a long cart, and not have it get
  // silently swapped back by anything except this or the grid icon itself.
  function selectCategory(category: string) {
    setSelectedCategory(category)
    setIsCartPreviewOpen(false)
  }

  // A barcode scanner is just a very fast keyboard: it types the SKU then sends Enter on its
  // own, with no click ever touching the search box. Focus it as soon as the page opens (and
  // again once a sale completes, below) so a cashier can scan immediately without reaching for
  // the mouse. Depends on `shifts` (null while the page's own "جارٍ التحميل" screen is still
  // showing, before the search box even exists in the DOM) so this actually fires once the real
  // page mounts, not just once on the very first (loading) render.
  useEffect(() => {
    if (shifts === null) return
    searchInputRef.current?.focus()
  }, [shifts])

  const filteredProducts = useMemo(() => {
    const query = search.trim()
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory
      const matchesQuery = !query || product.name.includes(query) || product.sku.includes(query)
      return matchesCategory && matchesQuery && product.status === "Active"
    })
  }, [products, selectedCategory, search])

  // Enter is what a scanner sends right after typing the code -- an exact SKU match adds the
  // product straight to the cart and clears the box for the next scan, instead of leaving the
  // scanned code sitting in the search field as a name/SKU filter.
  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return
    // This exact-SKU-on-Enter fast path is what a real barcode gun's input looks like -- typing
    // a full SKU by hand and pressing Enter is indistinguishable from it, so "تفعيل قارئ
    // الباركود" off narrows to just this shortcut rather than the search box itself (which stays
    // usable for manual lookups either way via the suggestion dropdown below).
    if (!posSettings.enableBarcodeScanner) return
    const query = search.trim()
    if (!query) return

    const match = products.find((product) => product.status === "Active" && product.sku === query)
    if (!match) return

    event.preventDefault()
    if (posSettings.playScanSound) playScanBeep()
    // A variable product's own SKU is its PARENT's -- each real combination has its own SKU the
    // aggregated product list here doesn't carry, so an exact match on the parent can never mean
    // "this one specific combination" was scanned. Ask which one, same as clicking its tile would.
    if (match.productType === "variable") {
      void openVariantPicker(match)
    } else {
      addToCart(match)
    }
    setSearch("")
  }

  // A live type-ahead dropdown under the search box itself -- lets a cashier see and pick a
  // match without first looking down at the (possibly hidden, if cart view is open) products
  // board below. Only shown while the box actually has focus, and only for the first handful of
  // matches -- this is a quick-pick shortcut, not a second copy of the full grid.
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchSuggestions = useMemo(
    () => (search.trim() ? filteredProducts.slice(0, 6) : []),
    [search, filteredProducts]
  )

  function selectSearchSuggestion(product: ProductRecord) {
    if (product.productType === "variable") {
      void openVariantPicker(product)
    } else {
      addToCart(product)
    }
    setSearch("")
    searchInputRef.current?.focus()
  }

  // Quick "product doesn't exist yet" escape hatch, reachable straight from the search box's own
  // empty-results state -- a cashier facing a walk-in item that was never catalogued shouldn't
  // have to leave the till and go create it from the Products page first. Creates a real
  // pos_products row via the same POST /v1/products the Products page itself uses, then drops the
  // new product straight into both the local catalog list and the current cart.
  const [isQuickAddProductOpen, setIsQuickAddProductOpen] = useState(false)
  const [quickAddName, setQuickAddName] = useState("")
  const [quickAddSku, setQuickAddSku] = useState("")
  const [quickAddCategory, setQuickAddCategory] = useState("")
  const [quickAddStock, setQuickAddStock] = useState("")
  const [quickAddPrice, setQuickAddPrice] = useState("")
  const [quickAddPriceIncludesTax, setQuickAddPriceIncludesTax] = useState(false)
  const [savingQuickAddProduct, setSavingQuickAddProduct] = useState(false)

  function openQuickAddProduct(prefillName: string) {
    setQuickAddName(prefillName)
    setQuickAddSku("")
    // Left unset on purpose -- the combobox shows "غير محدد" (see its placeholder below) rather
    // than silently pre-picking one of the store's real categories for the cashier. Only stock
    // quantity gets a real prefilled default (see submitQuickAddProduct for the category's own
    // fallback, used only if this is truly never touched).
    setQuickAddCategory("")
    setQuickAddStock("1")
    setQuickAddPrice("")
    setQuickAddPriceIncludesTax(false)
    setIsQuickAddProductOpen(true)
  }

  // Same searchable/creatable combobox the full Add Product page's own category field uses (see
  // AddProduct.tsx) -- lets a cashier pick one of the store's real existing categories, or type a
  // new one on the spot exactly the same way that page's "إضافة فئة ..." option works. A real,
  // always-present "غير محدد" entry (value "") sits at the top of the list -- without it, once a
  // cashier picked a real category there was no way back to the unset state shown when the dialog
  // first opens; this makes that state a normal, clickable choice instead of just an initial one.
  const quickAddCategoryOptions = useMemo<AppSearchableSelectOption[]>(() => {
    const extra =
      quickAddCategory.trim() !== "" && !categories.includes(quickAddCategory)
        ? [quickAddCategory]
        : []
    return [
      { value: "", label: "غير محدد" },
      ...[...extra, ...categories].map((category) => ({ value: category, label: category })),
    ]
  }, [categories, quickAddCategory])

  const submitQuickAddProduct = async () => {
    const name = quickAddName.trim()
    if (!name) {
      toast.error("أدخل اسم المنتج.")
      return
    }
    const price = Number(quickAddPrice)
    if (!Number.isFinite(price) || price < 0) {
      toast.error("أدخل سعراً صحيحاً.")
      return
    }
    const category = quickAddCategory.trim() || "غير محدد"
    const stockQuantity = Math.max(0, Math.trunc(Number(quickAddStock) || 0))
    // A barcode-less walk-in item still needs a stock code for this product type -- generated
    // rather than left blank, since typing one by hand is exactly the friction this dialog exists
    // to skip.
    const sku = quickAddSku.trim() || `POS-${Date.now()}`
    setSavingQuickAddProduct(true)
    try {
      const created = await productListService.createProduct({
        productType: "simple",
        name,
        sku,
        category,
        description: "",
        status: "active",
        baseUnit: null,
        sellPrice: price,
        costPrice: null,
        stockQuantity,
        minStock: null,
        imageUrls: [],
        attributes: {},
        components: [],
        variantOptions: [],
        variants: [],
        taxRateId: null,
        priceIncludesTax: quickAddPriceIncludesTax,
      })
      // POST /v1/products only ever echoes back the fields it itself decided (id/status/tax
      // settings) -- sellPrice/category/stock aren't among them, so what was just submitted is
      // carried over by hand rather than re-fetched.
      const newProduct: ProductRecord = {
        id: created.id,
        name: created.name,
        sku: created.sku ?? sku,
        category,
        status: "Active",
        availableStock: stockQuantity,
        costPrice: null,
        sellingPrice: price,
        currency: "SAR",
        platform: "Madar",
        productType: created.productType,
        baseUnit: null,
        taxRateId: created.taxRateId,
        priceIncludesTax: created.priceIncludesTax,
        image: null,
        activityDate: new Date().toISOString(),
      }
      setProducts((current) => [...current, newProduct])
      addToCart(newProduct)
      toast.success("تمت إضافة المنتج.")
      setIsQuickAddProductOpen(false)
      setSearch("")
      searchInputRef.current?.focus()
    } catch {
      toast.error("تعذر إضافة المنتج.")
    } finally {
      setSavingQuickAddProduct(false)
    }
  }

  // Lets a cashier type an exact quantity instead of clicking +/- one at a time -- kept as
  // per-line draft text (rather than binding the input straight to line.quantity) so clearing the
  // field to retype a new number doesn't get read as "quantity 0" and delete the line before the
  // cashier finishes typing.
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({})

  function handleQuantityInputChange(key: string, raw: string) {
    const parsed = Number(raw)
    if (raw.trim() !== "" && Number.isInteger(parsed) && parsed >= 1) {
      updateQuantity(key, parsed)
      setQuantityDrafts((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    } else {
      setQuantityDrafts((current) => ({ ...current, [key]: raw }))
    }
  }

  function handleQuantityInputBlur(key: string) {
    setQuantityDrafts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  // --- Cart ------------------------------------------------------------------------------------

  const [cart, setCart] = useState<CartLine[]>([])

  // A variable product's own id is never a unique cart-line identity by itself -- two different
  // variants (Red/L and Blue/M) must stay two separate lines with their own quantities, not
  // collapse into one. Every cart lookup/update below (and every JSX call site that used to key
  // directly off line.productId) uses this instead.
  function lineKey(line: Pick<CartLine, "productId" | "variantId">): string {
    return line.variantId ? `${line.productId}::${line.variantId}` : line.productId
  }

  function addToCart(
    product: ProductRecord,
    variant?: { id: string; label: string; unitPrice: number | null }
  ) {
    const variantId = variant?.id ?? null
    const key = variantId ? `${product.id}::${variantId}` : product.id
    setCart((current) => {
      const existing = current.find((line) => lineKey(line) === key)
      if (existing) {
        return current.map((line) =>
          lineKey(line) === key ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [
        ...current,
        {
          productId: product.id,
          variantId,
          variantLabel: variant?.label ?? null,
          productName: product.name,
          unitPrice: variant?.unitPrice ?? product.sellingPrice,
          quantity: 1,
          taxRateId: product.taxRateId,
          priceIncludesTax: product.priceIncludesTax,
          discountType: "percent",
          discountValue: "",
          discountIncludesTax: true,
        },
      ]
    })
  }

  function updateQuantity(key: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => lineKey(line) !== key))
      return
    }
    setCart((current) =>
      current.map((line) => (lineKey(line) === key ? { ...line, quantity } : line))
    )
  }

  function clearCart() {
    setCart([])
  }

  // A "variable" product (size/color etc.) carries no stock and no single price of its own --
  // GET /v1/products (the list this whole grid is built from) deliberately collapses it down to
  // an aggregate stock/price, so which exact combination is being sold has to be asked for
  // separately, right before it's added to the cart. Fetched fresh on every open (not cached
  // alongside `products`) since a variant's own stock/price can change between page load and the
  // moment a cashier actually picks one.
  const [variantPickerProduct, setVariantPickerProduct] = useState<ProductRecord | null>(null)
  const [variantPickerDetail, setVariantPickerDetail] = useState<ProductDetail | null>(null)
  const [loadingVariantPicker, setLoadingVariantPicker] = useState(false)

  async function openVariantPicker(product: ProductRecord) {
    setVariantPickerProduct(product)
    setVariantPickerDetail(null)
    setLoadingVariantPicker(true)
    try {
      setVariantPickerDetail(await productListService.getProduct(product.id))
    } catch {
      toast.error("تعذر تحميل أنواع هذا المنتج.")
      setVariantPickerProduct(null)
    } finally {
      setLoadingVariantPicker(false)
    }
  }

  function pickVariant(variant: ProductDetail["variants"][number]) {
    if (!variantPickerProduct) return
    addToCart(variantPickerProduct, {
      id: variant.id,
      label: variant.optionValues.join(" / "),
      unitPrice: variant.price,
    })
    setVariantPickerProduct(null)
    setVariantPickerDetail(null)
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
  // accountBalance for the checkout dialog's live context panel.
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
  // Same open/draft/commit pattern as the order-wide discount above, scoped to one cart line --
  // lineDiscountTargetId is that line's productId, or null when the dialog is closed.
  const [lineDiscountTargetId, setLineDiscountTargetId] = useState<string | null>(null)
  const [draftLineDiscountType, setDraftLineDiscountType] = useState<"percent" | "fixed">("percent")
  const [draftLineDiscountValue, setDraftLineDiscountValue] = useState("")
  const [draftLineDiscountIncludesTax, setDraftLineDiscountIncludesTax] = useState(true)

  function openLineDiscountDialog(line: CartLine) {
    setLineDiscountTargetId(lineKey(line))
    setDraftLineDiscountType(line.discountType)
    setDraftLineDiscountValue(line.discountValue)
    setDraftLineDiscountIncludesTax(line.discountIncludesTax)
  }

  function confirmLineDiscount() {
    if (!lineDiscountTargetId) return
    setCart((current) =>
      current.map((line) =>
        lineKey(line) === lineDiscountTargetId
          ? {
              ...line,
              discountType: draftLineDiscountType,
              discountValue: draftLineDiscountValue,
              discountIncludesTax: draftLineDiscountIncludesTax,
            }
          : line
      )
    )
    setLineDiscountTargetId(null)
  }

  function removeLineDiscount(key: string) {
    setCart((current) =>
      current.map((line) => (lineKey(line) === key ? { ...line, discountValue: "" } : line))
    )
  }

  // Lets a cashier override one line's own unit price for just this sale -- a one-off markdown or
  // negotiated price, say -- without touching the product's own catalogue price (products state,
  // ProductRecord.sellingPrice) at all. Only this cart line's own snapshot changes; the next time
  // this product is added fresh, addToCart reads the real, unaffected catalogue price again.
  const [priceEditTargetId, setPriceEditTargetId] = useState<string | null>(null)
  const [draftSellPrice, setDraftSellPrice] = useState("")

  function openPriceEditDialog(line: CartLine) {
    setPriceEditTargetId(lineKey(line))
    setDraftSellPrice(String(line.unitPrice))
  }

  function confirmPriceEdit() {
    if (!priceEditTargetId) return
    const price = Number(draftSellPrice)
    if (!Number.isFinite(price) || price < 0) {
      toast.error("أدخل سعراً صحيحاً.")
      return
    }
    setCart((current) =>
      current.map((line) =>
        lineKey(line) === priceEditTargetId
          ? { ...line, unitPrice: Math.round(price * 100) / 100 }
          : line
      )
    )
    setPriceEditTargetId(null)
  }

  // One entry per enabled payment method, keyed by code -- an invoice can now be split across
  // more than one, so this replaces the old single `paymentMethodCode` selection.
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({})
  const [paymentMethods, setPaymentMethods] = useState<
    Array<{ code: string; name: string; subtitle: string; kind: PaymentKind }>
  >([])
  const [checkingOut, setCheckingOut] = useState(false)
  // The just-issued invoice, rendered into the hidden #zatca-print-invoice target right after
  // checkout so the browser's print dialog opens straight onto the real receipt -- a real
  // response from POST /v1/pos/invoices, not cart state, so it stays correct even after the cart
  // itself is cleared for the next sale. successQrDataUrl is generated once, up front (see
  // completeCheckout), so window.print() never fires before the QR image is actually ready.
  const [successInvoice, setSuccessInvoice] = useState<Invoice | null>(null)
  const [successQrDataUrl, setSuccessQrDataUrl] = useState<string | null>(null)

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

        // Settings -> الكاشير -> "الاحتفاظ بآخر وسيلة دفع" / "إظهار شاشة الدفع السريع" -- both
        // land here as "pre-fill one method with the full total the moment the dialog opens,"
        // just from a different source for which method: the last one this browser actually
        // used (localStorage, per-till, not a real backend record), or simply the first enabled
        // one when there's no real "last" to remember yet.
        if (posSettings.rememberLastPaymentMethod) {
          const lastCode = window.localStorage.getItem(LAST_PAYMENT_METHOD_STORAGE_KEY)
          const remembered = lastCode ? enabled.find((method) => method.code === lastCode) : null
          if (remembered) {
            setPaymentAmounts({ [remembered.code]: total.toFixed(2) })
            return
          }
        }
        if (posSettings.showQuickPaymentScreen && enabled.length > 0) {
          setPaymentAmounts({ [enabled[0].code]: total.toFixed(2) })
        }
      })
      .catch(() => setPaymentMethods([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckoutOpen])

  const discount = useMemo(() => {
    const raw = Number(discountValue)
    if (!raw || raw <= 0) return 0
    if (discountType === "percent") {
      const percent = Math.min(100, Math.max(0, raw))
      return Math.round(subtotal * (percent / 100) * 100) / 100
    }
    const amountOffSubtotal = discountIncludesTax ? raw / (1 + vatRate) : raw
    return Math.round(Math.min(Math.max(0, amountOffSubtotal), subtotal) * 100) / 100
  }, [discountType, discountValue, discountIncludesTax, subtotal, vatRate])
  // What "الخصم" actually shows below -- the order-wide discount above plus every line's own, so
  // that row never reads "0.00" while a line discount is genuinely reducing the total (a cashier
  // giving only an item-level discount would otherwise see no discount reflected anywhere in this
  // summary at all). Matches invoices-service.ts's own combined discount_amount exactly.
  const totalDiscount = useMemo(
    () =>
      Math.round(
        (discount + cart.reduce((sum, line) => sum + resolveLineDiscount(line), 0)) * 100
      ) / 100,
    [discount, cart, resolveLineDiscount]
  )
  // Discount is spread across cart lines by their share of the subtotal, and each line is taxed
  // at its own effective rate -- identical arithmetic to invoices-service.ts's create(), so this
  // screen's own total always matches what the real invoice will actually charge for a cart
  // mixing standard and exempt/custom-rated products. Reduces to the old single-rate formula
  // whenever every line shares one rate, which is still the common case.
  const { taxable, tax } = useMemo(() => {
    // A gross-priced (tax-inclusive) line's shown price already contains VAT, so it is converted
    // to its real net amount BEFORE the discount is applied -- the discount reduces the taxable
    // base, VAT is then computed on what's left of it. Identical order of operations to
    // invoices-service.ts's create(); doing the conversion after the discount instead (as this
    // screen briefly did) can disagree with the backend's real total whenever a discount is
    // combined with a gross-priced line, reproducing the same payment-mismatch bug class already
    // fixed twice this session for mixed-rate carts.
    // A line's own discount (see resolveLineDiscount) is subtracted first, same order as
    // invoices-service.ts's create(); the order-wide discount above is then spread across
    // whatever each line has left, by its share of that already-line-discounted net subtotal.
    const lineNets = cart.map((line) => {
      const lineSubtotal = line.unitPrice * line.quantity
      const lineRate = lineTaxRate(line)
      const lineNet = line.priceIncludesTax ? lineSubtotal / (1 + lineRate) : lineSubtotal
      const lineNetAfterItemDiscount = lineNet - resolveLineDiscount(line)
      return { lineNetAfterItemDiscount, lineRate }
    })
    const netSubtotalAfterItemDiscounts = lineNets.reduce(
      (sum, line) => sum + line.lineNetAfterItemDiscount,
      0
    )

    let taxableSum = 0
    let taxSum = 0
    for (const line of lineNets) {
      const lineShare =
        netSubtotalAfterItemDiscounts > 0
          ? line.lineNetAfterItemDiscount / netSubtotalAfterItemDiscounts
          : 0
      const lineTaxable = Math.max(0, line.lineNetAfterItemDiscount - discount * lineShare)
      taxableSum += lineTaxable
      taxSum += lineTaxable * line.lineRate
    }
    return {
      taxable: Math.round(taxableSum * 100) / 100,
      tax: Math.round(taxSum * 100) / 100,
    }
  }, [cart, discount, lineTaxRate, resolveLineDiscount])
  const total = Math.round((taxable + tax) * 100) / 100
  // Only meaningful to show a single "(15%)"-style label when every line in the cart actually
  // shares one effective rate -- a mixed cart's real rate varies per line, so the label just
  // says "الضريبة" with no percentage rather than naming one line's rate as if it applied to all.
  const cartTaxRatePercent =
    cart.length === 0 || cart.every((line) => lineTaxRate(line) === lineTaxRate(cart[0]))
      ? Math.round((cart[0] ? lineTaxRate(cart[0]) : vatRate) * 100)
      : null

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
  // Localized display name per payment method code, for the printed receipt -- the invoice
  // response itself only ever carries the code (see pos-invoices.service.ts's InvoicePayment).
  const paymentMethodNameByCode = useMemo(
    () => Object.fromEntries(paymentMethods.map((method) => [method.code, method.name])),
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
  // A negative account balance (the customer already owes money) has nothing available to spend
  // via the wallet-kind method -- floored at 0 rather than showing a negative "available" figure.
  const availableBalance = Math.max(0, selectedCustomer?.accountBalance ?? 0)
  const insufficientWallet =
    prepaidAmount > 0 && customerId !== null && prepaidAmount > availableBalance

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

  // Settings -> الكاشير -> "السماح بأكثر من وسيلة دفع" -- on by default (the platform's
  // original, unconditional split-payment behavior). Off means typing into one method's field
  // clears every other one instead of adding to it, so the total can only ever come from a
  // single method at a time.
  const setPaymentAmount = (code: string, value: string) =>
    setPaymentAmounts((current) =>
      posSettings.allowSplitPayment ? { ...current, [code]: value } : { [code]: value }
    )

  // Settings -> الكاشير -> "تأكيد عملية البيع" -- off by default (the platform's original,
  // unconditional behavior: straight from the checkout button to the print preview). When on,
  // completeCheckout() stops here and opens this confirmation instead of calling
  // performCheckout() directly; the dialog's own confirm button is what actually calls it.
  const [isConfirmSaleOpen, setIsConfirmSaleOpen] = useState(false)

  const completeCheckout = () => {
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

    if (posSettings.confirmSale) {
      setIsConfirmSaleOpen(true)
      return
    }
    void performCheckout()
  }

  const performCheckout = async () => {
    setIsConfirmSaleOpen(false)
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
          variantId: line.variantId,
          productName: line.productName,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          discountAmount: resolveLineDiscount(line),
        })),
      })
      toast.success(`تمت العملية بنجاح — فاتورة ${invoice.invoiceNumber}`)
      if (posSettings.rememberLastPaymentMethod) {
        const usedCode = nonCashEntries[0]?.code ?? cashEntries[0]?.code
        if (usedCode) window.localStorage.setItem(LAST_PAYMENT_METHOD_STORAGE_KEY, usedCode)
      }
      // Fire-and-forget -- silently a no-op when unsupported or nothing was ever paired via
      // Settings -> الكاشير -> اختبار الطباعة (see pos-hardware.ts), never blocks the sale.
      if (posSettings.autoOpenCashDrawer) {
        void openCashDrawerIfPaired()
      }
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

      // Straight to the print preview -- no confirmation screen in between. The QR image is
      // generated up front (not left to ThermalInvoiceReceipt's own effect) so window.print()
      // never fires onto a still-loading QR; a short delay after mounting the hidden print target
      // gives the browser one paint cycle to actually render it before the print dialog opens.
      const qrDataUrl = invoice.qrCode
        ? await QRCode.toDataURL(invoice.qrCode, { margin: 0, width: 180 }).catch(() => null)
        : null
      setSuccessQrDataUrl(qrDataUrl)
      setSuccessInvoice(invoice)
      if (posSettings.autoPrintInvoice) {
        window.setTimeout(() => {
          window.print()
          // window.print() blocks until the print dialog closes, so this runs right as the
          // cashier lands back on the POS screen -- ready for the next barcode scan with no
          // click needed.
          searchInputRef.current?.focus()
        }, 150)
      } else {
        searchInputRef.current?.focus()
      }
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
        region: null,
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
  // Real money a cashier collected in advance, credited to the customer's real unified account
  // balance -- the exact same real event as a "سند قبض" (receipt), so it submits through that
  // same endpoint (see native-customers-service.ts's createAccountTransaction). Only ever
  // offered for a native ("Madar") customer, since a synced storefront one has no real account.

  const [topUpCustomer, setTopUpCustomer] = useState<CustomerRecord | null>(null)
  const [topUpAmount, setTopUpAmount] = useState("")
  const [topUpPaymentMethodCode, setTopUpPaymentMethodCode] = useState("")
  const [toppingUpWallet, setToppingUpWallet] = useState(false)

  // A top-up needs the real enabled catalog too (same data the checkout dialog fetches, just
  // triggered independently since this dialog can open without ever opening checkout).
  useEffect(() => {
    if (!topUpCustomer) return
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
  }, [topUpCustomer])

  // Only a method that's real money handed over can fund a top-up -- آجل/محفظة العميل themselves
  // would be circular, same rule the backend enforces.
  const topUpEligibleMethods = paymentMethods.filter((method) =>
    (["cash", "card", "transfer", "wallet"] as PaymentKind[]).includes(method.kind)
  )

  const submitWalletTopUp = async () => {
    if (!topUpCustomer) return
    const amount = Math.round((Number(topUpAmount) || 0) * 100) / 100
    if (!(amount > 0)) {
      toast.error("أدخل مبلغاً صحيحاً.")
      return
    }
    if (!topUpPaymentMethodCode) {
      toast.error("اختر طريقة الدفع التي استلمت بها المبلغ.")
      return
    }
    setToppingUpWallet(true)
    try {
      const updated = await customerListService.createReceipt(topUpCustomer.id, {
        amount,
        taxInclusive: false,
        taxAmount: 0,
        paymentMethodCode: topUpPaymentMethodCode,
        notes: null,
        attachments: [],
      })
      toast.success(`تم شحن محفظة ${updated.name} بمبلغ ${formatAmount(amount)}.`)
      setCustomers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      setSelectedCustomer((current) => (current?.id === updated.id ? updated : current))
      setTopUpCustomer(null)
      setTopUpAmount("")
      setTopUpPaymentMethodCode("")
    } catch {
      toast.error("تعذر شحن المحفظة.")
    } finally {
      setToppingUpWallet(false)
    }
  }

  // --- Returns -------------------------------------------------------------------------------
  // Reuses the real POST /v1/pos/invoices/:id/returns the Invoices page's own return dialog
  // already calls -- one real return flow, just reachable from here too. This quick search-and-
  // click action always returns every remaining unit of every line (the full-invoice case of that
  // same itemized endpoint); a cashier who needs to return only SOME items uses the Invoices page
  // itself, which offers per-line quantities.

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
      await posInvoicesService.createReturn(invoice.id, {
        items: invoice.items.map((item) => ({
          invoiceItemId: item.id,
          quantity: item.quantity - item.returnedQuantity,
        })),
        // This quick action has no dedicated method picker (unlike InvoicesPage's itemized
        // return dialog) -- default to refunding through whatever the sale was originally paid
        // with. Single line, so amount is inferred as the return's own full computed total.
        payments: [{ paymentMethodCode: invoice.paymentMethodCode }],
        notes: null,
      })
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
          variantId: line.variantId,
          productName: line.productName,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          discountAmount: resolveLineDiscount(line),
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
            variantId: item.variantId ?? null,
            variantLabel: item.variantLabel ?? null,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            // A held cart's own stored item has no tax_rate_id of its own -- re-resolved from
            // the product's CURRENT setting, same as adding it fresh would, so a product's tax
            // assignment changing while a cart sat on hold is reflected correctly on resume.
            taxRateId: products.find((product) => product.id === item.productId)?.taxRateId ?? null,
            priceIncludesTax:
              products.find((product) => product.id === item.productId)?.priceIncludesTax ?? false,
            // A held item only ever kept a flat SAR amount too -- same "fixed, not tax-inclusive"
            // reconstruction as the order-wide discount just above.
            discountType: "fixed",
            discountValue: item.discountAmount ? String(item.discountAmount) : "",
            discountIncludesTax: false,
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
    // lg:h-[...] pins this whole screen to the viewport so the page itself never scrolls -- only
    // the products grid and the cart's own item list do (see their individual overflow-y-auto
    // below). The subtracted 10.5rem is every other piece of AdminLayout's vertical chrome this
    // page sits inside: the sticky h-16 (4rem) header, the p-6 content wrapper's own top+bottom
    // padding (3rem), and Footer's h-14 (3.5rem) rendered right after it -- missing any one of
    // these left the page a few pixels taller than one viewport, which was still enough for the
    // browser to show (and let a stray scroll gesture reach) a whole-page scrollbar. Below lg, the
    // three columns stack vertically instead, where a normal scrolling page is what a merchant
    // actually wants on a small screen.
    <div dir="rtl" className="flex flex-col gap-3 lg:h-[calc(100vh-10.5rem)] lg:overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-2xl border border-[#e8edf3] bg-white px-3 py-2.5">
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

      {/* Main layout: categories (right) | products (middle) | cart (left). Default grid
          align-items:stretch (left as-is, not overridden) gives all three columns the exact same
          height as this row -- itself pinned to lg:flex-1 min-h-0 within the fixed-height wrapper
          above -- so each column can scroll its own overflow independently instead of the page
          growing with however many products or cart lines there are. */}
      <div
        className={cn(
          "grid min-h-0 gap-3 lg:flex-1",
          posSettings.showCategoryPanel
            ? "lg:grid-cols-[200px_minmax(0,1fr)_400px]"
            : "lg:grid-cols-[minmax(0,1fr)_400px]"
        )}
      >
        {posSettings.showCategoryPanel ? (
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e8edf3] bg-white p-3">
            <div className="mb-2 flex shrink-0 items-center gap-1.5 px-1">
              <Grid2x2 className="size-4 text-[#8098b4]" />
              <span className={cn("text-[12.5px] font-bold", HEADING)}>الفئات</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => selectCategory("all")}
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
                  onClick={() => selectCategory(category)}
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
        ) : null}

        <section className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-[#e8edf3] bg-white p-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="امسح الباركود أو ابحث في المنتجات..."
                className={cn(FIELD_CLASS, "ps-9")}
              />
              {isSearchFocused && search.trim() ? (
                // onMouseDown's preventDefault (not onClick's) is what matters here -- it stops
                // the browser from blurring the search input in the first place, before that
                // blur handler above could hide this dropdown out from under the very click
                // meant to land on it.
                <div
                  onMouseDown={(event) => event.preventDefault()}
                  className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-[12px] border border-[#e8edf3] bg-white p-1.5 shadow-lg"
                >
                  {searchSuggestions.length > 0 ? (
                    searchSuggestions.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => selectSearchSuggestion(product)}
                        className="flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-right hover:bg-[#f4f7fc]"
                      >
                        <div className="min-w-0">
                          <p className={cn("truncate text-[12.5px] font-semibold", HEADING)}>
                            {product.name}
                          </p>
                          <p className={cn("text-[10.5px]", MUTED)}>SKU: {product.sku || "—"}</p>
                        </div>
                        <span className={cn("shrink-0 text-[12.5px] font-bold", HEADING)}>
                          {formatAmount(product.sellingPrice)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
                      <p className={cn("text-[12px] font-semibold", MUTED)}>
                        لا يوجد منتج مطابق لـ &quot;{search.trim()}&quot;
                      </p>
                      <button
                        type="button"
                        onClick={() => openQuickAddProduct(search.trim())}
                        className="flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-3 py-1.5 text-[12px] font-semibold text-[#2563eb] hover:bg-[#dbeafe]"
                      >
                        <PackagePlus className="size-3.5" />
                        إضافة منتج جديد
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            {posSettings.showGridView ? (
              <button
                type="button"
                aria-label="عرض المنتجات"
                onClick={() => setIsCartPreviewOpen(false)}
                className={cn(
                  "flex size-10 items-center justify-center rounded-[10px] border",
                  !isCartPreviewOpen
                    ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                    : "border-[#e8edf3] text-[#5b6b85]"
                )}
              >
                <Grid2x2 className="size-4" />
              </button>
            ) : null}
            {posSettings.showListView ? (
              <button
                type="button"
                aria-label="عرض عناصر السلة"
                onClick={() => setIsCartPreviewOpen(true)}
                className={cn(
                  "flex size-10 items-center justify-center rounded-[10px] border",
                  isCartPreviewOpen
                    ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                    : "border-[#e8edf3] text-[#5b6b85]"
                )}
              >
                <List className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isCartPreviewOpen ? (
              cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                    <ShoppingCart className="size-6" />
                  </span>
                  <p className={cn("text-[13px] font-bold", HEADING)}>السلة فارغة</p>
                  <p className={cn("max-w-[220px] text-[11.5px]", MUTED)}>
                    قم بإضافة منتجات من القائمة لبدء الطلب
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {cart.map((line) => (
                    <div
                      key={lineKey(line)}
                      className="flex items-center gap-3 rounded-2xl border border-[#e8edf3] bg-white p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-[12.5px] font-semibold", HEADING)}>
                          {line.productName}
                          {line.variantLabel ? (
                            <span className={cn("font-normal", MUTED)}> · {line.variantLabel}</span>
                          ) : null}
                        </p>
                        <p className={cn("text-[10.5px]", MUTED)}>{formatAmount(line.unitPrice)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label="إنقاص الكمية"
                          onClick={() => updateQuantity(lineKey(line), line.quantity - 1)}
                          className="flex size-10 items-center justify-center rounded-md border border-[#e8edf3] text-[#5b6b85]"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          aria-label="الكمية"
                          value={quantityDrafts[lineKey(line)] ?? String(line.quantity)}
                          onChange={(event) =>
                            handleQuantityInputChange(lineKey(line), event.target.value)
                          }
                          onBlur={() => handleQuantityInputBlur(lineKey(line))}
                          onFocus={(event) => event.target.select()}
                          className={cn(
                            "h-10 min-w-12 max-w-20 rounded-md border border-[#e8edf3] px-1.5 text-center text-[14px] font-semibold [appearance:textfield] [field-sizing:content] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                            HEADING
                          )}
                        />
                        <button
                          type="button"
                          aria-label="زيادة الكمية"
                          onClick={() => updateQuantity(lineKey(line), line.quantity + 1)}
                          className="flex size-10 items-center justify-center rounded-md border border-[#e8edf3] text-[#5b6b85]"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <div className="flex w-20 shrink-0 flex-col items-end gap-0.5">
                        <span className={cn("text-[13px] font-extrabold", HEADING)}>
                          {formatAmount(line.unitPrice * line.quantity)}
                        </span>
                        {resolveLineDiscount(line) > 0 ? (
                          <span className="text-[10px] font-semibold text-[#dc2626]">
                            -{formatAmount(resolveLineDiscount(line))}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuantity(lineKey(line), 0)}
                        aria-label="حذف"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#dc2626] hover:bg-[#fef2f2]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <CartLineActionsMenu
                        hasDiscount={resolveLineDiscount(line) > 0}
                        onAddDiscount={() => openLineDiscountDialog(line)}
                        onEditPrice={() => openPriceEditDialog(line)}
                        showDiscountOption={posSettings.applyDiscounts}
                        showPriceEditOption={posSettings.allowManualPriceEdit}
                      />
                    </div>
                  ))}
                </div>
              )
            ) : loadingProducts ? (
              <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
                <Loader2 className="size-4 animate-spin" />
                جارٍ تحميل المنتجات...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#e8edf3] bg-white p-10 text-center">
                <p className={cn("text-[12.5px]", MUTED)}>لا توجد منتجات مطابقة.</p>
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={() => openQuickAddProduct(search.trim())}
                    className="flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-3.5 py-2 text-[12.5px] font-semibold text-[#2563eb] hover:bg-[#dbeafe]"
                  >
                    <PackagePlus className="size-4" />
                    إضافة منتج جديد
                  </button>
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  "grid",
                  // Settings -> الكاشير -> "استخدام الوضع المبسط": a genuinely denser grid
                  // (more columns, tighter gaps/padding, no SKU line) so more products fit on
                  // screen with less scrolling -- not just a cosmetic relabel of the same layout.
                  posSettings.useCompactMode
                    ? "grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6"
                    : "grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
                )}
              >
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() =>
                      product.productType === "variable"
                        ? void openVariantPicker(product)
                        : addToCart(product)
                    }
                    className={cn(
                      "flex flex-col items-start rounded-2xl border border-[#e8edf3] bg-white text-right transition-colors hover:border-[#c7d9ff]",
                      posSettings.useCompactMode ? "gap-1 p-1.5" : "gap-2 p-3"
                    )}
                  >
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] bg-[#f4f7fc]">
                      {product.image && posSettings.showProductImages ? (
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
                        "line-clamp-2 font-semibold leading-tight",
                        posSettings.useCompactMode ? "text-[11px]" : "text-[12px]",
                        HEADING
                      )}
                    >
                      {product.name}
                    </p>
                    {posSettings.useCompactMode ? null : (
                      <p className={cn("text-[10.5px]", MUTED)}>SKU: {product.sku || "—"}</p>
                    )}
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={cn(
                          "font-extrabold",
                          posSettings.useCompactMode ? "text-[11.5px]" : "text-[13px]",
                          HEADING
                        )}
                      >
                        {formatAmount(product.sellingPrice)}
                      </span>
                      {posSettings.useCompactMode ? null : (
                        <span className="flex size-7 items-center justify-center rounded-full bg-[#2563eb] text-white">
                          <Plus className="size-4" />
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Fixed to the full column height (see the grid comment above) with the item list as
            the only flexible, scrolling part below -- keeps this panel's size constant, and its
            totals/checkout/quick-action controls always visible, regardless of how many lines are
            in the cart. */}
        <section className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-[#e8edf3] bg-white p-4">
          <div className="flex shrink-0 items-center justify-between gap-2">
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
            <div className="shrink-0">
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
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {cart.map((line) => (
                <div
                  key={lineKey(line)}
                  className="flex items-center gap-2 rounded-[10px] border border-[#e8edf3] p-2"
                >
                  <div className="flex-1">
                    <p className={cn("text-[12px] font-semibold", HEADING)}>
                      {line.productName}
                      {line.variantLabel ? (
                        <span className={cn("font-normal", MUTED)}> · {line.variantLabel}</span>
                      ) : null}
                    </p>
                    <p className={cn("text-[10.5px]", MUTED)}>
                      {formatAmount(line.unitPrice)}
                      {resolveLineDiscount(line) > 0 ? (
                        <span className="ms-1 font-semibold text-[#dc2626]">
                          -{formatAmount(resolveLineDiscount(line))}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="إنقاص الكمية"
                      onClick={() => updateQuantity(lineKey(line), line.quantity - 1)}
                      className="flex size-10 items-center justify-center rounded-md border border-[#e8edf3] text-[#5b6b85]"
                    >
                      <Minus className="size-3" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      aria-label="الكمية"
                      value={quantityDrafts[lineKey(line)] ?? String(line.quantity)}
                      onChange={(event) =>
                        handleQuantityInputChange(lineKey(line), event.target.value)
                      }
                      onBlur={() => handleQuantityInputBlur(lineKey(line))}
                      onFocus={(event) => event.target.select()}
                      className={cn(
                        "h-10 min-w-9 max-w-16 rounded-md border border-[#e8edf3] px-1.5 text-center text-[13px] font-semibold [appearance:textfield] [field-sizing:content] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        HEADING
                      )}
                    />
                    <button
                      type="button"
                      aria-label="زيادة الكمية"
                      onClick={() => updateQuantity(lineKey(line), line.quantity + 1)}
                      className="flex size-10 items-center justify-center rounded-md border border-[#e8edf3] text-[#5b6b85]"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateQuantity(lineKey(line), 0)}
                    aria-label="حذف"
                    className="flex size-6 items-center justify-center rounded-md text-[#dc2626] hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <CartLineActionsMenu
                    hasDiscount={resolveLineDiscount(line) > 0}
                    onAddDiscount={() => openLineDiscountDialog(line)}
                    onEditPrice={() => openPriceEditDialog(line)}
                    showDiscountOption={posSettings.applyDiscounts}
                    showPriceEditOption={posSettings.allowManualPriceEdit}
                    compact
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-2 border-t border-[#eef2f8] pt-3 text-[12.5px]">
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
                {posSettings.applyDiscounts ? (
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
                ) : null}
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
              <span className={HEADING}>{formatAmount(totalDiscount)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", HEADING)}>الإجمالي بعد الخصم</span>
              <span className={HEADING}>{formatAmount(taxable)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", HEADING)}>
                الضريبة{cartTaxRatePercent !== null ? ` (${cartTaxRatePercent}٪)` : ""}
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
              className="h-12 shrink-0 gap-2 rounded-[12px] bg-[#2563eb] text-[13.5px] font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
              onClick={() => setIsCheckoutOpen(true)}
            >
              <Wallet className="size-4" />
              المتابعة إلى الدفع
            </Button>
          ) : (
            <div className="flex shrink-0 flex-col gap-2">
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
          <div className="grid shrink-0 grid-cols-4 gap-1 border-t border-[#eef2f8] pt-3">
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

      {/* Quick "product doesn't exist" add -- reachable from the search box's own no-results
          state, so a walk-in item never means leaving the till to go create it from Products
          first. Minimal on purpose (name/SKU/price/tax), not the full product form. */}
      <Dialog
        open={isQuickAddProductOpen}
        onOpenChange={(open) => !savingQuickAddProduct && setIsQuickAddProductOpen(open)}
      >
        <DialogContent className="sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              إضافة منتج جديد
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              يُضاف المنتج إلى الكتالوج ويوضع في السلة الحالية مباشرة.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                اسم المنتج
              </Label>
              <Input
                value={quickAddName}
                onChange={(event) => setQuickAddName(event.target.value)}
                className={cn(FIELD_CLASS, "h-11")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  الباركود / SKU (اختياري)
                </Label>
                <Input
                  value={quickAddSku}
                  onChange={(event) => setQuickAddSku(event.target.value)}
                  placeholder="يُنشأ تلقائياً إن تُرك فارغاً"
                  className={cn(FIELD_CLASS, "h-11")}
                />
              </div>
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  الفئة
                </Label>
                <AppSearchableSelect
                  value={quickAddCategory}
                  options={quickAddCategoryOptions}
                  onChange={setQuickAddCategory}
                  onCreate={setQuickAddCategory}
                  createLabel={(draft) => `إضافة فئة "${draft}"`}
                  placeholder="غير محدد"
                  searchPlaceholder="ابحث أو اكتب فئة جديدة..."
                  emptyLabel="لا توجد فئة مطابقة"
                  ariaLabel="الفئة"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  السعر
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={quickAddPrice}
                    onChange={(event) => setQuickAddPrice(event.target.value)}
                    placeholder="0.00"
                    className={cn(FIELD_CLASS, "h-11 pe-10")}
                  />
                  <span
                    className={cn(
                      "pointer-events-none absolute inset-y-0 end-3 my-auto h-fit text-[12px] font-semibold",
                      MUTED
                    )}
                  >
                    ر.س
                  </span>
                </div>
              </div>
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  الكمية بالمخزون
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={quickAddStock}
                  onChange={(event) => setQuickAddStock(event.target.value)}
                  className={cn(
                    FIELD_CLASS,
                    "h-11 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  )}
                />
              </div>
            </div>
            <label className={cn("flex items-center gap-2 text-[12.5px] font-semibold", MUTED)}>
              <Checkbox
                checked={quickAddPriceIncludesTax}
                onCheckedChange={(checked) => setQuickAddPriceIncludesTax(checked === true)}
              />
              السعر يشمل الضريبة
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={savingQuickAddProduct}
              onClick={() => void submitQuickAddProduct()}
            >
              {savingQuickAddProduct ? "جارٍ الإضافة..." : "إضافة إلى السلة"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              disabled={savingQuickAddProduct}
              onClick={() => setIsQuickAddProductOpen(false)}
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
                لا توجد طريقة دفع مفعّلة لمساحة العمل هذه. فعّل واحدة من إعدادات طرق الدفع.
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
                      {formatAmount(availableBalance)}
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

      {/* Settings -> الكاشير -> "تأكيد عملية البيع". Only ever opened by completeCheckout() when
          that setting is on -- the actual sale still happens through performCheckout(), exactly
          the same call this dialog's own confirm button makes. */}
      <Dialog open={isConfirmSaleOpen} onOpenChange={setIsConfirmSaleOpen}>
        <DialogContent className="sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle>تأكيد عملية البيع</DialogTitle>
            <DialogDescription>
              سيتم تسجيل عملية بيع بقيمة {formatAmount(total)}. هل تريد المتابعة؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              className="h-11 flex-1 rounded-[10px] bg-[#2563eb] text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={checkingOut}
              onClick={() => void performCheckout()}
            >
              {checkingOut ? "جارٍ التأكيد..." : "تأكيد البيع"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              disabled={checkingOut}
              onClick={() => setIsConfirmSaleOpen(false)}
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

      {/* Same shell as the order-wide discount dialog above, scoped to one cart line -- stacks
          with it rather than replacing it (see resolveLineDiscount / invoices-service.ts). */}
      <Dialog
        open={lineDiscountTargetId !== null}
        onOpenChange={(open) => !open && setLineDiscountTargetId(null)}
      >
        <DialogContent className="sm:max-w-[34rem] [direction:rtl]">
          <DialogHeader className="flex-row items-start gap-3 text-right">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <BadgePercent className="size-5" />
            </span>
            <div>
              <DialogTitle className={cn("text-[17px] font-extrabold", HEADING)}>
                خصم على الصنف
              </DialogTitle>
              <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
                {cart.find((line) => lineKey(line) === lineDiscountTargetId)?.productName ?? ""}
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
                  selected={draftLineDiscountType === "percent"}
                  onClick={() => setDraftLineDiscountType("percent")}
                />
                <DiscountTypeOption
                  icon={Coins}
                  label="قيمة محددة"
                  selected={draftLineDiscountType === "fixed"}
                  onClick={() => setDraftLineDiscountType("fixed")}
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
                    max={draftLineDiscountType === "percent" ? 100 : undefined}
                    step="0.01"
                    value={draftLineDiscountValue}
                    onChange={(event) => setDraftLineDiscountValue(event.target.value)}
                    placeholder="0"
                    className="h-12 flex-1 border-0 bg-transparent px-4 text-left text-[15px] font-semibold text-[#0d1b3e] outline-none placeholder:text-[#8098b4]"
                  />
                  <span className="flex h-12 shrink-0 items-center justify-center bg-[#f4f7fc] px-5 text-[15px] font-bold text-[#5b6b85]">
                    {draftLineDiscountType === "percent" ? "%" : "ر.س"}
                  </span>
                </div>
                <p className={cn("mt-1.5 text-[11px]", MUTED)}>
                  {draftLineDiscountType === "percent"
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
                  onClick={() => setDraftLineDiscountIncludesTax((current) => !current)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] border px-3 py-2 transition-colors",
                    draftLineDiscountIncludesTax
                      ? "border-[#2563eb] bg-[#eff6ff]"
                      : "border-[#e5e9f0] bg-white"
                  )}
                >
                  <span
                    className={cn(
                      "text-[12.5px] font-bold",
                      draftLineDiscountIncludesTax ? "text-[#2563eb]" : HEADING
                    )}
                  >
                    يشمل الضريبة
                  </span>
                  <Checkbox
                    checked={draftLineDiscountIncludesTax}
                    onCheckedChange={(checked) => setDraftLineDiscountIncludesTax(checked === true)}
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
              onClick={confirmLineDiscount}
            >
              تأكيد
              <Check className="size-4" />
            </Button>
            {lineDiscountTargetId &&
            cart.find((line) => lineKey(line) === lineDiscountTargetId)?.discountValue ? (
              <Button
                variant="outline"
                className="h-11 rounded-[10px] border-[#fecaca] px-5 text-[13px] font-semibold text-[#dc2626] hover:bg-[#fef2f2]"
                onClick={() => {
                  if (lineDiscountTargetId) removeLineDiscount(lineDiscountTargetId)
                  setLineDiscountTargetId(null)
                }}
              >
                إزالة الخصم
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              onClick={() => setLineDiscountTargetId(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overrides just this cart line's own unitPrice for this sale only -- never calls
          productListService, so the product's real catalogue price is untouched (see
          openPriceEditDialog/confirmPriceEdit above). */}
      <Dialog
        open={priceEditTargetId !== null}
        onOpenChange={(open) => !open && setPriceEditTargetId(null)}
      >
        <DialogContent className="sm:max-w-[24rem] [direction:rtl]">
          <DialogHeader className="flex-row items-start gap-3 text-right">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <Pencil className="size-5" />
            </span>
            <div>
              <DialogTitle className={cn("text-[17px] font-extrabold", HEADING)}>
                تعديل سعر البيع
              </DialogTitle>
              <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
                {cart.find((line) => lineKey(line) === priceEditTargetId)?.productName ?? ""}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div>
            <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
              السعر الجديد
            </Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={draftSellPrice}
                onChange={(event) => setDraftSellPrice(event.target.value)}
                placeholder="0.00"
                className={cn(FIELD_CLASS, "h-12 pe-10 text-[15px] font-semibold")}
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
            <p className={cn("mt-1.5 text-[11px] leading-5", MUTED)}>
              يسري هذا السعر على هذه الفاتورة فقط، ولا يغيّر سعر المنتج في صفحة المنتجات.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="h-11 flex-1 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={confirmPriceEdit}
            >
              تأكيد
              <Check className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              onClick={() => setPriceEditTargetId(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Which combination of a "variable" product (size/color etc.) is actually being sold --
          see openVariantPicker/pickVariant above. Not every combination the author defined is
          necessarily sellable ("the page lets a combination be excluded" per the schema), so this
          lists only the real, stored rows -- never the full cartesian product. */}
      <Dialog
        open={variantPickerProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVariantPickerProduct(null)
            setVariantPickerDetail(null)
          }
        }}
      >
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              اختر النوع
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px]", MUTED)}>
              {variantPickerProduct?.name ?? ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {loadingVariantPicker ? (
              <div className={cn("flex items-center gap-2 p-6 text-[13px]", MUTED)}>
                <Loader2 className="size-4 animate-spin" />
                جارٍ التحميل...
              </div>
            ) : variantPickerDetail && variantPickerDetail.variants.length > 0 ? (
              variantPickerDetail.variants.map((variant) => {
                const stock = variant.stock ?? 0
                const outOfStock = stock <= 0
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => pickVariant(variant)}
                    className="flex items-center justify-between rounded-[10px] border border-[#e8edf3] p-3 text-right transition-colors hover:border-[#c7d9ff] hover:bg-[#f7f9fc]"
                  >
                    <div>
                      <p className={cn("text-[13px] font-semibold", HEADING)}>
                        {variant.optionValues.join(" / ")}
                      </p>
                      <p className={cn("text-[11px]", outOfStock ? "text-[#dc2626]" : MUTED)}>
                        {outOfStock ? "نفدت الكمية" : `المتوفر: ${stock}`}
                      </p>
                    </div>
                    <span className={cn("text-[13px] font-extrabold", HEADING)}>
                      {formatAmount(variant.price ?? variantPickerProduct?.sellingPrice ?? 0)}
                    </span>
                  </button>
                )
              })
            ) : (
              <p className={cn("p-6 text-center text-[12.5px]", MUTED)}>
                لا توجد أنواع متاحة لهذا المنتج.
              </p>
            )}
          </div>
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
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              (customer.accountBalance ?? 0) >= 0
                                ? "bg-[#eafaf0] text-[#0f9d58]"
                                : "bg-[#fef2f2] text-[#dc2626]"
                            )}
                          >
                            رصيد {formatAmount(Math.abs(customer.accountBalance ?? 0))}
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
          unified account balance via the same "سند قبض" endpoint (see
          native-customers-service.ts's createAccountTransaction). */}
      <Dialog
        open={topUpCustomer !== null}
        onOpenChange={(open) => {
          if (toppingUpWallet || open) return
          setTopUpCustomer(null)
          setTopUpAmount("")
          setTopUpPaymentMethodCode("")
        }}
      >
        <DialogContent className="sm:max-w-[24rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              شحن محفظة {topUpCustomer?.name}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              الرصيد الحالي: {formatAmount(topUpCustomer?.accountBalance ?? 0)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                المبلغ
              </Label>
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
            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                استلمت المبلغ عبر
              </Label>
              {topUpEligibleMethods.length === 0 ? (
                <p className="text-[11px] text-[#e0484d]">
                  لا توجد طريقة دفع مناسبة مفعّلة لمساحة العمل هذه.
                </p>
              ) : (
                <AppSelect value={topUpPaymentMethodCode} onValueChange={setTopUpPaymentMethodCode}>
                  <AppSelectTrigger className={cn(FIELD_CLASS, "h-11 w-full")}>
                    <AppSelectValue placeholder="اختر طريقة الدفع" />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {topUpEligibleMethods.map((method) => (
                      <AppSelectItem key={method.code} value={method.code}>
                        {method.name}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={toppingUpWallet || !(Number(topUpAmount) > 0) || !topUpPaymentMethodCode}
              onClick={() => void submitWalletTopUp()}
            >
              {toppingUpWallet ? "جارٍ الشحن..." : "شحن المحفظة"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
              disabled={toppingUpWallet}
              onClick={() => {
                setTopUpCustomer(null)
                setTopUpAmount("")
                setTopUpPaymentMethodCode("")
              }}
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

      {/* Print target, portaled to a real direct child of <body> -- NOT left nested inside this
          component's own tree. A `position: fixed` element nested deep in the page (the previous
          approach) still let the browser paginate the printed document against the FULL, very
          tall POS page underneath (visibility:hidden hides content but does not collapse its
          layout height), and a fixed element repeats on every one of those generated pages --
          which is exactly why a single sale was printing as 3-4 duplicate copies. Portaling
          straight to <body> plus `display: none` (not just visibility) on every OTHER direct
          child of <body> during print (see the style block) collapses the rest of the document
          to zero height, so the printed page is sized to just this receipt -- one page, once. */}
      {successInvoice &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="zatca-print-invoice" className="hidden print:block">
            <ThermalInvoiceReceipt
              invoice={successInvoice}
              paymentMethodNames={paymentMethodNameByCode}
              qrDataUrl={successQrDataUrl}
              sellerLogoUrl={currentOrganization?.logoUrl ?? null}
            />
          </div>,
          document.body
        )}
      <style>{`
        @media print {
          body > *:not(#zatca-print-invoice) { display: none !important; }
          /* 72mm, not the full 80mm roll width: a real thermal printer's actual printable area is
             narrower than the paper itself, and real browser print/PDF pipelines were still
             clipping the right edge of every RTL row even at 76mm -- flex "justify-between" rows
             push their end item flush to this box's own edge, so any mismatch between the
             browser's mm->px conversion and the OS print driver's own shows up there first
             (centered header text has natural slack and never revealed it). This single width
             here is the ONLY place page width is set; ThermalInvoiceReceipt just fills whatever
             it's given (w-full, with its own inner padding as a second buffer). */
          #zatca-print-invoice { width: 72mm; }
        }
        /* "auto" for the height half of this (size: 80mm auto) is the textbook way to describe a
           continuous thermal roll, but Chrome's actual print pipeline doesn't reliably honor it --
           confirmed live: a 13-15 line receipt that easily fits one continuous page still came back
           as "2 sheets of paper" in the real print dialog. A large explicit height is the
           established workaround (every real POS web app that prints to a roll printer uses some
           form of this): comfortably longer than any real receipt will ever be, so it always
           renders as one physical page/one roll-feed regardless of item count, with the printer
           driver (or a PDF viewer) simply not using the unprinted remainder. */
        @page { size: 80mm 2000mm; margin: 0; }
      `}</style>
    </div>
  )
}
