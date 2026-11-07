"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, Search } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import { FIELD_CLASS, MUTED } from "./promotion-styles"

export interface PickerProduct {
  id: string
  name: string
  sku: string | null
  category: string | null
}

// Picks several products by name or SKU -- the chosen ones first, then the search results.
export function ProductMultiPicker({
  products,
  selected,
  onChange,
}: {
  products: PickerProduct[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const t = useTranslations("promotions.editor")
  const [search, setSearch] = useState("")
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = products.filter(
      (product) =>
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.sku ?? "").toLowerCase().includes(query)
    )
    return [
      ...matches.filter((product) => selected.includes(product.id)),
      ...matches.filter((product) => !selected.includes(product.id)),
    ].slice(0, 80)
  }, [products, search, selected])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id])

  return (
    <div className="rounded-[12px] border border-[#e1e7f0]">
      <div className="relative border-b border-[#eef2f8] p-2">
        <Search className="pointer-events-none absolute inset-y-0 start-5 my-auto size-4 text-[#95a4bd]" />
        <AppInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchProducts")}
          className={cn(FIELD_CLASS, "h-10 ps-9")}
        />
      </div>
      <div className="max-h-52 overflow-y-auto p-1.5">
        {visible.length === 0 ? (
          <p className={cn("py-6 text-center text-[12px]", MUTED)}>{t("noProducts")}</p>
        ) : (
          visible.map((product) => {
            const isSelected = selected.includes(product.id)
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggle(product.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-start text-[12.5px] transition-colors",
                  isSelected ? "bg-[#fff4e5]" : "hover:bg-[#f7f9fc]"
                )}
              >
                <span
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border",
                    isSelected
                      ? "border-[#ea580c] bg-[#ea580c] text-white"
                      : "border-[#cfd8e6] bg-white"
                  )}
                >
                  {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-[#0b1738]">
                  {product.name}
                </span>
                {product.category ? (
                  <span className={cn("shrink-0 text-[11px]", MUTED)}>{product.category}</span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
      <p className={cn("border-t border-[#eef2f8] px-3 py-2 text-[11.5px]", MUTED)}>
        {t("selectedCount", { count: selected.length })}
      </p>
    </div>
  )
}
