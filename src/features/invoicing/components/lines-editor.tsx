"use client"

import { Fragment, useId, useMemo } from "react"
import { useTranslations } from "next-intl"
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Copy,
  Heading,
  MoreVertical,
  PackageSearch,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"

import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppSearchableSelect,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import type { ProductRecord } from "@/features/products"

import { emptyLine, EXEMPTION_CODES, UNITS } from "../domain/catalog"
import { computeLine, itemPositions, round2 } from "../domain/totals"
import { useFormatters } from "../hooks/use-invoicing"
import type { DocumentLine, Sector, TaxCategory } from "../types/invoicing.types"
import { NumberInput } from "./primitives"
import { CELL_INPUT, HEADING, MUTED, PANEL, SECTION_TITLE } from "./styles"

export type EditorLine = DocumentLine & { key: string }

// Only the catalog's own products have an id the document can keep.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let keySeed = 0
export const withKey = (line: DocumentLine): EditorLine => ({
  ...line,
  key: `line-${Date.now().toString(36)}-${(keySeed += 1)}`,
})

function fitHeight(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.style.height = "auto"
  element.style.height = `${element.scrollHeight}px`
}

// The item's name on one line that grows as it wraps: long descriptions stay readable in a
// narrow column instead of being clipped.
function DescriptionInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <textarea
      ref={fitHeight}
      rows={1}
      value={value}
      onChange={(event) => {
        fitHeight(event.target)
        onChange(event.target.value.replace(/\n/g, " "))
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault()
      }}
      placeholder={placeholder}
      className={cn(
        CELL_INPUT,
        "block h-auto min-h-10 resize-none overflow-hidden py-[9px] leading-[1.55] font-semibold"
      )}
    />
  )
}

export function withoutKey<T extends { key: string }>(line: T): Omit<T, "key"> {
  const copy: Omit<T, "key"> & { key?: string } = { ...line }
  delete copy.key
  return copy
}

const roundQuantity = (value: number) => Math.round(value * 10_000) / 10_000
const TAX_CATEGORIES: TaxCategory[] = ["S", "Z", "E", "O"]
const ADD_BUTTON =
  "inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-[#c9cffb] bg-white px-3.5 text-[12.5px] font-bold text-[#4f46e5] transition hover:bg-[#f5f6ff]"

