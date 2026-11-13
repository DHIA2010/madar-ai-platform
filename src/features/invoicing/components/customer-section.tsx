"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Building2, ChevronDown, CircleAlert, CircleCheck, UserRound, X } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  AppSearchableSelect,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppSwitch,
} from "@/components/app"

import type { CustomerRecord } from "@/features/customers"

import { BUYER_ID_SCHEMES, emptyParty, missingBuyerFields } from "../domain/catalog"
import type { BuyerIdScheme, Party } from "../types/invoicing.types"
import { Field, TextInput } from "./primitives"
import { FIELD, HEADING, MUTED, PANEL, SECTION_TITLE } from "./styles"

function regionNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" })
  } catch {
    return null
  }
}

const COUNTRIES = ["SA", "AE", "KW", "BH", "QA", "OM", "EG", "JO", "TR", "GB", "US", "CN", "IN"]

// A customer of the customers list as the buyer on a document.
export function partyFromCustomer(customer: CustomerRecord): Party {
  return {
    name: customer.name,
    vatNumber: customer.vatNumber,
    idScheme: customer.commercialRegistration ? "CRN" : null,
    idValue: customer.commercialRegistration,
    contactName: null,
    email: customer.email || null,
    phone: customer.phone,
    address: {
      street: customer.street,
      buildingNumber: customer.buildingNumber,
      secondaryNumber: customer.secondaryNumber,
      district: customer.district,
      city: customer.city,
      postalCode: customer.postalCode,
      countryCode: customer.countryCode || "SA",
    },
  }
}

