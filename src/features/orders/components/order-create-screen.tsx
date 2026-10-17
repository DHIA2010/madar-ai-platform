"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Plus, ShoppingCart, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppForm,
  AppInput,
  AppSearchableSelect,
  type AppSearchableSelectOption,
  AppSwitch,
} from "@/components/app"

import { useProductCatalog } from "../hooks/use-product-catalog"
import {
  type CreateOrderInput,
  type CreateOrderItemInput,
  orderListService,
} from "../services/order-list.service"
import { FIELD_CLASS, HEADING, MUTED, OrderField, OrderSection, PANEL } from "./order-field"

import { type Locale, localeDirection } from "@/i18n/locales"

type OrdersTranslator = ReturnType<typeof useTranslations<"orders">>

// A row that hasn't (or no longer) points at a real catalog product -- its productName is
// hand-typed, matching the "free-text line" every POS/invoice item input in this app already
// supports server-side (productId stays null in that case).
const FREEFORM_PRODUCT_VALUE = "__freeform__"

function emptyItem(): CreateOrderItemInput {
  return { productId: null, productName: "", sku: null, unitPrice: 0, quantity: 1 }
}

function amountFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatAmount(value: number, locale: Locale): string {
  return `${amountFormatter(locale).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`
}

function paymentMethodOptions(t: OrdersTranslator) {
  return [
    { value: "cash", label: t("create.paymentMethods.cash") },
    { value: "card", label: t("create.paymentMethods.card") },
    { value: "bank_transfer", label: t("create.paymentMethods.bankTransfer") },
    { value: "cod", label: t("create.paymentMethods.cod") },
  ]
}

function paymentStatusOptions(t: OrdersTranslator) {
  return [
    { value: "pending", label: t("create.paymentStatuses.pending") },
    { value: "paid", label: t("create.paymentStatuses.paid") },
  ]
}

