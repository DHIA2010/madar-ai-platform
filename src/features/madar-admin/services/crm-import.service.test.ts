// @vitest-environment node
import { expect, it, vi } from "vitest"
import * as XLSX from "xlsx"

vi.mock("@/infrastructure/data/api/http-data-client", () => ({ createHttpDataClient: () => ({}) }))
vi.mock("@/infrastructure/identity", () => ({ createSessionManager: () => ({}) }))

import { mapLeadRows, readLeadFile } from "./crm-import.service"

it("reads an Arabic CSV with headers", async () => {
  const csv =
    "اسم النشاط,المسؤول,رقم الجوال,البريد الإلكتروني\nمطعم الريم,سارة,0553334444,reem@example.com\nمقهى النخيل,,0557778888,\n"
  const parsed = await readLeadFile(new File([csv], "leads.csv"))
  expect(parsed.headers).toEqual(["اسم النشاط", "المسؤول", "رقم الجوال", "البريد الإلكتروني"])
  expect(parsed.guess).toEqual({ companyName: 0, contactName: 1, phone: 2, email: 3 })
  expect(mapLeadRows(parsed, parsed.guess)).toEqual([
    {
      companyName: "مطعم الريم",
      contactName: "سارة",
      phone: "0553334444",
      email: "reem@example.com",
    },
    { companyName: "مقهى النخيل", contactName: null, phone: "0557778888", email: null },
  ])
})

it("reads an Excel file with English headers, and one with no header row", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Phone", "Company", "Email"],
    ["0551112222", "Old Bakery", "a@b.co"],
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1")
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" })
  const parsed = await readLeadFile(new File([bytes], "leads.xlsx"))
  expect(parsed.guess).toMatchObject({ phone: 0, companyName: 1, email: 2 })
  expect(mapLeadRows(parsed, parsed.guess)[0]).toMatchObject({
    companyName: "Old Bakery",
    phone: "0551112222",
  })

  const bare = await readLeadFile(
    new File(["محل الورد,0559990000\nمحل الياسمين,0559990001\n"], "bare.csv")
  )
  expect(bare.rows).toHaveLength(2)
  expect(bare.guess).toMatchObject({ companyName: 0, phone: 1 })
})