export function CustomerSection({
  customers,
  customerId,
  customer,
  business,
  syncCustomer,
  onSyncCustomerChange,
  onChange,
}: {
  customers: CustomerRecord[]
  customerId: string | null
  customer: Party
  // A tax invoice to a business: ZATCA needs the buyer's VAT number (or an ID) and address.
  business: boolean
  syncCustomer: boolean
  onSyncCustomerChange: (next: boolean) => void
  onChange: (next: { customerId: string | null; customer: Party }) => void
}) {
  const t = useTranslations("invoicing.editor.customer")
  const tFields = useTranslations("invoicing.buyerFields")
  const tSchemes = useTranslations("invoicing.idSchemes")
  const locale = useLocale()
  const missing = useMemo(() => missingBuyerFields(customer), [customer])
  const [expanded, setExpanded] = useState(() => business && missing.length > 0)
  const regions = useMemo(() => regionNames(locale), [locale])
  const countryName = (code: string) => regions?.of(code) ?? code

  const options = useMemo(
    () =>
      customers.map((entry) => ({
        value: entry.id,
        label: entry.name,
        hint: [entry.vatNumber, entry.phone, entry.city].filter(Boolean).join(" · ") || undefined,
        icon: entry.isBusinessCustomer ? Building2 : UserRound,
        keywords: [entry.vatNumber, entry.phone, entry.email, entry.commercialRegistration]
          .filter(Boolean)
          .join(" "),
      })),
    [customers]
  )
  // Only a customer authored in Madar has a record the document can link to; a store customer's
  // details are copied in.
  const linked = customers.find((entry) => entry.id === customerId) ?? null

  const set = (patch: Partial<Party>) =>
    onChange({ customerId, customer: { ...customer, ...patch } })
  const setAddress = (patch: Partial<Party["address"]>) =>
    onChange({ customerId, customer: { ...customer, address: { ...customer.address, ...patch } } })

  const choose = (id: string) => {
    const chosen = customers.find((entry) => entry.id === id)
    if (!chosen) return
    const party = partyFromCustomer(chosen)
    onChange({ customerId: chosen.platform === "Madar" ? chosen.id : null, customer: party })
    onSyncCustomerChange(false)
    if (business && missingBuyerFields(party).length) setExpanded(true)
  }

  const summary = [
    customer.vatNumber ? `${tFields("vatNumber")}: ${customer.vatNumber}` : null,
    [
      customer.address.buildingNumber,
      customer.address.street,
      customer.address.district,
      customer.address.city,
    ]
      .filter(Boolean)
      .join("، ") || null,
    customer.phone,
  ].filter(Boolean)

  return (
    <section className={cn(PANEL, "p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={SECTION_TITLE}>{t("title")}</h2>
        {business ? (
          missing.length ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7e6] px-2.5 py-1 text-[11px] font-bold text-[#b45309]">
              <CircleAlert className="size-3" strokeWidth={2.5} />
              {t("incomplete")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f8ef] px-2.5 py-1 text-[11px] font-bold text-[#15803d]">
              <CircleCheck className="size-3" strokeWidth={2.5} />
              {t("ready")}
            </span>
          )
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <AppSearchableSelect
          value={linked?.id ?? ""}
          options={options}
          onChange={choose}
          placeholder={customer.name || t("pick")}
          searchPlaceholder={t("search")}
          emptyLabel={t("empty")}
          ariaLabel={t("pick")}
          onCreate={(draft) => {
            onChange({ customerId: null, customer: { ...emptyParty(), name: draft } })
            onSyncCustomerChange(true)
            setExpanded(true)
          }}
          createLabel={(draft) => t("create", { name: draft })}
        />
        {customer.name ? (
          <button
            type="button"
            onClick={() => {
              onChange({ customerId: null, customer: emptyParty() })
              onSyncCustomerChange(false)
            }}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[12px] border border-[#e1e7f0] px-3 text-[12.5px] font-semibold text-[#6b7b96] hover:bg-[#f7f9fc]"
          >
            <X className="size-3.5" />
            {t("clear")}
          </button>
        ) : null}
      </div>

      {customer.name ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-[14px] bg-[#f7f9fc] px-4 py-3 text-start"
        >
          <span className="min-w-0">
            <span className={cn("block truncate text-[14px] font-extrabold", HEADING)}>
              {customer.name}
            </span>
            <span className={cn("mt-0.5 block truncate text-[12px]", MUTED)}>
              {summary.length ? summary.join("  •  ") : t("noDetails")}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-[#4f46e5]">
            {expanded ? t("hideDetails") : t("showDetails")}
            <ChevronDown className={cn("size-4 transition", expanded && "rotate-180")} />
          </span>
        </button>
      ) : (
        <p className={cn("mt-3 text-[12.5px] leading-6", MUTED)}>{t("hint")}</p>
      )}

      {business && missing.length && customer.name ? (
        <div className="mt-3 rounded-[12px] border border-[#fde6b3] bg-[#fffbf0] px-3.5 py-2.5 text-[12.5px] leading-6 text-[#92400e]">
          <span className="font-bold">{t("missingTitle")} </span>
          {missing.map((field) => tFields(field)).join("، ")}
        </div>
      ) : null}

      {expanded && customer.name ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={tFields("name")} required className="sm:col-span-2 lg:col-span-1">
              <TextInput
                value={customer.name}
                onChange={(name) => set({ name })}
                invalid={missing.includes("name")}
              />
            </Field>
            <Field label={tFields("vatNumber")} hint={t("vatHint")}>
              <TextInput
                dir="ltr"
                inputMode="numeric"
                maxLength={15}
                value={customer.vatNumber}
                onChange={(value) => set({ vatNumber: value.replace(/\D/g, "") || null })}
                invalid={business && missing.includes("vatNumber")}
                placeholder="3XXXXXXXXXXXXX3"
              />
            </Field>
            <Field group label={t("otherId")}>
              <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
                <AppSelect
                  value={customer.idScheme ?? "none"}
                  onValueChange={(value) =>
                    set({
                      idScheme: value === "none" ? null : (value as BuyerIdScheme),
                      idValue: value === "none" ? null : customer.idValue,
                    })
                  }
                >
                  <AppSelectTrigger className={cn(FIELD, "px-2.5")} aria-label={t("otherId")}>
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectItem value="none">{t("noId")}</AppSelectItem>
                    {BUYER_ID_SCHEMES.map((scheme) => (
                      <AppSelectItem key={scheme} value={scheme}>
                        {tSchemes(scheme)}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
                <TextInput
                  dir="ltr"
                  value={customer.idValue}
                  disabled={!customer.idScheme}
                  onChange={(value) => set({ idValue: value || null })}
                  invalid={business && missing.includes("vatNumberOrId") && !!customer.idScheme}
                />
              </div>
            </Field>
            <Field label={t("contactName")}>
              <TextInput
                value={customer.contactName}
                onChange={(value) => set({ contactName: value || null })}
              />
            </Field>
            <Field label={t("phone")}>
              <TextInput
                dir="ltr"
                inputMode="tel"
                value={customer.phone}
                onChange={(value) => set({ phone: value || null })}
              />
            </Field>
            <Field label={t("email")}>
              <TextInput
                dir="ltr"
                type="email"
                value={customer.email}
                onChange={(value) => set({ email: value || null })}
              />
            </Field>
          </div>

          <div>
            <p className={cn("mb-2 text-[12.5px] font-extrabold", HEADING)}>{t("address")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={tFields("buildingNumber")}>
                <TextInput
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={4}
                  value={customer.address.buildingNumber}
                  onChange={(value) =>
                    setAddress({ buildingNumber: value.replace(/\D/g, "") || null })
                  }
                  invalid={business && missing.includes("buildingNumber")}
                  placeholder="1234"
                />
              </Field>
              <Field label={tFields("street")} className="lg:col-span-2">
                <TextInput
                  value={customer.address.street}
                  onChange={(value) => setAddress({ street: value || null })}
                  invalid={business && missing.includes("street")}
                />
              </Field>
              <Field label={tFields("district")}>
                <TextInput
                  value={customer.address.district}
                  onChange={(value) => setAddress({ district: value || null })}
                  invalid={business && missing.includes("district")}
                />
              </Field>
              <Field label={tFields("city")}>
                <TextInput
                  value={customer.address.city}
                  onChange={(value) => setAddress({ city: value || null })}
                  invalid={business && missing.includes("city")}
                />
              </Field>
              <Field label={tFields("postalCode")}>
                <TextInput
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={5}
                  value={customer.address.postalCode}
                  onChange={(value) => setAddress({ postalCode: value.replace(/\D/g, "") || null })}
                  invalid={business && missing.includes("postalCode")}
                  placeholder="12345"
                />
              </Field>
              <Field label={t("secondaryNumber")}>
                <TextInput
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={4}
                  value={customer.address.secondaryNumber}
                  onChange={(value) =>
                    setAddress({ secondaryNumber: value.replace(/\D/g, "") || null })
                  }
                />
              </Field>
              <Field label={t("country")}>
                <AppSelect
                  value={customer.address.countryCode || "SA"}
                  onValueChange={(countryCode) => setAddress({ countryCode })}
                >
                  <AppSelectTrigger className={cn(FIELD, "px-2.5")} aria-label={t("country")}>
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {[...new Set([...COUNTRIES, customer.address.countryCode || "SA"])].map(
                      (code) => (
                        <AppSelectItem key={code} value={code}>
                          {countryName(code)}
                        </AppSelectItem>
                      )
                    )}
                  </AppSelectContent>
                </AppSelect>
              </Field>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-[#e9edf5] px-3.5 py-3">
            <span className="min-w-0">
              <span className={cn("block text-[13px] font-bold", HEADING)}>
                {linked && customerId ? t("updateRecord") : t("saveRecord")}
              </span>
              <span className={cn("block text-[11.5px]", MUTED)}>
                {linked && customerId ? t("updateRecordHint") : t("saveRecordHint")}
              </span>
            </span>
            <AppSwitch checked={syncCustomer} onCheckedChange={onSyncCustomerChange} />
          </label>
        </div>
      ) : null}
    </section>
  )
}