export function OrderCreateScreen() {
  const t = useTranslations("orders")
  const locale = useLocale() as Locale
  const router = useRouter()
  const { products, isLoading: isLoadingProducts } = useProductCatalog()

  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [isGuestCustomer, setIsGuestCustomer] = useState(true)

  const [receiverSameAsCustomer, setReceiverSameAsCustomer] = useState(true)
  const [receiverName, setReceiverName] = useState("")
  const [receiverPhone, setReceiverPhone] = useState("")
  const [receiverEmail, setReceiverEmail] = useState("")
  const [receiverNotify, setReceiverNotify] = useState(true)

  const [items, setItems] = useState<CreateOrderItemInput[]>([emptyItem()])

  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("pending")
  const [paymentMethodCode, setPaymentMethodCode] = useState("cash")

  const [deliveryMethod, setDeliveryMethod] = useState<"shipping" | "pickup">("pickup")
  const [shipToCountry, setShipToCountry] = useState("SA")
  const [shipToCity, setShipToCity] = useState("")
  const [shipToDistrict, setShipToDistrict] = useState("")
  const [shipToAddress, setShipToAddress] = useState("")
  const [shippingCost, setShippingCost] = useState(0)
  const [courierId, setCourierId] = useState("")

  const [discountCode, setDiscountCode] = useState("")
  const [discountAmount, setDiscountAmount] = useState(0)
  const [shippingDiscountAmount, setShippingDiscountAmount] = useState(0)

  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function updateItem(index: number, patch: Partial<CreateOrderItemInput>) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    )
  }

  // The catalog options every row's product field shares, plus -- only when that specific row
  // currently holds a hand-typed name -- a synthetic leading option so the trigger still shows
  // it as "selected" (AppSearchableSelect only renders a label for a value present in options).
  function productOptionsFor(item: CreateOrderItemInput): AppSearchableSelectOption[] {
    const catalogOptions = products.map((product) => ({
      value: product.id,
      label: product.name,
      hint: `${product.sku} — ${formatAmount(product.sellingPrice, locale)}`,
    }))
    if (!item.productId && item.productName.trim()) {
      return [{ value: FREEFORM_PRODUCT_VALUE, label: item.productName }, ...catalogOptions]
    }
    return catalogOptions
  }

  function handleProductSelect(index: number, value: string) {
    if (value === FREEFORM_PRODUCT_VALUE) return
    const product = products.find((candidate) => candidate.id === value)
    if (!product) return
    updateItem(index, {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitPrice: product.sellingPrice,
      costPrice: product.costPrice,
    })
  }

  function handleProductCreate(index: number, draft: string) {
    updateItem(index, { productId: null, productName: draft, sku: null })
  }

  const itemsSubtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity - (item.discountAmount ?? 0),
    0
  )
  const estimatedTotal = Math.max(
    0,
    itemsSubtotal - discountAmount + shippingCost - shippingDiscountAmount
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!customerName.trim()) {
      toast.error(t("create.validation.customerRequired"))
      return
    }
    const effectiveReceiver = receiverSameAsCustomer
      ? { name: customerName, phone: customerPhone }
      : { name: receiverName, phone: receiverPhone }
    if (!effectiveReceiver.name.trim() || !effectiveReceiver.phone.trim()) {
      toast.error(t("create.validation.receiverRequired"))
      return
    }
    const validItems = items.filter((item) => item.productName.trim().length > 0)
    if (validItems.length === 0) {
      toast.error(t("create.validation.itemsRequired"))
      return
    }
    if (deliveryMethod === "shipping" && !shipToCity.trim()) {
      toast.error(t("create.validation.shipToRequired"))
      return
    }

    const payload: CreateOrderInput = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      customerEmail: customerEmail.trim() || null,
      customerId: null,
      isGuestCustomer,
      paymentStatus,
      paymentMethodCode,
      receiver: {
        name: effectiveReceiver.name.trim(),
        phone: effectiveReceiver.phone.trim(),
        countryCode: "SA",
        email: (receiverSameAsCustomer ? customerEmail : receiverEmail).trim() || null,
        notify: receiverNotify,
      },
      deliveryMethod,
      shipTo:
        deliveryMethod === "shipping"
          ? {
              country: shipToCountry.trim() || "SA",
              city: shipToCity.trim(),
              district: shipToDistrict.trim() || null,
              address: shipToAddress.trim() || null,
            }
          : null,
      courierId: courierId.trim() || null,
      shippingCost,
      discountCode: discountAmount > 0 ? discountCode.trim() || null : null,
      discountAmount,
      shippingDiscountAmount,
      notes: notes.trim() || null,
      items: validItems,
    }

    setSubmitting(true)
    try {
      const order = await orderListService.createOrder(payload)
      if (order.sallaPushStatus === "pushed") {
        toast.success(t("create.createSuccessPushed", { orderNumber: order.orderNumber }))
      } else if (order.sallaPushStatus === "failed") {
        toast.success(t("create.createSuccessPushFailed", { orderNumber: order.orderNumber }))
      } else {
        toast.success(t("create.createSuccess", { orderNumber: order.orderNumber }))
      }
      router.push(ROUTES.orders)
    } catch {
      toast.error(t("create.createError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div dir={localeDirection(locale)} className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
          <ShoppingCart className="size-5" />
        </span>
        <div>
          <h1 className={cn("text-[20px] font-extrabold leading-tight", HEADING)}>
            {t("create.heading")}
          </h1>
          <p className={cn("mt-1 text-[12px]", MUTED)}>{t("create.subheading")}</p>
        </div>
      </div>

      <AppForm onSubmit={handleSubmit} className="space-y-4">
        <OrderSection title={t("create.sections.customer")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <OrderField label={t("create.fields.customerName")} required>
              <AppInput
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className={FIELD_CLASS}
              />
            </OrderField>
            <OrderField label={t("create.fields.customerPhone")}>
              <AppInput
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                className={FIELD_CLASS}
              />
            </OrderField>
            <OrderField label={t("create.fields.customerEmail")}>
              <AppInput
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                className={FIELD_CLASS}
              />
            </OrderField>
          </div>
          <label className="mt-4 flex items-center gap-2.5">
            <AppSwitch checked={isGuestCustomer} onCheckedChange={setIsGuestCustomer} />
            <span className={cn("text-[12.5px] font-semibold", HEADING)}>
              {t("create.fields.isGuest")}
            </span>
          </label>
        </OrderSection>

        <OrderSection title={t("create.sections.receiver")} description={t("create.receiverHint")}>
          <label className="mb-4 flex items-center gap-2.5">
            <AppSwitch
              checked={receiverSameAsCustomer}
              onCheckedChange={setReceiverSameAsCustomer}
            />
            <span className={cn("text-[12.5px] font-semibold", HEADING)}>
              {t("create.fields.receiverSameAsCustomer")}
            </span>
          </label>
          {!receiverSameAsCustomer ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <OrderField label={t("create.fields.customerName")} required>
                <AppInput
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  className={FIELD_CLASS}
                />
              </OrderField>
              <OrderField label={t("create.fields.customerPhone")} required>
                <AppInput
                  value={receiverPhone}
                  onChange={(event) => setReceiverPhone(event.target.value)}
                  className={FIELD_CLASS}
                />
              </OrderField>
              <OrderField label={t("create.fields.customerEmail")}>
                <AppInput
                  type="email"
                  value={receiverEmail}
                  onChange={(event) => setReceiverEmail(event.target.value)}
                  className={FIELD_CLASS}
                />
              </OrderField>
            </div>
          ) : null}
          <label className="mt-4 flex items-center gap-2.5">
            <AppSwitch checked={receiverNotify} onCheckedChange={setReceiverNotify} />
            <span className={cn("text-[12.5px] font-semibold", HEADING)}>
              {t("create.fields.receiverNotify")}
            </span>
          </label>
        </OrderSection>

        <OrderSection title={t("create.sections.items")}>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-2 items-end gap-2.5 rounded-[12px] border border-[#eef2f8] p-3 sm:grid-cols-6"
              >
                <div className="col-span-2">
                  <OrderField label={t("create.items.productName")} required>
                    <AppSearchableSelect
                      value={item.productId ?? (item.productName ? FREEFORM_PRODUCT_VALUE : "")}
                      onChange={(value) => handleProductSelect(index, value)}
                      onCreate={(draft) => handleProductCreate(index, draft)}
                      createLabel={(draft) => t("create.items.addCustomProduct", { draft })}
                      options={productOptionsFor(item)}
                      disabled={isLoadingProducts}
                      placeholder={
                        isLoadingProducts
                          ? t("create.items.productLoadingPlaceholder")
                          : t("create.items.productPlaceholder")
                      }
                      searchPlaceholder={t("create.items.productSearchPlaceholder")}
                      emptyLabel={t("create.items.productEmptyLabel")}
                      ariaLabel={t("create.items.productName")}
                      triggerClassName={FIELD_CLASS}
                    />
                  </OrderField>
                </div>
                <OrderField label={t("create.items.sku")}>
                  <AppInput
                    value={item.sku ?? ""}
                    onChange={(event) => updateItem(index, { sku: event.target.value || null })}
                    className={FIELD_CLASS}
                  />
                </OrderField>
                <OrderField label={t("create.items.unitPrice")} required>
                  <AppInput
                    type="number"
                    min={0}
                    step="any"
                    value={item.unitPrice || ""}
                    onChange={(event) =>
                      updateItem(index, { unitPrice: Number(event.target.value) || 0 })
                    }
                    className={FIELD_CLASS}
                  />
                </OrderField>
                <OrderField label={t("create.items.quantity")} required>
                  <AppInput
                    type="number"
                    min={1}
                    step="any"
                    value={item.quantity || ""}
                    onChange={(event) =>
                      updateItem(index, { quantity: Number(event.target.value) || 1 })
                    }
                    className={FIELD_CLASS}
                  />
                </OrderField>
                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    aria-label={t("create.items.removeItem")}
                    disabled={items.length === 1}
                    onClick={() =>
                      setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="flex size-10 items-center justify-center rounded-[10px] border border-[#f7c9ca] bg-white text-[#e0484d] transition-colors hover:bg-[#fdeeee] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <AppButton
            type="button"
            variant="outline"
            icon={<Plus className="size-4" />}
            className="mt-3 h-10 rounded-[10px] border-[#c4d5f0] px-4 text-[12.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            onClick={() => setItems((current) => [...current, emptyItem()])}
          >
            {t("create.items.addItem")}
          </AppButton>
        </OrderSection>

        <div className="grid gap-4 lg:grid-cols-2">
          <OrderSection title={t("create.sections.payment")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <OrderField label={t("create.fields.paymentStatus")} required>
                <AppSearchableSelect
                  value={paymentStatus}
                  onChange={(value) => setPaymentStatus(value as "paid" | "pending")}
                  options={paymentStatusOptions(t)}
                  triggerClassName={FIELD_CLASS}
                  ariaLabel={t("create.fields.paymentStatus")}
                />
              </OrderField>
              <OrderField label={t("create.fields.paymentMethod")} required>
                <AppSearchableSelect
                  value={paymentMethodCode}
                  onChange={setPaymentMethodCode}
                  options={paymentMethodOptions(t)}
                  triggerClassName={FIELD_CLASS}
                  ariaLabel={t("create.fields.paymentMethod")}
                />
              </OrderField>
            </div>
          </OrderSection>

          <OrderSection title={t("create.sections.delivery")}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <OrderField label={t("create.fields.deliveryMethod")} required>
                  <AppSearchableSelect
                    value={deliveryMethod}
                    onChange={(value) => setDeliveryMethod(value as "shipping" | "pickup")}
                    options={[
                      { value: "pickup", label: t("create.fields.pickup") },
                      { value: "shipping", label: t("create.fields.shipping") },
                    ]}
                    triggerClassName={FIELD_CLASS}
                    ariaLabel={t("create.fields.deliveryMethod")}
                  />
                </OrderField>
                <OrderField label={t("create.fields.shippingCost")}>
                  <AppInput
                    type="number"
                    min={0}
                    step="any"
                    value={shippingCost || ""}
                    onChange={(event) => setShippingCost(Number(event.target.value) || 0)}
                    className={FIELD_CLASS}
                  />
                </OrderField>
              </div>
              {deliveryMethod === "shipping" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <OrderField label={t("create.fields.shipToCountry")} required>
                    <AppInput
                      value={shipToCountry}
                      onChange={(event) => setShipToCountry(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </OrderField>
                  <OrderField label={t("create.fields.shipToCity")} required>
                    <AppInput
                      value={shipToCity}
                      onChange={(event) => setShipToCity(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </OrderField>
                  <OrderField label={t("create.fields.shipToDistrict")}>
                    <AppInput
                      value={shipToDistrict}
                      onChange={(event) => setShipToDistrict(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </OrderField>
                  <OrderField label={t("create.fields.shipToAddress")}>
                    <AppInput
                      value={shipToAddress}
                      onChange={(event) => setShipToAddress(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </OrderField>
                  <OrderField label={t("create.fields.courierId")}>
                    <AppInput
                      value={courierId}
                      onChange={(event) => setCourierId(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </OrderField>
                </div>
              ) : null}
            </div>
          </OrderSection>
        </div>

        <OrderSection title={t("create.sections.discounts")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <OrderField label={t("create.fields.discountCode")}>
              <AppInput
                value={discountCode}
                onChange={(event) => setDiscountCode(event.target.value)}
                className={FIELD_CLASS}
              />
            </OrderField>
            <OrderField label={t("create.fields.discountAmount")}>
              <AppInput
                type="number"
                min={0}
                step="any"
                value={discountAmount || ""}
                onChange={(event) => setDiscountAmount(Number(event.target.value) || 0)}
                className={FIELD_CLASS}
              />
            </OrderField>
            <OrderField label={t("create.fields.shippingDiscountAmount")}>
              <AppInput
                type="number"
                min={0}
                step="any"
                value={shippingDiscountAmount || ""}
                onChange={(event) => setShippingDiscountAmount(Number(event.target.value) || 0)}
                className={FIELD_CLASS}
              />
            </OrderField>
          </div>
        </OrderSection>

        <OrderSection title={t("create.sections.notes")}>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className={cn(
              "w-full resize-none rounded-[12px] border p-3 text-[13px] outline-none focus:border-[#2878ff]",
              FIELD_CLASS,
              "h-auto"
            )}
          />
        </OrderSection>

        <div className={cn(PANEL, "flex items-center justify-between gap-3 p-4")}>
          <div>
            <p className={cn("text-[11.5px]", MUTED)}>{t("create.estimatedTotal")}</p>
            <p className={cn("text-[18px] font-extrabold", HEADING)}>
              {formatAmount(estimatedTotal, locale)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              type="button"
              variant="outline"
              className="h-11 rounded-[12px] border-[#c4d5f0] px-6 text-[13.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
              onClick={() => router.push(ROUTES.orders)}
            >
              {t("create.cancel")}
            </AppButton>
            <AppButton
              type="submit"
              loading={submitting}
              className="h-11 gap-2 rounded-full bg-[#2878ff] px-6 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
            >
              {t("create.submit")}
            </AppButton>
          </div>
        </div>
      </AppForm>
    </div>
  )
}
