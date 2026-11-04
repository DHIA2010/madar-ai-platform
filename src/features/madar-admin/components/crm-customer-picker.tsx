"use client"

import { useEffect, useState } from "react"
import { Building2, Plus, Search } from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppDialog, AppInput } from "@/components/app"

import { crmService } from "../services"
import type { CrmLead } from "../types/crm.types"
import { StageBadge } from "./crm-ui"

// Who a new quote or invoice is for: an existing lead or customer, or a new one added here.
export function CustomerPickerDialog({
  open,
  title,
  onClose,
  onPick,
}: {
  open: boolean
  title: string
  onClose: () => void
  onPick: (leadId: string) => void
}) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<CrmLead[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ companyName: "", contactName: "", phone: "", email: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    const timer = setTimeout(() => {
      crmService
        .listLeads({ search: search.trim() || undefined }, 1, 8)
        .then((page) => {
          if (active) setResults(page.items)
        })
        .catch(() => {
          if (active) setResults([])
        })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [open, search])

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  async function addAndPick() {
    if (form.companyName.trim().length < 2) {
      toast.error("اكتب اسم الشركة.")
      return
    }
    setSaving(true)
    try {
      const created = await crmService.createLead({
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      })
      onPick(created.lead.id)
    } catch {
      toast.error("تعذر إضافة العميل. تأكد من البيانات.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAdding(false)
          onClose()
        }
      }}
      title={<span dir="rtl">{title}</span>}
      description={<span dir="rtl">اختر العميل، أو أضف عميلًا جديدًا.</span>}
      contentClassName="[direction:rtl] max-w-[32rem] gap-4 p-6"
    >
      <div dir="rtl" className="space-y-3">
        {adding ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-semibold">
                اسم الشركة <span className="text-rose-500">*</span>
              </span>
              <AppInput value={form.companyName} onChange={set("companyName")} className="h-11" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">اسم الشخص</span>
              <AppInput value={form.contactName} onChange={set("contactName")} className="h-11" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">الجوال</span>
              <AppInput
                value={form.phone}
                onChange={set("phone")}
                dir="ltr"
                className="h-11 text-right"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-semibold">البريد الإلكتروني</span>
              <AppInput
                value={form.email}
                onChange={set("email")}
                dir="ltr"
                className="h-11 text-right"
              />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <AppButton
                className="h-11 flex-1 rounded-[10px]"
                loading={saving}
                onClick={() => void addAndPick()}
              >
                إضافة ومتابعة
              </AppButton>
              <AppButton
                variant="outline"
                className="h-11 flex-1 rounded-[10px]"
                onClick={() => setAdding(false)}
              >
                رجوع
              </AppButton>
            </div>
          </div>
        ) : (
          <>
            <AppInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو الجوال أو البريد..."
              startIcon={<Search className="size-4 text-muted-foreground" />}
              className="h-11"
              autoFocus
            />
            <ul className="max-h-[300px] space-y-1.5 overflow-y-auto">
              {(results ?? []).map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => onPick(lead.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 p-3 text-start transition-colors hover:bg-muted/60"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Building2 className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{lead.companyName}</span>
                        <span className="block truncate text-xs text-muted-foreground" dir="auto">
                          {lead.phone ?? lead.email ?? "—"}
                        </span>
                      </span>
                    </span>
                    <StageBadge stage={lead.stage} />
                  </button>
                </li>
              ))}
              {results !== null && results.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                  لا توجد نتائج.
                </li>
              ) : null}
            </ul>
            <AppButton
              variant="outline"
              icon={<Plus className="size-4" />}
              className="h-11 w-full rounded-[10px]"
              onClick={() => {
                setForm({ companyName: search.trim(), contactName: "", phone: "", email: "" })
                setAdding(true)
              }}
            >
              عميل جديد
            </AppButton>
          </>
        )}
      </div>
    </AppDialog>
  )
}
