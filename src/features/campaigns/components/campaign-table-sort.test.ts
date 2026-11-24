import { describe, expect, it } from "vitest"

import { ariaSort, sortRows } from "./campaign-table-sort"

// The order the campaigns tables put their rows in when a column's heading is pressed.
describe("sorting a campaigns table", () => {
  const ads = [
    { name: "booking", spend: 220, cpa: 110 as number | null },
    { name: "POS_Offer", spend: 307, cpa: 153 },
    { name: "عرض الشتاء", spend: 38, cpa: null },
    { name: "POS_Cashier", spend: 134, cpa: 134 },
  ]
  const value = (ad: (typeof ads)[number], column: "name" | "spend" | "cpa") => ad[column]
  const names = (rows: typeof ads) => rows.map((ad) => ad.name)

  it("orders numbers both ways and leaves the rows it was given alone", () => {
    const before = names(ads)
    expect(names(sortRows(ads, { key: "spend", direction: "desc" }, value))).toEqual([
      "POS_Offer",
      "booking",
      "POS_Cashier",
      "عرض الشتاء",
    ])
    expect(names(sortRows(ads, { key: "spend", direction: "asc" }, value))[0]).toBe("عرض الشتاء")
    expect(names(ads)).toEqual(before)
    // No column chosen: the order the rows came in.
    expect(names(sortRows(ads, null, value))).toEqual(before)
  })

  it("keeps a row with no value at the bottom whichever way the order runs", () => {
    for (const direction of ["asc", "desc"] as const) {
      expect(names(sortRows(ads, { key: "cpa", direction }, value)).at(-1)).toBe("عرض الشتاء")
    }
    expect(names(sortRows(ads, { key: "cpa", direction: "asc" }, value))[0]).toBe("booking")
  })

  it("orders names by their letters, whatever their case, and equal rows as they came", () => {
    // Arabic names come before Latin ones, as an Arabic reader's order has them.
    expect(names(sortRows(ads, { key: "name", direction: "asc" }, value))).toEqual([
      "عرض الشتاء",
      "booking",
      "POS_Cashier",
      "POS_Offer",
    ])
    const tied = [
      { name: "a", spend: 5, cpa: null },
      { name: "b", spend: 5, cpa: null },
    ]
    for (const direction of ["asc", "desc"] as const) {
      expect(names(sortRows(tied, { key: "spend", direction }, value))).toEqual(["a", "b"])
    }
  })

  it("tells a screen reader which column the table is ordered by", () => {
    expect(ariaSort({ key: "spend", direction: "desc" }, "spend")).toBe("descending")
    expect(ariaSort({ key: "spend", direction: "asc" }, "spend")).toBe("ascending")
    expect(ariaSort({ key: "spend", direction: "asc" }, "name")).toBe("none")
    expect(ariaSort(null, "name")).toBe("none")
  })
})
