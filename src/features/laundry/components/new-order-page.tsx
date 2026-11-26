"use client"

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Camera, Loader2, Minus, Plus, Trash2, X, Zap } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  type CreateLaundryOrderInput,
  type LaundryCatalog,
  type LaundryOrder,
  laundryService,
  type LaundrySettings,
} from "../services/laundry.service"
import {
  CHIP,
  Choice,
  DateTimeField,
  errorText,
  FIELD,
  HEADING,
  LABEL,
  LaundryPage,
  Loading,
  MUTED,
  PANEL,
  PRIMARY,
  SECONDARY,
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
}

const toIso = (value: string) => value || null

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Taking an order in: who it is for, each piece and what is done to it, urgent or not, pickup
// or delivery, notes and photos of stains or damage, and how it is paid (now, a deposit, or at
// pickup).
export function LaundryNewOrderPage() {
  const router = useRouter()
  return (
    <LaundryNewOrderForm
      onCreated={(created) => router.push(`${ROUTES.laundryOrder(created.id)}&new=1`)}
    />
  )
}

// The order form itself: on its page, or inside the cashier's laundry window (embedded: no page
// frame, and the two columns stack).
export function LaundryNewOrderForm({
  onCreated,
  embedded = false,
  disabledReason,
}: {
  onCreated: (order: LaundryOrder) => void
  embedded?: boolean
  // Shown instead of saving (e.g. no shift open in the cashier).
  disabledReason?: string | null
}) {
  const { tx, ar, money } = useTx()
  const [catalog, setCatalog] = useState<LaundryCatalog | null>(null)
  const [settings, setSettings] = useState<LaundrySettings | null>(null)
  const [methods, setMethods] = useState<Array<{ code: string; name: string }>>([])
  const [staff, setStaff] = useState<Array<{ userId: string; name: string }>>([])

  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [urgent, setUrgent] = useState(false)
  const [promisedAt, setPromisedAt] = useState("")
  const [promisedTouched, setPromisedTouched] = useState(false)
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [pickupAddress, setPickupAddress] = useState("")
  const [pickupAt, setPickupAt] = useState("")
  const [deliveryAt, setDeliveryAt] = useState("")
  const [driver, setDriver] = useState("")
  const [notes, setNotes] = useState("")
  const [photos, setPhotos] = useState<File[]>([])
  const [paymentMode, setPaymentMode] = useState<"later" | "deposit" | "full">("later")
  const [method, setMethod] = useState("")
  const [deposit, setDeposit] = useState("")
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([
      laundryService.catalog(),
      laundryService.settings(),
      laundryService.paymentMethods().catch(() => []),
      laundryService.staff().catch(() => []),
    ]).then(([nextCatalog, nextSettings, nextMethods, nextStaff]) => {
      setCatalog(nextCatalog)
      setSettings(nextSettings)
      setMethods(nextMethods)
      setMethod(
        nextMethods.find((entry) => entry.kind === "cash")?.code ?? nextMethods[0]?.code ?? ""
      )
      setStaff(nextStaff)
    })
  }, [])

  // The promised time follows the turnaround (shorter when urgent) until the cashier sets one.
  const defaultPromised = useMemo(() => {
    if (!settings) return ""
    const hours = urgent ? settings.urgentTurnaroundHours : settings.turnaroundHours
    // Rounded to the next quarter hour, the steps the time list offers.
    const at = new Date(Date.now() + hours * 3_600_000)
    at.setMinutes(Math.ceil(at.getMinutes() / 15) * 15, 0, 0)
    return at.toISOString()
  }, [settings, urgent])
  const promisedValue = promisedTouched ? promisedAt : defaultPromised

  const itemsTotal = useMemo(
    () => Math.round(lines.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100) / 100,
    [lines]
  )
  const urgentFee =
    urgent && settings ? Math.round(itemsTotal * settings.urgentSurchargePercent) / 100 : 0
  const deliveryFee = fulfilment === "delivery" && settings ? settings.deliveryFee : 0
  const total = Math.round((itemsTotal + urgentFee + deliveryFee) * 100) / 100
  const pieces = lines.reduce((sum, line) => sum + line.quantity, 0)

  function addLine(itemId: string, serviceId: string) {
    if (!catalog) return
    const item = catalog.items.find((entry) => entry.id === itemId)
    const service = catalog.services.find((entry) => entry.id === serviceId)
    const price = catalog.prices[`${itemId}:${serviceId}`]
    if (!item || !service || price === undefined) return
    setLines((current) => {
      const index = current.findIndex(
        (line) => line.itemId === itemId && line.serviceId === serviceId
      )
      if (index >= 0) {
        return current.map((line, position) =>
          position === index ? { ...line, quantity: line.quantity + 1 } : line
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
        },
      ]
    })
  }

  function setQuantity(index: number, quantity: number) {
    setLines((current) =>
      quantity <= 0
        ? current.filter((_, position) => position !== index)
        : current.map((line, position) => (position === index ? { ...line, quantity } : line))
    )
  }

  async function save() {
    if (lines.length === 0) {
      toast.error(tx("أضف قطعة واحدة على الأقل.", "Add at least one piece."))
      return
    }
    if (paymentMode === "deposit" && !phone.trim()) {
      toast.error(tx("العربون يحتاج جوال العميل.", "A deposit needs the customer's mobile."))
      return
    }
    setSaving(true)
    try {
      const input: CreateLaundryOrderInput = {
        customerName: name.trim() || null,
        customerPhone: phone.trim() || null,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          serviceId: line.serviceId,
          quantity: line.quantity,
          note: line.note.trim() || null,
        })),
        urgent,
        promisedAt: toIso(promisedValue),
        fulfilment,
        pickupAddress: fulfilment === "delivery" ? pickupAddress.trim() || null : null,
        deliveryAddress: fulfilment === "delivery" ? deliveryAddress.trim() || null : null,
        pickupAt: fulfilment === "delivery" ? toIso(pickupAt) : null,
        deliveryAt: fulfilment === "delivery" ? toIso(deliveryAt) : null,
        driverUserId: fulfilment === "delivery" && driver ? driver : null,
        notes: notes.trim() || null,
        useSubscription: true,
        payment:
          paymentMode === "later"
            ? { mode: "later" }
            : paymentMode === "deposit"
              ? { mode: "deposit", paymentMethodCode: method, amount: Number(deposit) || 0 }
              : { mode: "full", paymentMethodCode: method },
      }
      const created = await laundryService.createOrder(input)
      for (const photo of photos) {
        const dataBase64 = await readAsBase64(photo)
        await laundryService
          .addPhoto(created.id, { contentType: photo.type || "image/jpeg", dataBase64 })
          .catch(() => toast.error(tx("تعذر رفع إحدى الصور.", "A photo couldn't be uploaded.")))
      }
      toast.success(tx(`حُفظ الطلب ${created.orderNumber}`, `Order ${created.orderNumber} saved`))
      onCreated(created)
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setSaving(false)
    }
  }

  const frame = (children: ReactNode) =>
    embedded ? (
      <div className="flex flex-col gap-4">{children}</div>
    ) : (
      <LaundryPage
        title={tx("طلب جديد", "New order")}
        subtitle={tx(
          "اضغط القطعة ثم الخدمة لإضافتها.",
          "Tap a piece, then the service, to add it."
        )}
        actions={
          <Link href={ROUTES.laundry} className={SECONDARY}>
            {tx("رجوع", "Back")}
          </Link>
        }
      >
        {children}
      </LaundryPage>
    )

  if (!catalog || !settings) return frame(<Loading />)

  const activeItems = catalog.items.filter((item) => item.active)
  const activeServices = catalog.services.filter((service) => service.active)
  const pricedServices = (itemId: string) =>
    activeServices.filter((service) => catalog.prices[`${itemId}:${service.id}`] !== undefined)
  const hasPrices = Object.keys(catalog.prices).length > 0

  return frame(
    <>
      {!hasPrices ? (
        <div className="rounded-[14px] border border-[#fde68a] bg-[#fffbeb] p-4 text-[13px] text-[#92400e]">
          {tx("لم تُضف أسعار بعد. ", "No prices yet. ")}
          <Link href={ROUTES.laundryPrices} className="font-bold underline">
            {tx("أضف قائمة الأسعار أولًا", "Add the price list first")}
          </Link>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          embedded ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "xl:grid-cols-[minmax(0,1fr)_400px]"
        )}
      >
        <div className="flex flex-col gap-4">
          <section className={cn(PANEL, "grid gap-3 p-4 sm:grid-cols-2")}>
            <label className="block">
              <span className={LABEL}>{tx("جوال العميل", "Customer mobile")}</span>
              <input
                className={FIELD}
                dir="ltr"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="05XXXXXXXX"
              />
            </label>
            <label className="block">
              <span className={LABEL}>{tx("اسم العميل", "Customer name")}</span>
              <input
                className={FIELD}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <p className={cn("text-[11.5px] sm:col-span-2", MUTED)}>
              {tx(
                "بالجوال يُربط الطلب بالعميل (ورصيده واشتراكه إن وجد)، وتصله رسالة الجاهزية.",
                "The mobile links the order to the customer (their balance and plan) and gets the ready message."
              )}
            </p>
          </section>

          <section className={cn(PANEL, "p-4")}>
            <h2 className={cn("mb-3 text-[14px] font-bold", HEADING)}>{tx("القطع", "Pieces")}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {activeItems.map((item) => {
                const priced = pricedServices(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={priced.length === 0}
                    onClick={() => setPicked(picked === item.id ? null : item.id)}
                    className={cn(
                      "rounded-[12px] border px-2 py-3 text-[13px] font-bold transition-colors disabled:opacity-40",
                      picked === item.id
                        ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                        : "border-[#e1e7f0] bg-white text-[#0b1738] hover:border-[#2563eb]/40"
                    )}
                  >
                    {item.name}
                  </button>
                )
              })}
            </div>
            {picked ? (
              <div className="mt-3 flex flex-wrap gap-2 rounded-[12px] bg-[#f5f7fb] p-3">
                {pricedServices(picked).map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => addLine(picked, service.id)}
                    className="rounded-[10px] border border-[#e1e7f0] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#0b1738] hover:border-[#2563eb]"
                  >
                    {service.name}{" "}
                    <span className="text-[#2563eb]">
                      {money(catalog.prices[`${picked}:${service.id}`])}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className={cn(PANEL, "flex flex-col gap-3 p-4")}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={CHIP(urgent)} onClick={() => setUrgent(!urgent)}>
                <Zap className="me-1 inline size-3.5" />
                {tx(
                  `مستعجل (+${settings.urgentSurchargePercent}%)`,
                  `Urgent (+${settings.urgentSurchargePercent}%)`
                )}
              </button>
              <button
                type="button"
                className={CHIP(fulfilment === "pickup")}
                onClick={() => setFulfilment("pickup")}
              >
                {tx("يستلم من المحل", "Collects in store")}
              </button>
              <button
                type="button"
                className={CHIP(fulfilment === "delivery")}
                onClick={() => setFulfilment("delivery")}
              >
                {tx("توصيل", "Delivery")}
              </button>
            </div>
            <div className="block sm:max-w-md">
              <span className={LABEL}>{tx("موعد الجاهزية", "Ready by")}</span>
              <DateTimeField
                value={promisedValue}
                clearable={false}
                onChange={(next) => {
                  setPromisedTouched(true)
                  setPromisedAt(next)
                }}
              />
            </div>
            {fulfilment === "delivery" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>{tx("عنوان الاستلام من العميل", "Pickup address")}</span>
                  <input
                    className={FIELD}
                    value={pickupAddress}
                    onChange={(event) => setPickupAddress(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>{tx("عنوان التوصيل", "Delivery address")}</span>
                  <input
                    className={FIELD}
                    value={deliveryAddress}
                    onChange={(event) => setDeliveryAddress(event.target.value)}
                  />
                </label>
                <div className="block">
                  <span className={LABEL}>{tx("موعد الاستلام من العميل", "Pickup time")}</span>
                  <DateTimeField value={pickupAt} onChange={setPickupAt} />
                </div>
                <div className="block">
                  <span className={LABEL}>{tx("موعد التوصيل", "Delivery time")}</span>
                  <DateTimeField value={deliveryAt} onChange={setDeliveryAt} />
                </div>
                <div className="block">
                  <span className={LABEL}>{tx("المندوب", "Driver")}</span>
                  <Choice
                    value={driver}
                    onChange={setDriver}
                    placeholder={tx("بدون مندوب", "No driver")}
                    options={[
                      { value: "", label: tx("بدون مندوب", "No driver") },
                      ...staff.map((person) => ({ value: person.userId, label: person.name })),
                    ]}
                  />
                </div>
              </div>
            ) : null}
            <label className="block">
              <span className={LABEL}>
                {tx(
                  "ملاحظات الاستلام (بقع، أضرار، أزرار ناقصة...)",
                  "Drop-off notes (stains, damage...)"
                )}
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
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
                  setPhotos((current) => [...current, ...chosen].slice(0, 10))
                  if (fileInput.current) fileInput.current.value = ""
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => fileInput.current?.click()}
                >
                  <Camera className="size-4" />
                  {tx("صور القطع", "Photos")}
                </button>
                {photos.map((photo, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11.5px]"
                  >
                    {photo.name.slice(0, 18)}
                    <button
                      type="button"
                      onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside
          className={cn(PANEL, "flex h-fit flex-col gap-3 p-4", !embedded && "xl:sticky xl:top-4")}
        >
          <h2 className={cn("text-[14px] font-bold", HEADING)}>
            {tx("الطلب", "Order")} · {pieces} {tx("قطعة", "pcs")}
          </h2>
          {lines.length === 0 ? (
            <p className={cn("py-6 text-center text-[12.5px]", MUTED)}>
              {tx("لم تُضف قطع بعد.", "No pieces yet.")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line, index) => (
                <li
                  key={`${line.itemId}:${line.serviceId}`}
                  className="rounded-[12px] border border-[#eef2f8] p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("truncate text-[13px] font-bold", HEADING)}>
                        {line.itemName}
                      </p>
                      <p className={cn("text-[11.5px]", MUTED)}>
                        {line.serviceName} · {money(line.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-lg border border-[#e1e7f0] p-1"
                        onClick={() => setQuantity(index, line.quantity - 1)}
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
                        onClick={() => setQuantity(index, line.quantity + 1)}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    value={line.note}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((entry, position) =>
                          position === index ? { ...entry, note: event.target.value } : entry
                        )
                      )
                    }
                    placeholder={tx("ملاحظة على القطعة (اختياري)", "Note on this piece (optional)")}
                    className="mt-2 h-8 w-full rounded-[8px] border border-[#eef2f8] px-2 text-[12px] outline-none focus:border-[#2563eb]"
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1 border-t border-[#eef2f8] pt-3 text-[13px]">
            <div className="flex justify-between">
              <span className={MUTED}>{tx("القطع", "Pieces")}</span>
              <span className={HEADING}>{money(itemsTotal)}</span>
            </div>
            {urgentFee > 0 ? (
              <div className="flex justify-between">
                <span className={MUTED}>{tx("رسوم الاستعجال", "Urgent charge")}</span>
                <span className={HEADING}>{money(urgentFee)}</span>
              </div>
            ) : null}
            {deliveryFee > 0 ? (
              <div className="flex justify-between">
                <span className={MUTED}>{tx("رسوم التوصيل", "Delivery fee")}</span>
                <span className={HEADING}>{money(deliveryFee)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-[15px] font-extrabold">
              <span className={HEADING}>{tx("الإجمالي", "Total")}</span>
              <span className="text-[#2563eb]">{money(total)}</span>
            </div>
            <p className={cn("text-[11px]", MUTED)}>
              {settings.pricesIncludeTax
                ? tx("شامل الضريبة.", "VAT included.")
                : tx("قبل الضريبة.", "Before VAT.")}{" "}
              {tx(
                "القطع المشمولة باشتراك العميل تُخصم تلقائيًا.",
                "Pieces on the customer's plan come off automatically."
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#eef2f8] pt-3">
            <span className={LABEL}>{tx("الدفع", "Payment")}</span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["later", tx("عند الاستلام", "At pickup")],
                  ["deposit", tx("عربون", "Deposit")],
                  ["full", tx("كامل الآن", "In full now")],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={CHIP(paymentMode === key)}
                  onClick={() => setPaymentMode(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {paymentMode !== "later" ? (
              <div className="grid grid-cols-2 gap-2">
                <Choice
                  value={method}
                  onChange={setMethod}
                  options={methods.map((entry) => ({ value: entry.code, label: entry.name }))}
                  ariaLabel={tx("طريقة الدفع", "Payment method")}
                />
                {paymentMode === "deposit" ? (
                  <input
                    className={FIELD}
                    type="number"
                    min={0}
                    step="0.01"
                    value={deposit}
                    onChange={(event) => setDeposit(event.target.value)}
                    placeholder={tx("المبلغ", "Amount")}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {disabledReason ? (
            <p className="rounded-[10px] bg-[#fffbeb] px-3 py-2 text-[12px] font-semibold text-[#92400e]">
              {disabledReason}
            </p>
          ) : null}
          <button
            type="button"
            className={PRIMARY}
            disabled={saving || lines.length === 0 || !!disabledReason}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {tx("حفظ الطلب", "Save order")}
          </button>
        </aside>
      </div>
    </>
  )
}
