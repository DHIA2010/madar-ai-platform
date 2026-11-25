"use client"

import { useRef, useState } from "react"
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppDialog, AppInput } from "@/components/app"

import {
  type CrmImportResult,
  crmImportService,
  mapLeadRows,
  type ParsedLeadFile,
  readLeadFile,
} from "../services/crm-import.service"
import { LeadSourcePicker, useLeadSources } from "./crm-ui"

type Column = "companyName" | "contactName" | "phone" | "email"
const COLUMNS: { key: Column; label: string }[] = [
  { key: "companyName", label: "اسم الشركة أو النشاط" },
  { key: "contactName", label: "اسم المسؤول" },
  { key: "phone", label: "رقم الجوال" },
  { key: "email", label: "البريد الإلكتروني" },
]

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date())

// "استيراد من ملف" on the leads page: an Excel or CSV file of leads, read in the browser, its
// columns matched to the lead's fields (guessed, and changeable), then added to the CRM under
// one tag. Leads already in the CRM by the same phone or e-mail are passed over.
export function LeadImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<ParsedLeadFile | null>(null)
  const [fileName, setFileName] = useState("")
  const [columns, setColumns] = useState<Record<Column, number>>({
    companyName: -1,
    contactName: -1,
    phone: -1,
    email: -1,
  })
  const [tag, setTag] = useState(`استيراد ${today()}`)
  const [leadSource, setLeadSource] = useState("")
  const sources = useLeadSources()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CrmImportResult | null>(null)

  const reset = () => {
    setFile(null)
    setFileName("")
    setResult(null)
    setTag(`استيراد ${today()}`)
  }
  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  async function choose(chosen: File | undefined) {
    if (!chosen) return
    setBusy(true)
    try {
      const parsed = await readLeadFile(chosen)
      if (parsed.rows.length === 0) {
        toast.error("الملف فارغ أو لا يمكن قراءته.")
        return
      }
      setFile(parsed)
      setFileName(chosen.name)
      setColumns(parsed.guess)
      setResult(null)
    } catch {
      toast.error("تعذرت قراءة الملف. استخدم ملف Excel أو CSV.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  async function run() {
    if (!file) return
    setBusy(true)
    try {
      const outcome = await crmImportService.importLeads(
        tag.trim(),
        mapLeadRows(file, columns),
        undefined,
        leadSource || null
      )
      setResult(outcome)
      if (outcome.created > 0) onImported()
    } catch {
      toast.error("تعذر استيراد الملف. حاول مرة أخرى.")
    } finally {
      setBusy(false)
    }
  }

  const rows = file ? mapLeadRows(file, columns) : []
  const ready = file !== null && (columns.phone >= 0 || columns.email >= 0) && tag.trim().length > 0

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title="استيراد عملاء محتملين من ملف"
      description="ملف Excel أو CSV فيه اسم النشاط ورقم الجوال أو البريد. من هو موجود في النظام بنفس الجوال أو البريد لا يُضاف مرة أخرى."
      contentClassName="max-w-[46rem]"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <AppButton variant="outline" disabled={busy} onClick={close}>
            {result ? "إغلاق" : "إلغاء"}
          </AppButton>
          {file && !result ? (
            <AppButton disabled={busy || !ready} onClick={() => void run()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              استيراد {rows.length} صفًا
            </AppButton>
          ) : null}
        </div>
      }
    >
      <div dir="rtl" className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(event) => void choose(event.target.files?.[0])}
        />

        {result ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <p className="flex items-center gap-2 text-base font-bold">
              <CheckCircle2 className="size-5" />
              أُضيف {result.created} عميلًا محتملًا
            </p>
            <ul className="mt-2 space-y-1 text-sm leading-6">
              <li>مكرر (موجود بنفس الجوال أو البريد) ولم يُضف: {result.duplicates}</li>
              <li>صفوف ناقصة (بلا اسم، أو بلا جوال وبريد صحيحين) ولم تُضف: {result.invalid}</li>
              <li>
                كل ما أُضيف يحمل الوسم «{tag.trim()}»، وتجده به في فلاتر صفحة العملاء المحتملين.
              </li>
            </ul>
          </div>
        ) : !file ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 text-center transition hover:bg-muted/60"
          >
            {busy ? (
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-7 text-muted-foreground" />
            )}
            <span className="text-base font-bold text-foreground">اختر الملف</span>
            <span className="text-sm text-muted-foreground">
              Excel (.xlsx) أو CSV. الصف الأول عناوين الأعمدة، مثل: الاسم، الجوال، البريد.
            </span>
          </button>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileSpreadsheet className="size-4" />
                <span dir="ltr">{fileName}</span>
                <span className="text-muted-foreground">· {file.rows.length} صفًا</span>
              </p>
              <AppButton variant="outline" disabled={busy} onClick={() => input.current?.click()}>
                ملف آخر
              </AppButton>
            </div>

            <div>
              <p className="mb-2 text-sm font-bold text-foreground">أي عمود في الملف يحمل ماذا؟</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {COLUMNS.map(({ key, label }) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block font-medium text-foreground">{label}</span>
                    <select
                      className="h-10 w-full rounded-[10px] border border-border bg-white px-3 text-sm outline-none focus:border-[#1d4fd8]"
                      value={columns[key]}
                      onChange={(event) =>
                        setColumns((current) => ({ ...current, [key]: Number(event.target.value) }))
                      }
                    >
                      <option value={-1}>— لا يوجد —</option>
                      {file.headers.map((header, index) => (
                        <option key={`${index}:${header}`} value={index}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {columns.phone < 0 && columns.email < 0 ? (
                <p className="mt-2 text-sm font-semibold text-rose-600">
                  حدّد عمود الجوال أو عمود البريد على الأقل.
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-sm font-bold text-foreground">أول الصفوف كما ستُضاف</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      {COLUMNS.map(({ key, label }) => (
                        <th key={key} className="px-3 py-2 text-start font-semibold">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, index) => (
                      <tr key={index} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold text-foreground">
                          {row.companyName ?? "—"}
                        </td>
                        <td className="px-3 py-2">{row.contactName ?? "—"}</td>
                        <td className="px-3 py-2" dir="ltr">
                          {row.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2" dir="ltr">
                          {row.email ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-bold text-foreground">وسم هذه القائمة</span>
              <AppInput
                maxLength={40}
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              />
              <span className="mt-1 block text-[12.5px] text-muted-foreground">
                يُكتب على كل عميل من هذا الملف، لتجد القائمة لاحقًا من الفلاتر.
              </span>
            </label>
            <div className="block text-sm">
              <span className="mb-1 block font-bold text-foreground">مصدر العملاء</span>
              <LeadSourcePicker value={leadSource} sources={sources} onChange={setLeadSource} />
              <span className="mt-1 block text-[12.5px] text-muted-foreground">
                من أين جاءت هذه القائمة، مثل سناب شات أو معرض. اختر من القائمة أو اكتب مصدرًا
                جديدًا.
              </span>
            </div>
          </>
        )}
      </div>
    </AppDialog>
  )
}
