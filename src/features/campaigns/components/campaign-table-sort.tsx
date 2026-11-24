"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"

// Sorting for the tables of the campaigns screens: press a column's heading to order the rows by
// it, press again to turn the order round. One piece, so every table behaves the same way:
// numbers start from the largest (what a merchant looks for first), names from the first letter;
// a row with no value for the column stays at the bottom whichever way the order runs.

export type SortDirection = "asc" | "desc"
export interface TableSort<Key extends string> {
  key: Key
  direction: SortDirection
}

export function useTableSort<Key extends string>(initial: TableSort<Key> | null = null) {
  const [sort, setSort] = useState<TableSort<Key> | null>(initial)
  // `first` is the order a column starts in when it was not the sorted one.
  const toggle = useCallback((key: Key, first: SortDirection = "desc") => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: first }
    )
  }, [])
  return { sort, toggle }
}

type SortValue = string | number | null | undefined

// The rows in the chosen order (a copy; the rows given are left as they are). `value` says what
// a row holds for a column: a number, a piece of text, or nothing.
export function sortRows<Row, Key extends string>(
  rows: readonly Row[],
  sort: TableSort<Key> | null,
  value: (row: Row, key: Key) => SortValue
): Row[] {
  if (!sort) return [...rows]
  const empty = (entry: SortValue) =>
    entry === null || entry === undefined || entry === "" || Number.isNaN(entry)
  const turn = sort.direction === "asc" ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, held: value(row, sort.key) }))
    .sort((a, b) => {
      const aEmpty = empty(a.held)
      const bEmpty = empty(b.held)
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1
      const order =
        typeof a.held === "number" && typeof b.held === "number"
          ? a.held - b.held
          : String(a.held).localeCompare(String(b.held), ["ar", "en"], {
              numeric: true,
              sensitivity: "base",
            })
      // Equal rows keep the order they came in.
      return order === 0 ? a.index - b.index : order * turn
    })
    .map((entry) => entry.row)
}

// What a column's <th> says to a screen reader about the order.
export function ariaSort<Key extends string>(
  sort: TableSort<Key> | null,
  key: Key
): "ascending" | "descending" | "none" {
  if (sort?.key !== key) return "none"
  return sort.direction === "asc" ? "ascending" : "descending"
}

// A column's heading as a button: its label and an arrow showing the order (two faint arrows
// while the table is not sorted by it).
export function SortHeading<Key extends string>({
  label,
  column,
  sort,
  onSort,
  text = false,
  className,
}: {
  label: string
  column: Key
  sort: TableSort<Key> | null
  onSort: (key: Key, first?: SortDirection) => void
  // A column of names: it starts from the first letter, not from the largest.
  text?: boolean
  className?: string
}) {
  const t = useTranslations("campaigns.tableSort")
  const active = sort?.key === column
  const Arrow = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(column, text ? "asc" : "desc")}
      title={t("sortBy", { column: label })}
      aria-label={
        active
          ? t(sort.direction === "asc" ? "sortedAscending" : "sortedDescending", { column: label })
          : t("sortBy", { column: label })
      }
      className={cn(
        "-mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-[6px] px-1.5 text-inherit transition-colors hover:bg-[#eef2f8] hover:text-[#0b1738]",
        active && "font-bold text-[#1d4fd8]",
        className
      )}
    >
      <span>{label}</span>
      <Arrow className={cn("size-3 shrink-0", !active && "opacity-40")} />
    </button>
  )
}