export function LinesEditor({
  sector,
  lines,
  onChange,
  products,
  contractQuantities,
}: {
  sector: Sector
  lines: EditorLine[]
  onChange: (lines: EditorLine[]) => void
  products: ProductRecord[]
  // A progress claim: each quotation line's contract quantity, so a line is billed by its
  // completion (current % - previous %) instead of a typed quantity.
  contractQuantities: Record<string, number> | null
}) {
  const t = useTranslations("invoicing.editor.lines")
  const tUnits = useTranslations("invoicing.units")
  const tTax = useTranslations("invoicing.taxCategories")
  const tExemptions = useTranslations("invoicing.exemptions")
  const { money, quantity } = useFormatters()
  const unitsId = useId()
  const progress = contractQuantities !== null
  const units = useMemo(() => UNITS[sector].map((unit) => tUnits(unit)), [sector, tUnits])

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        hint: [product.sku, money(product.sellingPrice)].filter(Boolean).join(" · "),
        imageUrl: product.image,
        keywords: product.sku,
      })),
    [products, money]
  )

  const patch = (key: string, change: Partial<DocumentLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...change } : line)))
  const add = (line: DocumentLine) => onChange([...lines, withKey(line)])
  const remove = (key: string) => onChange(lines.filter((line) => line.key !== key))
  const duplicate = (index: number) =>
    onChange([
      ...lines.slice(0, index + 1),
      withKey({ ...lines[index], id: undefined, quotationLineId: null }),
      ...lines.slice(index + 1),
    ])
  const move = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= lines.length) return
    const next = [...lines]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const addProduct = (productId: string) => {
    const product = products.find((entry) => entry.id === productId)
    if (!product) return
    add(
      emptyLine({
        productId: product.isNative && UUID_PATTERN.test(product.id) ? product.id : null,
        description: product.name,
        unit: product.baseUnit,
        // A catalogue price that already includes VAT is entered before VAT here.
        unitPrice: product.priceIncludesTax
          ? round2(product.sellingPrice / 1.15)
          : product.sellingPrice,
      })
    )
  }

  const setCategory = (line: EditorLine, taxCategory: TaxCategory) => {
    if (taxCategory === "S") {
      patch(line.key, { taxCategory, taxRate: 15, exemptionCode: null, exemptionReason: null })
      return
    }
    const exemptionCode = EXEMPTION_CODES[taxCategory][0]
    patch(line.key, {
      taxCategory,
      taxRate: 0,
      exemptionCode,
      exemptionReason: tExemptions(exemptionCode),
    })
  }

  const positions = itemPositions(lines)
  const columns = progress ? 10 : 9

  return (
    <section className={cn(PANEL, "overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-3">
        <h2 className={SECTION_TITLE}>{progress ? t("titleProgress") : t("title")}</h2>
        <p className={cn("text-[12px]", MUTED)}>{t("pricesExcludeVat")}</p>
      </div>

      <datalist id={unitsId}>
        {units.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <div className="overflow-x-auto">
        <table
          className={cn(
            "w-full border-collapse text-[13px]",
            progress ? "min-w-[820px]" : "min-w-[780px]"
          )}
        >
          <thead>
            <tr className="border-y border-[#eef1f6] bg-[#f9fafc] text-[11.5px] font-bold text-[#6b7b96]">
              <th className="w-9 py-2.5 ps-3 text-center">#</th>
              <th className="px-2 py-2.5 text-start">{t("description")}</th>
              <th className={cn("px-1 py-2.5 text-center", progress ? "w-[72px]" : "w-[88px]")}>
                {t("unit")}
              </th>
              {progress ? (
                <Fragment>
                  <th className="w-[78px] px-1 py-2.5 text-center">{t("contractQuantity")}</th>
                  <th className="w-[68px] px-1 py-2.5 text-center">{t("previous")}</th>
                  <th className="w-[80px] px-1 py-2.5 text-center">{t("current")}</th>
                </Fragment>
              ) : (
                <th className="w-[76px] px-1 py-2.5 text-center">{t("quantity")}</th>
              )}
              <th className="w-[100px] px-1 py-2.5 text-center">{t("price")}</th>
              {progress ? null : (
                <th className="w-[64px] px-1 py-2.5 text-center">{t("discount")}</th>
              )}
              <th className="w-[104px] px-1 py-2.5 text-center">{t("vat")}</th>
              <th className="w-[104px] px-2 py-2.5 text-end">{t("total")}</th>
              <th className="w-10 py-2.5 pe-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const menu = (
                <AppDropdownMenu>
                  <AppDropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("rowActions")}
                      className="flex size-8 items-center justify-center rounded-full text-[#8a97ad] hover:bg-[#f1f3f7] hover:text-[#0b1738]"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </AppDropdownMenuTrigger>
                  <AppDropdownMenuContent align="end" className="min-w-[170px]">
                    {line.lineType === "item" ? (
                      <AppDropdownMenuItem onSelect={() => duplicate(index)}>
                        <Copy className="size-4" />
                        {t("duplicate")}
                      </AppDropdownMenuItem>
                    ) : null}
                    <AppDropdownMenuItem disabled={index === 0} onSelect={() => move(index, -1)}>
                      <ArrowUp className="size-4" />
                      {t("moveUp")}
                    </AppDropdownMenuItem>
                    <AppDropdownMenuItem
                      disabled={index === lines.length - 1}
                      onSelect={() => move(index, 1)}
                    >
                      <ArrowDown className="size-4" />
                      {t("moveDown")}
                    </AppDropdownMenuItem>
                    <AppDropdownMenuSeparator />
                    <AppDropdownMenuItem
                      className="text-[#dc2626] focus:text-[#dc2626]"
                      onSelect={() => remove(line.key)}
                    >
                      <Trash2 className="size-4" />
                      {t("remove")}
                    </AppDropdownMenuItem>
                  </AppDropdownMenuContent>
                </AppDropdownMenu>
              )

              if (line.lineType === "section") {
                return (
                  <tr key={line.key} className="border-b border-[#e6e9f8] bg-[#f5f6ff]">
                    <td className="py-1.5 ps-3 text-center text-[#4f46e5]">
                      <Heading className="mx-auto size-3.5" />
                    </td>
                    <td colSpan={columns - 2} className="px-2 py-1.5">
                      <input
                        value={line.description}
                        onChange={(event) => patch(line.key, { description: event.target.value })}
                        placeholder={t("sectionPlaceholder")}
                        className={cn(
                          CELL_INPUT,
                          "font-extrabold text-[#28306b] hover:border-[#d9dcf7]"
                        )}
                      />
                    </td>
                    <td className="py-1.5 pe-2">{menu}</td>
                  </tr>
                )
              }
              if (line.lineType === "note") {
                return (
                  <tr key={line.key} className="border-b border-[#eef1f6]">
                    <td className="py-1.5 ps-3 text-center text-[#8a97ad]">
                      <StickyNote className="mx-auto size-3.5" />
                    </td>
                    <td colSpan={columns - 2} className="px-2 py-1.5">
                      <textarea
                        rows={1}
                        value={line.description}
                        onChange={(event) => patch(line.key, { description: event.target.value })}
                        placeholder={t("notePlaceholder")}
                        className={cn(
                          CELL_INPUT,
                          "h-auto min-h-10 resize-y py-2 leading-6 text-[#5b6b85] italic"
                        )}
                      />
                    </td>
                    <td className="py-1.5 pe-2">{menu}</td>
                  </tr>
                )
              }

              const position = positions[index]
              const contract =
                progress && line.quotationLineId
                  ? contractQuantities[line.quotationLineId]
                  : undefined
              const previous = line.progressPrevious ?? 0
              const current = line.progressCurrent ?? previous
              const computed = computeLine(line)
              const exempt = line.taxCategory !== "S"

              return (
                <Fragment key={line.key}>
                  <tr className={cn("align-top", exempt ? "" : "border-b border-[#eef1f6]")}>
                    <td
                      className={cn("pt-[18px] ps-3 text-center text-[12px] tabular-nums", MUTED)}
                    >
                      {position}
                    </td>
                    <td className="px-2 py-2">
                      <DescriptionInput
                        value={line.description}
                        onChange={(description) => patch(line.key, { description })}
                        placeholder={t("descriptionPlaceholder")}
                      />
                      {line.details === null ? (
                        <button
                          type="button"
                          onClick={() => patch(line.key, { details: "" })}
                          className="ms-2 mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#8a97ad] hover:text-[#4f46e5]"
                        >
                          <AlignLeft className="size-3" />
                          {t("addDetails")}
                        </button>
                      ) : (
                        <textarea
                          rows={2}
                          autoFocus={line.details === ""}
                          value={line.details}
                          onChange={(event) => patch(line.key, { details: event.target.value })}
                          onBlur={() => {
                            if (!line.details?.trim()) patch(line.key, { details: null })
                          }}
                          placeholder={t("detailsPlaceholder")}
                          className={cn(
                            CELL_INPUT,
                            "mt-1 h-auto min-h-[52px] resize-y py-1.5 text-[12px] leading-5 text-[#5b6b85]"
                          )}
                        />
                      )}
                    </td>
                    <td className="px-1 py-2">
                      <input
                        list={unitsId}
                        value={line.unit ?? ""}
                        onChange={(event) => patch(line.key, { unit: event.target.value || null })}
                        placeholder="—"
                        aria-label={t("unit")}
                        className={cn(CELL_INPUT, "text-center")}
                      />
                    </td>
                    {progress ? (
                      contract === undefined ? (
                        <td colSpan={3} className="px-1 py-2">
                          <NumberInput
                            cell
                            aria-label={t("quantity")}
                            value={line.quantity}
                            onChange={(value) => patch(line.key, { quantity: value })}
                          />
                        </td>
                      ) : (
                        <Fragment>
                          <td className={cn("px-1 pt-[18px] text-center tabular-nums", MUTED)}>
                            {quantity(contract)}
                          </td>
                          <td className={cn("px-1 pt-[18px] text-center tabular-nums", MUTED)}>
                            {quantity(previous)}%
                          </td>
                          <td className="px-1 py-2">
                            <NumberInput
                              cell
                              aria-label={t("current")}
                              min={0}
                              max={100}
                              value={current}
                              onChange={(value) => {
                                const next = Math.max(value, previous)
                                patch(line.key, {
                                  progressPrevious: previous,
                                  progressCurrent: next,
                                  quantity: roundQuantity((contract * (next - previous)) / 100),
                                })
                              }}
                              className="border-[#e1e7f0] bg-white font-bold text-[#4f46e5]"
                            />
                            <p
                              className={cn("mt-0.5 text-center text-[10.5px] tabular-nums", MUTED)}
                            >
                              {t("thisClaim", { quantity: quantity(line.quantity) })}
                            </p>
                          </td>
                        </Fragment>
                      )
                    ) : (
                      <td className="px-1 py-2">
                        <NumberInput
                          cell
                          aria-label={t("quantity")}
                          value={line.quantity}
                          onChange={(value) => patch(line.key, { quantity: value })}
                        />
                      </td>
                    )}
                    <td className="px-1 py-2">
                      <NumberInput
                        cell
                        aria-label={t("price")}
                        value={line.unitPrice}
                        onChange={(value) => patch(line.key, { unitPrice: value })}
                      />
                    </td>
                    {progress ? null : (
                      <td className="px-1 py-2">
                        <NumberInput
                          cell
                          aria-label={t("discount")}
                          max={100}
                          value={line.discountPercent}
                          onChange={(value) => patch(line.key, { discountPercent: value })}
                        />
                      </td>
                    )}
                    <td className="px-1 py-2">
                      <AppSelect
                        value={line.taxCategory}
                        onValueChange={(value) => setCategory(line, value as TaxCategory)}
                      >
                        <AppSelectTrigger
                          aria-label={t("vat")}
                          className={cn(
                            CELL_INPUT,
                            "justify-between gap-1 px-2 text-[12.5px] shadow-none"
                          )}
                        >
                          <AppSelectValue />
                        </AppSelectTrigger>
                        <AppSelectContent>
                          {TAX_CATEGORIES.map((category) => (
                            <AppSelectItem key={category} value={category}>
                              {tTax(category)}
                            </AppSelectItem>
                          ))}
                        </AppSelectContent>
                      </AppSelect>
                    </td>
                    <td className="px-2 pt-[18px] text-end">
                      <span className={cn("font-extrabold tabular-nums", HEADING)}>
                        {money(computed.netAmount)}
                      </span>
                      {computed.taxAmount > 0 ? (
                        <span className={cn("block text-[10.5px] tabular-nums", MUTED)}>
                          {t("plusVat", { amount: money(computed.taxAmount) })}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pe-2">{menu}</td>
                  </tr>
                  {exempt ? (
                    <tr className="border-b border-[#eef1f6]">
                      <td />
                      <td colSpan={columns - 2} className="px-2 pb-2.5">
                        <div className="grid gap-2 rounded-[12px] bg-[#fffbf0] p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                          <AppSelect
                            value={line.exemptionCode ?? ""}
                            onValueChange={(code) =>
                              patch(line.key, {
                                exemptionCode: code,
                                exemptionReason: tExemptions(code),
                              })
                            }
                          >
                            <AppSelectTrigger
                              aria-label={t("exemptionCode")}
                              className="h-10 w-full rounded-[10px] border-[#f3e2b3] bg-white px-2.5 text-[12.5px] shadow-none"
                            >
                              <AppSelectValue placeholder={t("exemptionCode")} />
                            </AppSelectTrigger>
                            <AppSelectContent>
                              {EXEMPTION_CODES[line.taxCategory as Exclude<TaxCategory, "S">].map(
                                (code) => (
                                  <AppSelectItem key={code} value={code}>
                                    {tExemptions(code)}
                                  </AppSelectItem>
                                )
                              )}
                            </AppSelectContent>
                          </AppSelect>
                          <input
                            value={line.exemptionReason ?? ""}
                            onChange={(event) =>
                              patch(line.key, { exemptionReason: event.target.value || null })
                            }
                            placeholder={t("exemptionReason")}
                            aria-label={t("exemptionReason")}
                            className="h-10 w-full rounded-[10px] border border-[#f3e2b3] bg-white px-2.5 text-[12.5px] outline-none focus:border-[#d97706]"
                          />
                        </div>
                      </td>
                      <td />
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
            {lines.length === 0 ? (
              <tr>
                <td colSpan={columns} className={cn("px-5 py-8 text-center text-[13px]", MUTED)}>
                  {t("empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#eef1f6] bg-[#fcfcfe] px-5 py-3.5">
        <button type="button" className={ADD_BUTTON} onClick={() => add(emptyLine())}>
          <Plus className="size-4" strokeWidth={2.5} />
          {t("addItem")}
        </button>
        {products.length ? (
          <div className="w-[210px]">
            <AppSearchableSelect
              value=""
              options={productOptions}
              onChange={addProduct}
              placeholder={t("addProduct")}
              searchPlaceholder={t("searchProducts")}
              emptyLabel={t("noProducts")}
              ariaLabel={t("addProduct")}
              hideTriggerMark
              triggerClassName="h-10 rounded-full border-dashed border-[#c9cffb] px-3.5 text-[12.5px] font-bold [&>span]:text-[#4f46e5]"
              footer={() => (
                <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-[#8a97ad]">
                  <PackageSearch className="size-3.5" />
                  {t("productsHint")}
                </p>
              )}
            />
          </div>
        ) : null}
        <button
          type="button"
          className={cn(ADD_BUTTON, "border-[#e1e7f0] text-[#5b6b85] hover:bg-[#f7f9fc]")}
          onClick={() => add(emptyLine({ lineType: "section", quantity: 0 }))}
        >
          <Heading className="size-3.5" />
          {t("addSection")}
        </button>
        <button
          type="button"
          className={cn(ADD_BUTTON, "border-[#e1e7f0] text-[#5b6b85] hover:bg-[#f7f9fc]")}
          onClick={() => add(emptyLine({ lineType: "note", quantity: 0 }))}
        >
          <StickyNote className="size-3.5" />
          {t("addNote")}
        </button>
      </div>
    </section>
  )
}
