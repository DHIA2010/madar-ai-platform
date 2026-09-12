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

import { useEffect, useMemo, useState } from "react"
import {
  Calendar,
  Clock,
  Eye,
  Grid2x2,
  Layers,
  List,
  Loader2,
  LayoutGrid,
  Maximize,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  StickyNote,
  Store,
  Trash2,
  Undo2,
  UserPlus,
  UserRound,
  Wallet,
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
import { posPaymentMethodsService } from "@/features/pos/services/pos-payment-methods.service"
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
  const [discountAmount, setDiscountAmount] = useState("0")
  const [paymentMethodCode, setPaymentMethodCode] = useState("")
  const [paymentMethods, setPaymentMethods] = useState<Array<{ code: string; name: string }>>([])
  const [checkingOut, setCheckingOut] = useState(false)

  useEffect(() => {
    if (!isCheckoutOpen) return
    void posPaymentMethodsService
      .list()
      .then((methods) => {
        const enabled = methods.filter((method) => method.enabled)
        setPaymentMethods(enabled.map((method) => ({ code: method.code, name: method.name })))
        setPaymentMethodCode(enabled[0]?.code ?? "")
      })
      .catch(() => setPaymentMethods([]))
  }, [isCheckoutOpen])

  const discount = Number(discountAmount) || 0
  const taxable = Math.max(0, subtotal - discount)
  const tax = Math.round(taxable * VAT_RATE * 100) / 100
  const total = Math.round((taxable + tax) * 100) / 100

  const completeCheckout = async () => {
    // The checkout button itself is only ever shown when myOpenShift exists (see the cart
    // section below) -- this is a second, defensive check against calling this directly.
    if (!myOpenShift) {
      toast.error("لا توجد وردية مفتوحة.")
      return
    }
    if (!paymentMethodCode) {
      toast.error("اختر طريقة الدفع.")
      return
    }
    setCheckingOut(true)
    try {
      const invoice: Invoice = await posInvoicesService.create({
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        paymentMethodCode,
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
      setDiscountAmount("0")
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
        discountAmount: Number(discountAmount) || 0,
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
      setDiscountAmount("0")
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
      setDiscountAmount(String(held.discountAmount ?? 0))
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

          <div>
            <Label className={cn("mb-1.5 block text-[11px] font-semibold", HEADING)}>
              العميل (اختياري)
            </Label>
            <Input
              value={customerName}
              readOnly
              onClick={() => setIsCustomerDialogOpen(true)}
              placeholder="عميل نقدي"
              className={cn(FIELD_CLASS, "cursor-pointer caret-transparent")}
            />
          </div>

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

          <div className="mt-auto flex flex-col gap-1.5 border-t border-[#eef2f8] pt-3 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", HEADING)}>المجموع الفرعي</span>
              <span className={HEADING}>{formatAmount(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn("font-semibold", HEADING)}>
                الضريبة ({Math.round(VAT_RATE * 100)}٪)
              </span>
              <span className={HEADING}>
                {formatAmount(Math.round(subtotal * VAT_RATE * 100) / 100)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[15px] font-extrabold">
              <span className={HEADING}>الإجمالي</span>
              <span className="text-[#2563eb]">
                {formatAmount(Math.round((subtotal + subtotal * VAT_RATE) * 100) / 100)}
              </span>
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

      {/* Checkout dialog */}
      <Dialog
        open={isCheckoutOpen}
        onOpenChange={(open) => !checkingOut && setIsCheckoutOpen(open)}
      >
        <DialogContent className="sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              إتمام الدفع
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              اختر طريقة الدفع وأدخل أي خصم قبل تأكيد العملية.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  العميل
                </Label>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="عميل نقدي"
                  className={cn(FIELD_CLASS, "h-11")}
                />
              </div>
              <div>
                <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                  رقم الجوال
                </Label>
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="05xxxxxxxx"
                  className={cn(FIELD_CLASS, "h-11")}
                />
              </div>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                طريقة الدفع <span className="text-[#e0484d]">*</span>
              </Label>
              <AppSelect value={paymentMethodCode} onValueChange={setPaymentMethodCode}>
                <AppSelectTrigger className={cn(FIELD_CLASS, "h-11 w-full")}>
                  <AppSelectValue placeholder="اختر طريقة الدفع" />
                </AppSelectTrigger>
                <AppSelectContent>
                  {paymentMethods.map((method) => (
                    <AppSelectItem key={method.code} value={method.code}>
                      {method.name}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
              {paymentMethods.length === 0 ? (
                <p className="mt-1.5 text-[10.5px] text-[#e0484d]">
                  لا توجد طريقة دفع مفعّلة لهذا الفرع. فعّل واحدة من إعدادات طرق الدفع.
                </p>
              ) : null}
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                الخصم (اختياري)
              </Label>
              <div className="relative">
                <Wallet className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                  className={cn(FIELD_CLASS, "h-11 ps-9")}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 rounded-[10px] bg-[#f4f7fc] p-3 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className={cn("font-semibold", HEADING)}>المجموع الفرعي</span>
                <span className={HEADING}>{formatAmount(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={cn("font-semibold", HEADING)}>الخصم</span>
                <span className={HEADING}>-{formatAmount(discount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={cn("font-semibold", HEADING)}>
                  الضريبة ({Math.round(VAT_RATE * 100)}٪)
                </span>
                <span className={HEADING}>{formatAmount(tax)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[14px] font-extrabold">
                <span className={HEADING}>الإجمالي</span>
                <span className="text-[#2563eb]">{formatAmount(total)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={checkingOut || paymentMethods.length === 0}
              onClick={() => void completeCheckout()}
            >
              {checkingOut ? "جارٍ التأكيد..." : "تأكيد الدفع"}
              {checkingOut ? <Loader2 className="size-4 animate-spin" /> : null}
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
                        setIsCustomerDialogOpen(false)
                      }}
                      className="rounded-[10px] border border-[#e8edf3] p-2.5 text-right hover:border-[#c7d9ff]"
                    >
                      <p className={cn("text-[12.5px] font-semibold", HEADING)}>{customer.name}</p>
                      <p className={cn("text-[11px]", MUTED)}>{customer.phone ?? customer.email}</p>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
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
