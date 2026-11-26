"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { type LaundryCatalog, laundryService } from "../services/laundry.service"
import {
  errorText,
  FIELD,
  HEADING,
  LaundryPage,
  Loading,
  MUTED,
  PANEL,
  PRIMARY,
  SECONDARY,
  useLaundryAccess,
  useTx,
} from "./shell"

const ICON =
  "flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[#6b7b96] transition hover:bg-[#f1f5f9] hover:text-[#0b1738]"

// A name that can be renamed in place and deleted: the pencil turns it into a box.
function EditableName({
  name,
  hint,
  canManage,
  onRename,
  onDelete,
}: {
  name: string
  hint?: string | null
  canManage: boolean
  onRename: (next: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const { tx } = useTx()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  async function save() {
    const next = draft.trim()
    if (!next || next === name) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onRename(next)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save()
            if (event.key === "Escape") setEditing(false)
          }}
          className="h-8 min-w-0 flex-1 rounded-[8px] border border-[#2563eb] px-2 text-[13px] outline-none"
        />
        <button
          type="button"
          className={ICON}
          disabled={busy}
          onClick={() => void save()}
          aria-label={tx("حفظ", "Save")}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5 text-[#16a34a]" />
          )}
        </button>
        <button
          type="button"
          className={ICON}
          onClick={() => setEditing(false)}
          aria-label={tx("إلغاء", "Cancel")}
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }
  return (
    <div className="group flex items-center gap-1">
      <span className={cn("truncate font-semibold", HEADING)}>{name}</span>
      {hint ? <span className={cn("text-[11px]", MUTED)}>{hint}</span> : null}
      {canManage ? (
        <span className="ms-auto flex opacity-60 transition group-hover:opacity-100">
          <button
            type="button"
            className={ICON}
            aria-label={tx("تعديل الاسم", "Rename")}
            onClick={() => {
              setDraft(name)
              setEditing(true)
            }}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className={cn(ICON, "hover:text-[#b42318]")}
            aria-label={tx("حذف", "Delete")}
            onClick={() => {
              if (
                !window.confirm(
                  tx(
                    `حذف «${name}» وأسعاره؟ الطلبات السابقة لا تتأثر.`,
                    `Delete “${name}” and its prices? Past orders are not affected.`
                  )
                )
              )
                return
              void onDelete()
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      ) : null}
    </div>
  )
}

// The price list: one row per piece, one column per service. Empty means that piece is not
// offered with that service. Pieces and services can be added, renamed and deleted.
export function LaundryPricesPage() {
  const { tx, ar } = useTx()
  const { canManage } = useLaundryAccess()
  const [catalog, setCatalog] = useState<LaundryCatalog | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [newItem, setNewItem] = useState("")
  const [newService, setNewService] = useState("")

  // Keeps prices typed but not yet saved when the list itself changes (a rename, a new row).
  const take = (next: LaundryCatalog, keepTyped = false) => {
    setCatalog(next)
    setDraft((current) => ({
      ...Object.fromEntries(
        Object.entries(next.prices).map(([key, value]) => [key, String(value)])
      ),
      ...(keepTyped ? current : {}),
    }))
  }
  useEffect(() => {
    void laundryService.catalog().then((next) => take(next))
  }, [])

  const run = async (work: () => Promise<LaundryCatalog>, done?: string) => {
    try {
      take(await work(), true)
      if (done) toast.success(done)
    } catch (error) {
      toast.error(errorText(error, ar))
    }
  }

  async function save() {
    if (!catalog) return
    const changes: Array<{ itemId: string; serviceId: string; price: number | null }> = []
    for (const item of catalog.items) {
      for (const service of catalog.services) {
        const key = `${item.id}:${service.id}`
        const typed = (draft[key] ?? "").trim()
        const before = catalog.prices[key]
        const price = typed === "" ? null : Number(typed)
        if (price !== null && (!Number.isFinite(price) || price < 0)) continue
        if ((price ?? undefined) !== before)
          changes.push({ itemId: item.id, serviceId: service.id, price })
      }
    }
    if (changes.length === 0) {
      toast.success(tx("لا تغييرات.", "Nothing changed."))
      return
    }
    setSaving(true)
    try {
      take(await laundryService.setPrices(changes))
      toast.success(tx("حُفظت الأسعار.", "Prices saved."))
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setSaving(false)
    }
  }

  async function add(kind: "item" | "service") {
    const name = (kind === "item" ? newItem : newService).trim()
    if (!name) return
    await run(() =>
      kind === "item" ? laundryService.addItem({ name }) : laundryService.addService({ name })
    )
    if (kind === "item") setNewItem("")
    else setNewService("")
  }

  return (
    <LaundryPage
      title={tx("قائمة الأسعار", "Price list")}
      subtitle={tx(
        "سعر كل قطعة لكل خدمة. اترك الخانة فارغة إذا لا تقدّم الخدمة لهذه القطعة.",
        "The price of each piece for each service. Leave a box empty if you don't offer it."
      )}
      actions={
        canManage ? (
          <button
            type="button"
            className={PRIMARY}
            disabled={saving || !catalog}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {tx("حفظ الأسعار", "Save prices")}
          </button>
        ) : null
      }
    >
      {!catalog ? (
        <Loading />
      ) : (
        <>
          <div className={cn(PANEL, "overflow-x-auto")}>
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#e4e9f2] bg-[#f7f9fc]">
                  <th className="w-56 px-4 py-3 text-start text-[12px] font-bold text-[#52607a]">
                    {tx("القطعة / الخدمة", "Piece / service")}
                  </th>
                  {catalog.services.map((service) => (
                    <th
                      key={service.id}
                      className="min-w-40 px-3 py-2.5 text-start text-[12px] font-bold text-[#52607a]"
                    >
                      <EditableName
                        name={service.name}
                        canManage={canManage}
                        onRename={(name) =>
                          run(
                            () => laundryService.updateService(service.id, { name }),
                            tx("حُفظ الاسم.", "Renamed.")
                          )
                        }
                        onDelete={() =>
                          run(
                            () => laundryService.deleteService(service.id),
                            tx("حُذفت الخدمة.", "Service deleted.")
                          )
                        }
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalog.items.map((item) => (
                  <tr key={item.id} className="border-b border-[#f1f5f9] hover:bg-[#fafbfd]">
                    <td className="px-4 py-2">
                      <EditableName
                        name={item.name}
                        hint={item.category}
                        canManage={canManage}
                        onRename={(name) =>
                          run(
                            () =>
                              laundryService.updateItem(item.id, { name, category: item.category }),
                            tx("حُفظ الاسم.", "Renamed.")
                          )
                        }
                        onDelete={() =>
                          run(
                            () => laundryService.deleteItem(item.id),
                            tx("حُذفت القطعة.", "Piece deleted.")
                          )
                        }
                      />
                    </td>
                    {catalog.services.map((service) => {
                      const key = `${item.id}:${service.id}`
                      return (
                        <td key={service.id} className="px-3 py-2">
                          <div className="relative w-28">
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              inputMode="decimal"
                              disabled={!canManage}
                              value={draft[key] ?? ""}
                              onChange={(event) =>
                                setDraft((current) => ({ ...current, [key]: event.target.value }))
                              }
                              placeholder="—"
                              className="h-9 w-full rounded-[10px] border border-[#e1e7f0] bg-white ps-2 pe-9 text-[13px] text-[#0b1738] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15"
                            />
                            <span className="pointer-events-none absolute inset-y-0 end-2 my-auto h-fit text-[11px] text-[#95a4bd]">
                              {tx("ر.س", "SAR")}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {catalog.items.length === 0 || catalog.services.length === 0 ? (
              <p className={cn("p-8 text-center text-[13px]", MUTED)}>
                {tx("أضف قطعة وخدمة واحدة على الأقل.", "Add at least one piece and one service.")}
              </p>
            ) : null}
          </div>
          {canManage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={cn(PANEL, "flex gap-2 p-3")}>
                <input
                  className={FIELD}
                  value={newItem}
                  onChange={(event) => setNewItem(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void add("item")}
                  placeholder={tx("قطعة جديدة، مثل: سجادة", "New piece, e.g. rug")}
                />
                <button type="button" className={SECONDARY} onClick={() => void add("item")}>
                  <Plus className="size-4" />
                  {tx("قطعة", "Piece")}
                </button>
              </div>
              <div className={cn(PANEL, "flex gap-2 p-3")}>
                <input
                  className={FIELD}
                  value={newService}
                  onChange={(event) => setNewService(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void add("service")}
                  placeholder={tx("خدمة جديدة، مثل: تعقيم", "New service, e.g. sanitise")}
                />
                <button type="button" className={SECONDARY} onClick={() => void add("service")}>
                  <Plus className="size-4" />
                  {tx("خدمة", "Service")}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </LaundryPage>
  )
}
