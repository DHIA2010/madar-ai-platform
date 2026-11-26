"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  Printer,
  ScanLine,
  Search,
  Shirt,
  SlidersHorizontal,
  StickyNote,
  Tag,
  Trash2,
  Truck,
  Wallet,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog } from "@/components/app"

import {
  type LaundryCatalog,
  type LaundryOrder,
  type LaundryOrderSummary,
  type LaundryPaymentSplit,
  type LaundryQuote,
  laundryService,
  type LaundrySettings,
} from "../services/laundry.service"
import { useLaundryPrinter } from "./print"
import {
  Choice,
  DateTimeField,
  errorText,
  FIELD,
  HEADING,
  LABEL,
  MUTED,
  PANEL,
  PRIMARY,
  SECONDARY,
  StatusBadge,
  useTx,
} from "./shell"

interface Line {
  itemId: string
  serviceId: string
  itemName: string
  serviceName: string
  price: number
  quantity: number
  note: string
  noteOpen: boolean
}

interface Method {
  code: string
  name: string
  kind: string
}

type PayChoice =
  | { mode: "full"; payments: LaundryPaymentSplit[] }
  | { mode: "deposit"; paymentMethodCode: string; amount: number }
  | { mode: "later" }

const round = (value: number) => Math.round(value * 100) / 100
const lineKey = (line: Pick<Line, "itemId" | "serviceId">) => `${line.itemId}:${line.serviceId}`

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// The cashier's laundry mode (the Laundry plugin inside the POS screen). The cashier works the
// way they sell: tap a piece, pick its service, and it lands in the cart; the cart carries the
// laundry's own options (urgent, delivery, notes, photos) and the customer's subscription. At
// payment: paid in full issues the tax invoice with the order; a deposit or "at pickup" saves the
// order only, and the invoice is issued when it is collected -- here too, from "تسليم طلب".
export function CashierLaundryMode({
  shiftOpen,
  onOpenShift,
  onInvoiced,
}: {
  // Money only moves with a shift open (the drawer must balance at closing).
  shiftOpen: boolean
  onOpenShift: () => void
  // A tax invoice was issued: the cashier prints it like any sale.
  onInvoiced: (invoiceNumber: string) => void
}) {
  const { tx, ar, money } = useTx()
  const printer = useLaundryPrinter()
  const [catalog, setCatalog] = useState<LaundryCatalog | null>(null)
  const [settings, setSettings] = useState<LaundrySettings | null>(null)
  const [methods, setMethods] = useState<Method[]>([])
  const [staff, setStaff] = useState<Array<{ userId: string; name: string }>>([])
  const [loadFailed, setLoadFailed] = useState(false)

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [pickedItem, setPickedItem] = useState<string | null>(null)

  const [lines, setLines] = useState<Line[]>([])
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [urgent, setUrgent] = useState(false)
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup")
  const [promisedAt, setPromisedAt] = useState("")
  const [pickupAddress, setPickupAddress] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [pickupAt, setPickupAt] = useState("")
  const [deliveryAt, setDeliveryAt] = useState("")
  const [driver, setDriver] = useState("")
  const [notes, setNotes] = useState("")
  const [photos, setPhotos] = useState<File[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [quote, setQuote] = useState<LaundryQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<LaundryOrder | null>(null)
  const [handOverOpen, setHandOverOpen] = useState(false)
  const [handOverSearch, setHandOverSearch] = useState("")
  const [readyCount, setReadyCount] = useState<number | null>(null)

  useEffect(() => {
    void Promise.all([
      laundryService.catalog(),
      laundryService.settings(),
      laundryService.paymentMethods().catch(() => []),
      laundryService.staff().catch(() => []),
    ])
      .then(([nextCatalog, nextSettings, nextMethods, nextStaff]) => {
        setCatalog(nextCatalog)
        setSettings(nextSettings)
        setMethods(nextMethods)
        setStaff(nextStaff)
      })
      .catch(() => setLoadFailed(true))
  }, [])

  // How many orders wait at the counter (on the "تسليم طلب" button).
  useEffect(() => {
    if (handOverOpen) return
    let active = true
    laundryService
      .orders({ status: "ready" })
      .then((items) => {
        if (active) setReadyCount(items.length)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [handOverOpen, created])

  // The cart priced by the server: the customer found by mobile, the pieces their subscription
  // covers, and the charges -- the total payment uses.
  const quoteKey = JSON.stringify({
    lines: lines.map((line) => [line.itemId, line.serviceId, line.quantity]),
    phone: phone.trim(),
    urgent,
    fulfilment,
  })
  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null)
      return
    }
    let active = true
    setQuoting(true)
    const timer = window.setTimeout(() => {
      laundryService
        .quote({
          customerPhone: phone.trim() || null,
          lines: lines.map(({ itemId, serviceId, quantity }) => ({ itemId, serviceId, quantity })),
          urgent,
          fulfilment,
          useSubscription: true,
        })
        .then((next) => {
          if (active) setQuote(next)
        })
        .catch(() => {
          if (active) setQuote(null)
        })
        .finally(() => {
          if (active) setQuoting(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey])

  const defaultPromised = useMemo(() => {
    if (!settings) return ""
    const hours = urgent ? settings.urgentTurnaroundHours : settings.turnaroundHours
    const at = new Date(Date.now() + hours * 3_600_000)
    at.setMinutes(Math.ceil(at.getMinutes() / 15) * 15, 0, 0)
    return at.toISOString()
  }, [settings, urgent])
  const promisedValue = promisedAt || defaultPromised

  // Shown until the server's price arrives (and when it can't be reached).
  const localItems = round(lines.reduce((sum, line) => sum + line.price * line.quantity, 0))
  const localUrgent =
    urgent && settings ? round((localItems * settings.urgentSurchargePercent) / 100) : 0
  const localDelivery = fulfilment === "delivery" && settings ? settings.deliveryFee : 0
  const totals = quote ?? {
    pieces: lines.reduce((sum, line) => sum + line.quantity, 0),
    covered: 0,
    itemsTotal: localItems,
    urgentFee: localUrgent,
    deliveryFee: localDelivery,
    total: round(localItems + localUrgent + localDelivery),
  }

  if (loadFailed) {
    return (
      <div className={cn(PANEL, "p-8 text-center text-[13px] lg:flex-1", MUTED)}>
        {tx("تعذر تحميل المغسلة. حدّث الصفحة.", "Couldn't load the laundry. Refresh the page.")}
      </div>
    )
  }
  if (!catalog || !settings) {
    return (
      <div className="flex items-center justify-center py-16 text-[#6b7b96] lg:flex-1">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const activeServices = catalog.services.filter((service) => service.active)
  const pricedServices = (itemId: string) =>
    activeServices.filter((service) => catalog.prices[`${itemId}:${service.id}`] !== undefined)
  const items = catalog.items.filter((item) => item.active && pricedServices(item.id).length > 0)
  const categories = Array.from(
    new Set(items.map((item) => item.category).filter((value): value is string => !!value))
  )
  const query = search.trim().toLowerCase()
  const shown = items.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (!query || item.name.toLowerCase().includes(query))
  )

  function addLine(itemId: string, serviceId: string) {
    if (!catalog) return
    const item = catalog.items.find((entry) => entry.id === itemId)
    const service = catalog.services.find((entry) => entry.id === serviceId)
    const price = catalog.prices[`${itemId}:${serviceId}`]
    if (!item || !service || price === undefined) return
    setLines((current) => {
      const existing = current.find((line) => lineKey(line) === `${itemId}:${serviceId}`)
      if (existing) {
        return current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [
        ...current,
        {
          itemId,
          serviceId,
          itemName: item.name,
          serviceName: service.name,
          price,
          quantity: 1,
          note: "",
          noteOpen: false,
        },
      ]
    })
  }

  function tapItem(itemId: string) {
    const services = pricedServices(itemId)
    if (services.length === 1) addLine(itemId, services[0].id)
    else setPickedItem(itemId)
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.flatMap((line) => {
        if (lineKey(line) !== key) return [line]
        const next = { ...line, ...patch }
        return next.quantity <= 0 ? [] : [next]
      })
    )
  }

  function resetCart() {
    setLines([])
    setPhone("")
    setName("")
    setUrgent(false)
    setFulfilment("pickup")
    setPromisedAt("")
    setPickupAddress("")
    setDeliveryAddress("")
    setPickupAt("")
    setDeliveryAt("")
    setDriver("")
    setNotes("")
    setPhotos([])
    setQuote(null)
  }

  async function save(choice: PayChoice) {
    setSaving(true)
    try {
      const order = await laundryService.createOrder({
        customerId: quote?.customer?.id ?? null,
        customerName: name.trim() || null,
        customerPhone: phone.trim() || null,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          serviceId: line.serviceId,
          quantity: line.quantity,
          note: line.note.trim() || null,
        })),
        urgent,
        promisedAt: promisedValue || null,
        fulfilment,
        pickupAddress: fulfilment === "delivery" ? pickupAddress.trim() || null : null,
        deliveryAddress: fulfilment === "delivery" ? deliveryAddress.trim() || null : null,
        pickupAt: fulfilment === "delivery" ? pickupAt || null : null,
        deliveryAt: fulfilment === "delivery" ? deliveryAt || null : null,
        driverUserId: fulfilment === "delivery" && driver ? driver : null,
        notes: notes.trim() || null,
        useSubscription: true,
        payment:
          choice.mode === "full"
            ? {
                mode: "full",
                paymentMethodCode: choice.payments[choice.payments.length - 1]?.paymentMethodCode,
                payments: choice.payments,
              }
            : choice.mode === "deposit"
              ? {
                  mode: "deposit",
                  paymentMethodCode: choice.paymentMethodCode,
                  amount: choice.amount,
                }
              : { mode: "later" },
      })
      for (const photo of photos) {
        const dataBase64 = await readAsBase64(photo)
        await laundryService
          .addPhoto(order.id, { contentType: photo.type || "image/jpeg", dataBase64 })
          .catch(() => toast.error(tx("تعذر رفع إحدى الصور.", "A photo couldn't be uploaded.")))
      }
      setPayOpen(false)
      resetCart()
      setCreated(order)
      // The customer's ticket first, then the tax invoice when it was paid in full.
      printer.print(order, "ticket")
      if (order.invoiceNumber) {
        const invoiceNumber = order.invoiceNumber
        window.setTimeout(() => onInvoiced(invoiceNumber), 1200)
      }
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setSaving(false)
    }
  }

  const picked = pickedItem ? catalog.items.find((item) => item.id === pickedItem) : null
  const phoneDigits = phone.replace(/\D/g, "")

  return (
    <div className="grid min-h-0 gap-3 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Pieces */}
      <section className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-[#e8edf3] bg-white p-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                // A scanned ticket (its QR is the order number) opens that order for pickup.
                if (event.key === "Enter" && /^LND-\d+$/i.test(search.trim())) {
                  setHandOverSearch(search.trim().toUpperCase())
                  setSearch("")
                  setHandOverOpen(true)
                }
              }}
              placeholder={tx(
                "ابحث عن قطعة، أو امسح إيصال طلب",
                "Find a piece, or scan an order ticket"
              )}
              className="h-11 w-full rounded-[12px] border border-[#e8edf3] bg-[#f8fafd] ps-9 pe-3 text-[13px] outline-none focus:border-[#2563eb]"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setHandOverSearch("")
              setHandOverOpen(true)
            }}
            className="relative flex h-11 shrink-0 items-center gap-2 rounded-[12px] bg-[#2563eb] px-4 text-[13px] font-bold text-white hover:bg-[#1d4ed8]"
          >
            <PackageCheck className="size-4" />
            {tx("تسليم طلب", "Hand over")}
            {readyCount ? (
              <span className="rounded-full bg-white px-1.5 text-[11px] font-extrabold text-[#2563eb]">
                {readyCount}
              </span>
            ) : null}
          </button>
        </div>

        {categories.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {["all", ...categories].map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setCategory(entry)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  category === entry
                    ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                    : "border-[#e8edf3] bg-white text-[#5b6b85] hover:border-[#c7d9ff]"
                )}
              >
                {entry === "all" ? tx("الكل", "All") : entry}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[#e8edf3] bg-white p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Shirt className="size-8 text-[#c3cfe0]" />
              <p className={cn("text-[13px]", MUTED)}>
                {tx("لا توجد قطع بأسعار بعد.", "No priced pieces yet.")}
              </p>
              <Link
                href={ROUTES.laundryPrices}
                className="text-[13px] font-bold text-[#2563eb] hover:underline"
              >
                {tx("أضف قائمة الأسعار", "Add the price list")}
              </Link>
            </div>
          ) : shown.length === 0 ? (
            <p className={cn("py-16 text-center text-[13px]", MUTED)}>
              {tx("لا توجد نتائج.", "No results.")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {shown.map((item) => {
                const services = pricedServices(item.id)
                const from = Math.min(
                  ...services.map((service) => catalog.prices[`${item.id}:${service.id}`])
                )
                const inCart = lines
                  .filter((line) => line.itemId === item.id)
                  .reduce((sum, line) => sum + line.quantity, 0)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => tapItem(item.id)}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-[14px] border p-3 text-center transition hover:border-[#2563eb]/50 hover:shadow-sm",
                      inCart > 0 ? "border-[#2563eb] bg-[#f5f9ff]" : "border-[#e8edf3] bg-white"
                    )}
                  >
                    {inCart > 0 ? (
                      <span className="absolute end-2 top-2 flex size-6 items-center justify-center rounded-full bg-[#2563eb] text-[11px] font-bold text-white">
                        {inCart}
                      </span>
                    ) : null}
                    <span className="flex size-12 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
                      <Shirt className="size-6" />
                    </span>
                    <span className={cn("line-clamp-2 text-[13px] font-bold", HEADING)}>
                      {item.name}
                    </span>
                    <span className="text-[12px] font-semibold text-[#2563eb]">
                      {services.length > 1 ? tx("من ", "from ") : ""}
                      {money(from)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Cart */}
      <section className="flex h-full min-h-0 flex-col gap-3 rounded-2xl border border-[#e8edf3] bg-white p-4">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className={cn("flex items-center gap-2 text-[15px] font-extrabold", HEADING)}>
            <Shirt className="size-4 text-[#2563eb]" />
            {tx("طلب مغسلة", "Laundry order")}
            {totals.pieces > 0 ? (
              <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[11.5px] font-bold text-[#2563eb]">
                {totals.pieces} {tx("قطعة", "pcs")}
              </span>
            ) : null}
          </h2>
          {lines.length > 0 ? (
            <button
              type="button"
              onClick={resetCart}
              className="text-[12px] font-semibold text-[#b42318] hover:underline"
            >
              {tx("إفراغ", "Clear")}
            </button>
          ) : null}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2">
          <input
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={tx("جوال العميل", "Customer mobile")}
            className={cn(FIELD, "h-10 text-end")}
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={quote?.customer?.name ?? tx("اسم العميل", "Customer name")}
            className={cn(FIELD, "h-10")}
          />
          {quote?.customer ? (
            <p className="col-span-2 text-[11.5px] font-semibold text-[#047857]">
              {tx("عميل مسجل", "Existing customer")}: {quote.customer.name}
              {quote.subscription
                ? ` · ${tx("اشتراك", "Plan")} ${quote.subscription.planName} (${quote.subscription.piecesLeft} ${tx("قطعة متبقية", "pcs left")})`
                : ""}
            </p>
          ) : phoneDigits.length >= 9 && !quoting && lines.length > 0 ? (
            <p className={cn("col-span-2 text-[11.5px]", MUTED)}>
              {tx("عميل جديد، يُضاف عند الحفظ.", "New customer, added on save.")}
            </p>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <Shirt className="size-9 text-[#c3cfe0]" />
            <p className={cn("text-[12.5px]", MUTED)}>
              {tx("اضغط على قطعة لإضافتها.", "Tap a piece to add it.")}
            </p>
          </div>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {lines.map((line) => {
              const key = lineKey(line)
              return (
                <li key={key} className="rounded-[12px] border border-[#eef2f8] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("truncate text-[13px] font-bold", HEADING)}>
                        {line.itemName}
                      </p>
                      <p className={cn("text-[11.5px]", MUTED)}>
                        {line.serviceName} · {money(line.price)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={tx("ملاحظة", "Note")}
                        onClick={() => updateLine(key, { noteOpen: !line.noteOpen })}
                        className={cn(
                          "rounded-lg border p-1",
                          line.note ? "border-[#fcd34d] bg-[#fffbeb]" : "border-[#e1e7f0]"
                        )}
                      >
                        <StickyNote className="size-3.5 text-[#d97706]" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[#e1e7f0] p-1"
                        onClick={() => updateLine(key, { quantity: line.quantity - 1 })}
                      >
                        {line.quantity === 1 ? (
                          <Trash2 className="size-3.5 text-[#b42318]" />
                        ) : (
                          <Minus className="size-3.5" />
                        )}
                      </button>
                      <span className="w-6 text-center text-[13px] font-bold">{line.quantity}</span>
                      <button
                        type="button"
                        className="rounded-lg border border-[#e1e7f0] p-1"
                        onClick={() => updateLine(key, { quantity: line.quantity + 1 })}
                      >
                        <Plus className="size-3.5" />
                      </button>
                      <span
                        className={cn("w-16 text-end text-[12.5px] font-bold", HEADING)}
                        dir="ltr"
                      >
                        {money(line.price * line.quantity)}
                      </span>
                    </div>
                  </div>
                  {line.noteOpen || line.note ? (
                    <input
                      value={line.note}
                      onChange={(event) => updateLine(key, { note: event.target.value })}
                      placeholder={tx("بقعة، زر ناقص، تعليمات...", "Stain, missing button...")}
                      className="mt-2 h-8 w-full rounded-[8px] border border-[#eef2f8] px-2 text-[12px] outline-none focus:border-[#2563eb]"
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setUrgent(!urgent)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold",
              urgent
                ? "border-[#f59e0b] bg-[#fffbeb] text-[#b45309]"
                : "border-[#e1e7f0] text-[#5b6b85]"
            )}
          >
            <Zap className="size-3.5" />
            {tx(
              `مستعجل +${settings.urgentSurchargePercent}%`,
              `Urgent +${settings.urgentSurchargePercent}%`
            )}
          </button>
          <button
            type="button"
            onClick={() => setFulfilment("pickup")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-semibold",
              fulfilment === "pickup"
                ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                : "border-[#e1e7f0] text-[#5b6b85]"
            )}
          >
            {tx("استلام من المحل", "Collects in store")}
          </button>
          <button
            type="button"
            onClick={() => {
              setFulfilment("delivery")
              setDetailsOpen(true)
            }}
            className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold",
              fulfilment === "delivery"
                ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                : "border-[#e1e7f0] text-[#5b6b85]"
            )}
          >
            <Truck className="size-3.5" />
            {tx("توصيل", "Delivery")}
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="ms-auto flex items-center gap-1 rounded-full border border-[#e1e7f0] px-3 py-1.5 text-[12px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
          >
            <SlidersHorizontal className="size-3.5" />
            {tx("التفاصيل", "Details")}
            {notes || photos.length > 0 ? (
              <span className="size-1.5 rounded-full bg-[#d97706]" />
            ) : null}
          </button>
        </div>
        <p className={cn("-mt-1 flex shrink-0 items-center gap-1 text-[11.5px]", MUTED)}>
          <Clock className="size-3" />
          {tx("جاهز", "Ready")}{" "}
          {promisedValue
            ? new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn" : "en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(promisedValue))
            : "—"}
        </p>

        <div className="flex shrink-0 flex-col gap-1.5 border-t border-[#eef2f8] pt-3 text-[12.5px]">
          <div className="flex justify-between">
            <span className={MUTED}>{tx("القطع", "Pieces")}</span>
            <span className={HEADING}>{money(totals.itemsTotal)}</span>
          </div>
          {totals.covered > 0 ? (
            <div className="flex justify-between text-[#047857]">
              <span>{tx("من الاشتراك", "On the plan")}</span>
              <span>
                {totals.covered} {tx("قطعة", "pcs")}
              </span>
            </div>
          ) : null}
          {totals.urgentFee > 0 ? (
            <div className="flex justify-between">
              <span className={MUTED}>{tx("رسوم الاستعجال", "Urgent charge")}</span>
              <span className={HEADING}>{money(totals.urgentFee)}</span>
            </div>
          ) : null}
          {totals.deliveryFee > 0 ? (
            <div className="flex justify-between">
              <span className={MUTED}>{tx("رسوم التوصيل", "Delivery fee")}</span>
              <span className={HEADING}>{money(totals.deliveryFee)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-[17px] font-extrabold">
            <span className={HEADING}>{tx("الإجمالي", "Total")}</span>
            <span className="flex items-center gap-1.5 text-[#2563eb]">
              {quoting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {money(totals.total)}
            </span>
          </div>
          <p className={cn("text-[11px]", MUTED)}>
            {settings.pricesIncludeTax
              ? tx("الأسعار شاملة الضريبة.", "Prices include VAT.")
              : tx("الأسعار قبل الضريبة.", "Prices before VAT.")}
          </p>
        </div>

        <button
          type="button"
          disabled={lines.length === 0 || quoting || saving}
          onClick={() => setPayOpen(true)}
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-[#2563eb] text-[14px] font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
        >
          <Wallet className="size-4" />
          {tx("الدفع وحفظ الطلب", "Pay and save order")}
        </button>
      </section>

      {/* A piece's services */}
      <AppDialog
        open={picked !== null && picked !== undefined}
        onOpenChange={(open) => !open && setPickedItem(null)}
        title={picked?.name ?? ""}
        description={tx("اختر الخدمة", "Pick the service")}
        contentClassName="max-w-md"
      >
        {picked ? (
          <div className="grid gap-2">
            {pricedServices(picked.id).map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => {
                  addLine(picked.id, service.id)
                  setPickedItem(null)
                }}
                className="flex h-14 items-center justify-between rounded-[12px] border border-[#e1e7f0] bg-white px-4 text-[14px] font-bold text-[#0b1738] transition hover:border-[#2563eb] hover:bg-[#f5f9ff]"
              >
                <span>{service.name}</span>
                <span className="text-[#2563eb]">
                  {money(catalog.prices[`${picked.id}:${service.id}`])}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </AppDialog>

      {/* Order details: ready time, delivery, notes, photos */}
      <OrderDetailsDialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        fulfilment={fulfilment}
        promisedAt={promisedValue}
        onPromisedAt={setPromisedAt}
        pickupAddress={pickupAddress}
        onPickupAddress={setPickupAddress}
        deliveryAddress={deliveryAddress}
        onDeliveryAddress={setDeliveryAddress}
        pickupAt={pickupAt}
        onPickupAt={setPickupAt}
        deliveryAt={deliveryAt}
        onDeliveryAt={setDeliveryAt}
        driver={driver}
        onDriver={setDriver}
        staff={staff}
        notes={notes}
        onNotes={setNotes}
        photos={photos}
        onPhotos={setPhotos}
      />

      <LaundryPayDialog
        key={payOpen ? "pay-open" : "pay-closed"}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={totals.total}
        methods={methods}
        shiftOpen={shiftOpen}
        onOpenShift={onOpenShift}
        canDeposit={phoneDigits.length >= 9 || !!quote?.customer}
        busy={saving}
        onConfirm={(choice) => void save(choice)}
      />

      <HandOverDialog
        open={handOverOpen}
        onClose={() => setHandOverOpen(false)}
        initialSearch={handOverSearch}
        methods={methods}
        shiftOpen={shiftOpen}
        onOpenShift={onOpenShift}
        onInvoiced={onInvoiced}
      />

      {/* Saved */}
      <AppDialog
        open={created !== null}
        onOpenChange={(open) => !open && setCreated(null)}
        title={tx("حُفظ الطلب", "Order saved")}
        contentClassName="max-w-md"
      >
        {created ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="size-11 text-[#16a34a]" />
            <p className={cn("text-[20px] font-extrabold", HEADING)} dir="ltr">
              {created.orderNumber}
            </p>
            <p className={cn("text-[13px]", MUTED)}>
              {created.pieces} {tx("قطعة", "pcs")} ·{" "}
              {created.paid
                ? tx(`مدفوع · فاتورة ${created.invoiceNumber ?? ""}`, "Paid")
                : created.depositAmount > 0
                  ? tx(
                      `عربون ${money(created.depositAmount)} · المتبقي ${money(created.due)}`,
                      `Deposit ${money(created.depositAmount)} · due ${money(created.due)}`
                    )
                  : tx(
                      `يُدفع عند الاستلام ${money(created.due)}`,
                      `Due at pickup ${money(created.due)}`
                    )}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className={SECONDARY}
                onClick={() => printer.print(created, "ticket")}
              >
                <Printer className="size-4" />
                {tx("إيصال العميل", "Customer ticket")}
              </button>
              <button
                type="button"
                className={SECONDARY}
                onClick={() => printer.print(created, "tags")}
              >
                <Tag className="size-4" />
                {tx("ملصقات القطع", "Piece tags")}
              </button>
              {created.invoiceNumber ? (
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => onInvoiced(created.invoiceNumber!)}
                >
                  <Printer className="size-4" />
                  {tx("الفاتورة الضريبية", "Tax invoice")}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className={cn(PRIMARY, "w-full")}
              onClick={() => setCreated(null)}
            >
              {tx("طلب جديد", "New order")}
            </button>
          </div>
        ) : null}
      </AppDialog>
      {printer.node}
    </div>
  )
}

// Ready time, delivery details, drop-off notes and photos -- kept off the cart so it stays short.
function OrderDetailsDialog(props: {
  open: boolean
  onClose: () => void
  fulfilment: "pickup" | "delivery"
  promisedAt: string
  onPromisedAt: (value: string) => void
  pickupAddress: string
  onPickupAddress: (value: string) => void
  deliveryAddress: string
  onDeliveryAddress: (value: string) => void
  pickupAt: string
  onPickupAt: (value: string) => void
  deliveryAt: string
  onDeliveryAt: (value: string) => void
  driver: string
  onDriver: (value: string) => void
  staff: Array<{ userId: string; name: string }>
  notes: string
  onNotes: (value: string) => void
  photos: File[]
  onPhotos: (value: File[]) => void
}) {
  const { tx } = useTx()
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <AppDialog
      open={props.open}
      onOpenChange={(open) => !open && props.onClose()}
      title={tx("تفاصيل الطلب", "Order details")}
      contentClassName="max-w-xl"
      footer={
        <button type="button" className={cn(PRIMARY, "w-full")} onClick={props.onClose}>
          {tx("تم", "Done")}
        </button>
      }
    >
      <div className="flex flex-col gap-4 overflow-y-auto pe-1">
        <div>
          <span className={LABEL}>{tx("موعد الجاهزية", "Ready by")}</span>
          <DateTimeField value={props.promisedAt} clearable={false} onChange={props.onPromisedAt} />
        </div>
        {props.fulfilment === "delivery" ? (
          <div className="grid gap-3 rounded-[14px] bg-[#f7f9fc] p-3 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>{tx("عنوان الاستلام من العميل", "Pickup address")}</span>
              <input
                className={FIELD}
                value={props.pickupAddress}
                onChange={(event) => props.onPickupAddress(event.target.value)}
              />
            </label>
            <label className="block">
              <span className={LABEL}>{tx("عنوان التوصيل", "Delivery address")}</span>
              <input
                className={FIELD}
                value={props.deliveryAddress}
                onChange={(event) => props.onDeliveryAddress(event.target.value)}
              />
            </label>
            <div>
              <span className={LABEL}>{tx("موعد الاستلام من العميل", "Pickup time")}</span>
              <DateTimeField value={props.pickupAt} onChange={props.onPickupAt} />
            </div>
            <div>
              <span className={LABEL}>{tx("موعد التوصيل", "Delivery time")}</span>
              <DateTimeField value={props.deliveryAt} onChange={props.onDeliveryAt} />
            </div>
            <div className="sm:col-span-2">
              <span className={LABEL}>{tx("المندوب", "Driver")}</span>
              <Choice
                value={props.driver}
                onChange={props.onDriver}
                placeholder={tx("بدون مندوب", "No driver")}
                options={[
                  { value: "", label: tx("بدون مندوب", "No driver") },
                  ...props.staff.map((person) => ({ value: person.userId, label: person.name })),
                ]}
              />
            </div>
          </div>
        ) : null}
        <label className="block">
          <span className={LABEL}>
            {tx("ملاحظات الاستلام (بقع، أضرار...)", "Drop-off notes (stains, damage...)")}
          </span>
          <textarea
            rows={2}
            value={props.notes}
            onChange={(event) => props.onNotes(event.target.value)}
            className="w-full rounded-[12px] border border-[#e1e7f0] px-3 py-2.5 text-[13px] outline-none focus:border-[#2563eb]"
          />
        </label>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            multiple
            className="hidden"
            onChange={(event) => {
              const chosen = Array.from(event.target.files ?? []).filter(
                (file) => file.size <= 5 * 1024 * 1024
              )
              props.onPhotos([...props.photos, ...chosen].slice(0, 10))
              if (fileInput.current) fileInput.current.value = ""
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={SECONDARY} onClick={() => fileInput.current?.click()}>
              <Camera className="size-4" />
              {tx("صور القطع", "Photos")}
            </button>
            {props.photos.map((photo, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11.5px]"
              >
                {photo.name.slice(0, 18)}
                <button
                  type="button"
                  onClick={() => props.onPhotos(props.photos.filter((_, i) => i !== index))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </AppDialog>
  )
}

// The money, like the cashier's own payment screen: one or more methods with their amounts, cash
// giving change. Returns the split to send, or null until it covers the amount exactly.
function usePaymentSplit(total: number, methods: Method[]) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const entries = Object.entries(amounts)
    .map(([code, value]) => ({ code, amount: round(Number(value) || 0) }))
    .filter((entry) => entry.amount > 0)
  const isCash = (code: string) => methods.find((method) => method.code === code)?.kind === "cash"
  const cash = round(entries.filter((e) => isCash(e.code)).reduce((s, e) => s + e.amount, 0))
  const nonCash = round(entries.filter((e) => !isCash(e.code)).reduce((s, e) => s + e.amount, 0))
  const neededFromCash = Math.max(0, round(total - nonCash))
  const appliedCash = Math.min(cash, neededFromCash)
  const change = Math.max(0, round(cash - neededFromCash))
  const left = Math.max(0, round(total - nonCash - appliedCash))
  const overpaid = nonCash - total > 0.004
  const settled = left < 0.01 && !overpaid && total > 0
  const cashCode = entries.find((entry) => isCash(entry.code))?.code
  const payments: LaundryPaymentSplit[] | null = settled
    ? [
        ...entries
          .filter((entry) => !isCash(entry.code))
          .map((entry) => ({ paymentMethodCode: entry.code, amount: entry.amount })),
        ...(appliedCash > 0 && cashCode
          ? [{ paymentMethodCode: cashCode, amount: round(appliedCash) }]
          : []),
      ]
    : null
  // Tapping a method puts what is still owed on it.
  const fill = (code: string) =>
    setAmounts((current) => {
      const others = Object.entries(current)
        .filter(([key]) => key !== code)
        .reduce((sum, [, value]) => sum + (Number(value) || 0), 0)
      return { ...current, [code]: Math.max(0, round(total - others)).toFixed(2) }
    })
  return { amounts, setAmounts, fill, left, change, overpaid, payments }
}

function PaymentSplitter({
  total,
  methods,
  split,
}: {
  total: number
  methods: Method[]
  split: ReturnType<typeof usePaymentSplit>
}) {
  const { tx, money } = useTx()
  if (methods.length === 0) {
    return (
      <p className={cn("rounded-[10px] bg-[#fffbeb] px-3 py-2 text-[12px] text-[#92400e]")}>
        {tx("لا توجد وسائل دفع مفعلة لهذا الفرع.", "No payment methods are on for this branch.")}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {methods.map((method) => (
        <div
          key={method.code}
          className={cn(
            "flex items-center gap-2 rounded-[12px] border p-1.5 ps-3",
            Number(split.amounts[method.code]) > 0
              ? "border-[#2563eb] bg-[#f5f9ff]"
              : "border-[#e1e7f0]"
          )}
        >
          <button
            type="button"
            onClick={() => split.fill(method.code)}
            className={cn("flex-1 text-start text-[13.5px] font-bold", HEADING)}
          >
            {method.name}
          </button>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            dir="ltr"
            value={split.amounts[method.code] ?? ""}
            onFocus={() => {
              if (!split.amounts[method.code]) split.fill(method.code)
            }}
            onChange={(event) =>
              split.setAmounts((current) => ({ ...current, [method.code]: event.target.value }))
            }
            placeholder="0.00"
            className="h-10 w-32 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-end text-[14px] font-bold outline-none focus:border-[#2563eb]"
          />
        </div>
      ))}
      <div
        className={cn(
          "flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[14px] font-extrabold",
          split.overpaid
            ? "bg-[#fef2f2] text-[#b42318]"
            : split.left > 0
              ? "bg-[#fffbeb] text-[#92400e]"
              : "bg-[#f0fdf4] text-[#15803d]"
        )}
      >
        <span>
          {split.overpaid
            ? tx("المبلغ أكبر من المطلوب", "More than the total")
            : split.left > 0
              ? tx("المتبقي", "Left to pay")
              : split.change > 0
                ? tx("الباقي للعميل", "Change")
                : tx("مكتمل", "Settled")}
        </span>
        <span>{split.overpaid ? "" : money(split.left > 0 ? split.left : split.change)}</span>
      </div>
      <p className={cn("text-[11px]", MUTED)}>
        {tx("المطلوب", "Total")} {money(total)}
      </p>
    </div>
  )
}

function NoShift({ onOpenShift }: { onOpenShift: () => void }) {
  const { tx } = useTx()
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] bg-[#fffbeb] px-3 py-2 text-[12px] font-semibold text-[#92400e]">
      {tx("افتح وردية لاستلام المبالغ.", "Open a shift to take payments.")}
      <button type="button" onClick={onOpenShift} className="font-bold underline">
        {tx("فتح وردية", "Open shift")}
      </button>
    </div>
  )
}

// Paying a new order: in full now (the tax invoice is issued with it), a deposit (onto the
// customer's account), or at pickup (the order only).
function LaundryPayDialog({
  open,
  onClose,
  total,
  methods,
  shiftOpen,
  onOpenShift,
  canDeposit,
  busy,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  total: number
  methods: Method[]
  shiftOpen: boolean
  onOpenShift: () => void
  canDeposit: boolean
  busy: boolean
  onConfirm: (choice: PayChoice) => void
}) {
  const { tx, money } = useTx()
  const free = total <= 0
  const [mode, setMode] = useState<PayChoice["mode"]>(free ? "later" : "full")
  const split = usePaymentSplit(total, methods)
  const [depositMethod, setDepositMethod] = useState(
    methods.find((method) => method.kind === "cash")?.code ?? methods[0]?.code ?? ""
  )
  const [deposit, setDeposit] = useState("")
  const depositAmount = round(Number(deposit) || 0)
  const needsShift = mode !== "later" && !shiftOpen
  const ready =
    !busy &&
    !needsShift &&
    (mode === "later" ||
      (mode === "full" && split.payments !== null) ||
      (mode === "deposit" &&
        canDeposit &&
        depositMethod &&
        depositAmount > 0 &&
        depositAmount < total))

  function confirm() {
    if (!ready) return
    if (mode === "full" && split.payments) onConfirm({ mode: "full", payments: split.payments })
    else if (mode === "deposit")
      onConfirm({ mode: "deposit", paymentMethodCode: depositMethod, amount: depositAmount })
    else onConfirm({ mode: "later" })
  }

  const options: Array<{ key: PayChoice["mode"]; title: string; hint: string }> = [
    {
      key: "full",
      title: tx("دفع كامل الآن", "Pay in full now"),
      hint: tx("تصدر الفاتورة الضريبية الآن", "The tax invoice is issued now"),
    },
    {
      key: "deposit",
      title: tx("عربون", "Deposit"),
      hint: tx("جزء الآن والباقي عند الاستلام", "Part now, the rest at pickup"),
    },
    {
      key: "later",
      title: tx("الدفع عند الاستلام", "Pay at pickup"),
      hint: tx("يُحفظ الطلب، والفاتورة عند الاستلام", "Order saved, invoice at pickup"),
    },
  ]

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={
        <span className="flex items-center gap-2">
          <Wallet className="size-4 text-[#2563eb]" />
          {tx("الدفع", "Payment")} · {money(total)}
        </span>
      }
      contentClassName="max-w-lg"
      footer={
        <button
          type="button"
          className={cn(PRIMARY, "h-12 w-full")}
          disabled={!ready}
          onClick={confirm}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "full"
            ? tx("إصدار الفاتورة وحفظ الطلب", "Issue invoice and save order")
            : tx("حفظ الطلب", "Save order")}
        </button>
      }
    >
      <div className="flex flex-col gap-3 overflow-y-auto pe-1">
        {free ? (
          <p className="rounded-[12px] bg-[#f0fdf4] px-3 py-2.5 text-[13px] font-semibold text-[#15803d]">
            {tx(
              "الطلب كله من اشتراك العميل، لا يوجد مبلغ.",
              "All on the customer's plan, nothing to pay."
            )}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMode(option.key)}
                className={cn(
                  "flex flex-col gap-1 rounded-[12px] border p-2.5 text-start transition",
                  mode === option.key
                    ? "border-[#2563eb] bg-[#eff6ff] ring-1 ring-[#2563eb]"
                    : "border-[#e1e7f0] bg-white hover:border-[#c7d9ff]"
                )}
              >
                <span
                  className={cn(
                    "text-[13px] font-bold",
                    mode === option.key ? "text-[#2563eb]" : HEADING
                  )}
                >
                  {option.title}
                </span>
                <span className={cn("text-[11px] leading-4", MUTED)}>{option.hint}</span>
              </button>
            ))}
          </div>
        )}

        {needsShift ? <NoShift onOpenShift={onOpenShift} /> : null}

        {mode === "full" && !free ? (
          <PaymentSplitter total={total} methods={methods} split={split} />
        ) : null}

        {mode === "deposit" ? (
          canDeposit ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {methods.map((method) => (
                  <button
                    key={method.code}
                    type="button"
                    onClick={() => setDepositMethod(method.code)}
                    className={cn(
                      "h-10 rounded-[10px] border px-3 text-[13px] font-bold",
                      depositMethod === method.code
                        ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                        : "border-[#e1e7f0] text-[#0b1738]"
                    )}
                  >
                    {method.name}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={deposit}
                onChange={(event) => setDeposit(event.target.value)}
                placeholder={tx("مبلغ العربون", "Deposit amount")}
                className={FIELD}
              />
              {depositAmount > 0 ? (
                <p className={cn("text-[12px]", MUTED)}>
                  {tx("المتبقي عند الاستلام", "Due at pickup")}{" "}
                  {money(Math.max(0, round(total - depositAmount)))}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-[10px] bg-[#fffbeb] px-3 py-2 text-[12px] font-semibold text-[#92400e]">
              {tx(
                "العربون يُسجل على حساب العميل، أدخل جواله في السلة أولًا.",
                "A deposit goes on the customer's account: enter their mobile in the cart first."
              )}
            </p>
          )
        ) : null}

        {mode === "later" && !free ? (
          <p className={cn("rounded-[12px] bg-[#f7f9fc] px-3 py-2.5 text-[12.5px]", MUTED)}>
            {tx(
              `يُحفظ الطلب الآن، ويُدفع ${money(total)} وتصدر الفاتورة عند الاستلام من «تسليم طلب».`,
              `The order is saved now; ${money(total)} is paid and invoiced at pickup from “Hand over”.`
            )}
          </p>
        ) : null}
      </div>
    </AppDialog>
  )
}

// Handing an order over at the counter: find it (number, mobile or name; the ready ones first),
// take what is owed with the same payment screen, and its tax invoice prints like a sale.
function HandOverDialog({
  open,
  onClose,
  initialSearch,
  methods,
  shiftOpen,
  onOpenShift,
  onInvoiced,
}: {
  open: boolean
  onClose: () => void
  initialSearch: string
  methods: Method[]
  shiftOpen: boolean
  onOpenShift: () => void
  onInvoiced: (invoiceNumber: string) => void
}) {
  const { tx } = useTx()
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={
        <span className="flex items-center gap-2">
          <PackageCheck className="size-4 text-[#2563eb]" />
          {tx("تسليم طلب", "Hand over an order")}
        </span>
      }
      contentClassName="max-w-[min(1000px,96vw)]"
    >
      {open ? (
        <HandOver
          initialSearch={initialSearch}
          methods={methods}
          shiftOpen={shiftOpen}
          onOpenShift={onOpenShift}
          onInvoiced={onInvoiced}
          onDone={onClose}
        />
      ) : null}
    </AppDialog>
  )
}

function HandOver({
  initialSearch,
  methods,
  shiftOpen,
  onOpenShift,
  onInvoiced,
  onDone,
}: {
  initialSearch: string
  methods: Method[]
  shiftOpen: boolean
  onOpenShift: () => void
  onInvoiced: (invoiceNumber: string) => void
  onDone: () => void
}) {
  const { tx, ar, money, dateTime } = useTx()
  const [search, setSearch] = useState(initialSearch)
  const [orders, setOrders] = useState<LaundryOrderSummary[] | null>(null)
  const [selected, setSelected] = useState<LaundryOrder | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const query = search.trim()
    laundryService
      .orders(query ? { status: "open", search: query } : { status: "ready" })
      .then((items) => {
        if (!active) return
        setOrders(items)
        // A scanned ticket opens its order straight away.
        if (
          query &&
          items.length === 1 &&
          items[0].orderNumber.toUpperCase() === query.toUpperCase()
        )
          void pick(items[0].id)
      })
      .catch(() => {
        if (active) setOrders([])
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function pick(id: string) {
    try {
      setSelected(await laundryService.order(id))
    } catch (error) {
      toast.error(errorText(error, ar))
    }
  }

  async function handOver(payments: LaundryPaymentSplit[] | null) {
    if (!selected) return
    setBusy(true)
    try {
      const done = await laundryService.collect(
        selected.id,
        payments?.[payments.length - 1]?.paymentMethodCode ?? null,
        payments ?? undefined
      )
      toast.success(tx(`سُلّم الطلب ${done.orderNumber}`, `Order ${done.orderNumber} handed over`))
      if (selected.due > 0 && done.invoiceNumber) onInvoiced(done.invoiceNumber)
      onDone()
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-0 gap-4 overflow-y-auto pe-1 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col gap-3">
        <div className="relative">
          <ScanLine
            className={cn("pointer-events-none absolute inset-y-0 start-3 my-auto size-4", MUTED)}
          />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tx(
              "امسح الإيصال أو اكتب رقم الطلب أو الجوال أو الاسم",
              "Scan the ticket, or type order no., mobile or name"
            )}
            className={cn(FIELD, "ps-9")}
          />
        </div>
        <p className={cn("text-[12px]", MUTED)}>
          {search.trim()
            ? tx("الطلبات المفتوحة المطابقة", "Matching open orders")
            : tx("الطلبات الجاهزة للاستلام", "Orders ready to collect")}
        </p>
        {orders === null ? (
          <div className="flex justify-center py-10 text-[#6b7b96]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <p className={cn(PANEL, "p-8 text-center text-[13px]", MUTED)}>
            {tx("لا توجد طلبات.", "No orders.")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => void pick(order.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-[14px] border bg-white p-3 text-start transition hover:border-[#2563eb]/50",
                  selected?.id === order.id
                    ? "border-[#2563eb] ring-1 ring-[#2563eb]"
                    : "border-[#e4e9f2]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-[13.5px] font-extrabold", HEADING)}>
                    {order.orderNumber}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                <span className={cn("truncate text-[12px]", MUTED)}>
                  {[order.customerName, order.customerPhone].filter(Boolean).join(" · ") ||
                    tx("عميل", "Customer")}
                </span>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className={HEADING}>
                    {order.pieces} {tx("قطعة", "pcs")}
                  </span>
                  {order.urgent ? <Zap className="size-3.5 text-[#b45309]" /> : null}
                  {order.fulfilment === "delivery" ? (
                    <Truck className="size-3.5 text-[#2563eb]" />
                  ) : null}
                  <span
                    className={
                      order.due > 0 ? "font-bold text-[#b42318]" : "font-bold text-[#047857]"
                    }
                  >
                    {order.due > 0 ? money(order.due) : tx("مدفوع", "Paid")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className={cn(PANEL, "flex h-fit flex-col gap-3 p-4")}>
        {!selected ? (
          <p className={cn("py-10 text-center text-[13px]", MUTED)}>
            {tx("اختر طلبًا لتسليمه.", "Pick an order to hand over.")}
          </p>
        ) : (
          <SelectedOrder
            key={selected.id}
            order={selected}
            methods={methods}
            shiftOpen={shiftOpen}
            onOpenShift={onOpenShift}
            busy={busy}
            dateTime={dateTime}
            onHandOver={(payments) => void handOver(payments)}
          />
        )}
      </aside>
    </div>
  )
}

function SelectedOrder({
  order,
  methods,
  shiftOpen,
  onOpenShift,
  busy,
  dateTime,
  onHandOver,
}: {
  order: LaundryOrder
  methods: Method[]
  shiftOpen: boolean
  onOpenShift: () => void
  busy: boolean
  dateTime: (value: string | null) => string
  onHandOver: (payments: LaundryPaymentSplit[] | null) => void
}) {
  const { tx, money } = useTx()
  const split = usePaymentSplit(order.due, methods)
  const owes = order.due > 0
  return (
    <>
      <div className="flex items-center justify-between">
        <span className={cn("text-[15px] font-extrabold", HEADING)}>{order.orderNumber}</span>
        <StatusBadge status={order.status} />
      </div>
      <ul className="flex flex-col gap-1 text-[12.5px]">
        {order.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-2">
            <span className={HEADING}>
              {line.itemName} · {line.serviceName} × {line.quantity}
            </span>
            <span className={MUTED}>{money(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-[#eef2f8] pt-2 text-[13px]">
        <div className="flex justify-between">
          <span className={MUTED}>{tx("الإجمالي", "Total")}</span>
          <span className={HEADING}>{money(order.total)}</span>
        </div>
        {order.depositAmount > 0 ? (
          <div className="flex justify-between">
            <span className={MUTED}>{tx("عربون مدفوع", "Deposit paid")}</span>
            <span className="text-[#047857]">− {money(order.depositAmount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-[16px] font-extrabold">
          <span className={HEADING}>
            {owes ? tx("المطلوب الآن", "Due now") : tx("مدفوع", "Paid")}
          </span>
          <span className={owes ? "text-[#2563eb]" : "text-[#047857]"}>{money(order.due)}</span>
        </div>
        <p className={cn("text-[11.5px]", MUTED)}>
          {tx("موعد الجاهزية", "Ready by")}: {dateTime(order.promisedAt)}
        </p>
      </div>
      {owes ? (
        shiftOpen ? (
          <PaymentSplitter total={order.due} methods={methods} split={split} />
        ) : (
          <NoShift onOpenShift={onOpenShift} />
        )
      ) : null}
      <button
        type="button"
        className={cn(PRIMARY, "h-12")}
        disabled={busy || (owes && (!shiftOpen || split.payments === null))}
        onClick={() => onHandOver(owes ? split.payments : null)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {owes
          ? tx(`تحصيل ${money(order.due)} وتسليم`, `Take ${money(order.due)} and hand over`)
          : tx("تسليم للعميل", "Hand over")}
      </button>
      <Link
        href={ROUTES.laundryOrder(order.id)}
        className="text-center text-[12.5px] font-bold text-[#2563eb] hover:underline"
      >
        {tx("تفاصيل الطلب", "Order details")}
      </Link>
    </>
  )
}
