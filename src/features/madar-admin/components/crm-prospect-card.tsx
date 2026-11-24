"use client"

import { type ReactNode, useState } from "react"
import {
  AtSign,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import { crmService, formatRelative } from "../services"
import type { CrmProspect, CrmProspectMark, CrmProspectStatus } from "../types"

// What the prospect finder's two sources (the free directory and Google Maps) show alike: one
// business as a card, and the bar that turns the ticked ones into leads.

export const PROSPECT_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-white px-3 text-[13px] font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"

const STATUS: Record<CrmProspectStatus, { label: string; tint: string }> = {
  contacted: { label: "تم التواصل", tint: "bg-sky-100 text-sky-700" },
  interested: { label: "مهتم", tint: "bg-emerald-100 text-emerald-700" },
  not_interested: { label: "غير مهتم", tint: "bg-rose-100 text-rose-700" },
  no_answer: { label: "لم يرد", tint: "bg-amber-100 text-amber-700" },
}

// A Saudi mobile in WhatsApp's form. Landlines have no WhatsApp.
function whatsAppNumber(international: string | null): string | null {
  const digits = (international ?? "").replace(/\D/g, "")
  return /^9665\d{8}$/.test(digits) ? digits : null
}

export function ProspectCard({
  prospect,
  selectable,
  checked,
  onToggle,
  onMarked,
  extra,
}: {
  prospect: CrmProspect
  // Whether it can be ticked to become a lead (it needs a phone either way).
  selectable: boolean
  checked: boolean
  onToggle: () => void
  // The team's mark on this business was saved (or taken away).
  onMarked: (mark: CrmProspectMark | null) => void
  // A further button for this card, before the others.
  extra?: ReactNode
}) {
  const [note, setNote] = useState<string | null>(null)
  const [found, setFound] = useState<string[] | "loading" | null>(null)
  const whatsApp = whatsAppNumber(prospect.internationalPhone)

  async function mark(status: CrmProspectStatus | null) {
    try {
      onMarked(
        await crmService.markProspect({
          placeId: prospect.placeId,
          status,
          note: note ?? prospect.mark?.note ?? null,
        })
      )
    } catch {
      toast.error("تعذر حفظ الحالة.")
    }
  }

  async function findEmails() {
    if (!prospect.website) return
    setFound("loading")
    try {
      setFound(await crmService.prospectEmails(prospect.website))
    } catch {
      setFound([])
    }
  }

  return (
    <article className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {selectable && prospect.internationalPhone ? (
          <input
            type="checkbox"
            aria-label={`تحديد ${prospect.name}`}
            className="mt-1 size-4 accent-[#1d4fd8]"
            checked={checked}
            onChange={onToggle}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-foreground">
            {prospect.name}
            {prospect.closed ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                مغلق
              </span>
            ) : null}
            {prospect.mark ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  STATUS[prospect.mark.status].tint
                )}
              >
                {STATUS[prospect.mark.status].label}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
            {prospect.category ? <span>{prospect.category}</span> : null}
            {prospect.rating !== null ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                {prospect.rating.toFixed(1)}
                {prospect.ratings !== null ? ` (${prospect.ratings})` : ""}
              </span>
            ) : null}
            {prospect.email ? (
              <a
                dir="ltr"
                href={`mailto:${prospect.email}`}
                className="font-semibold text-primary hover:underline"
              >
                {prospect.email}
              </a>
            ) : null}
          </p>
          {prospect.address ? (
            <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              {prospect.address}
            </p>
          ) : null}
        </div>
        {prospect.phone ? (
          <p dir="ltr" className="text-[15px] font-bold text-foreground">
            {prospect.phone}
          </p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">لا يوجد رقم</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {extra}
        {prospect.internationalPhone ? (
          <a
            className={PROSPECT_BUTTON}
            href={`tel:${prospect.internationalPhone.replace(/\s/g, "")}`}
          >
            <Phone className="size-4" />
            اتصال
          </a>
        ) : null}
        {whatsApp ? (
          <a
            className={cn(PROSPECT_BUTTON, "border-emerald-200 text-emerald-700")}
            href={`https://wa.me/${whatsApp}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4" />
            واتساب
          </a>
        ) : null}
        {prospect.website ? (
          <a className={PROSPECT_BUTTON} href={prospect.website} target="_blank" rel="noreferrer">
            <Globe className="size-4" />
            الموقع
          </a>
        ) : null}
        {prospect.social ? (
          <a className={PROSPECT_BUTTON} href={prospect.social} target="_blank" rel="noreferrer">
            <AtSign className="size-4" />
            صفحة التواصل
          </a>
        ) : null}
        {prospect.mapsUrl ? (
          <a className={PROSPECT_BUTTON} href={prospect.mapsUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            على الخريطة
          </a>
        ) : null}
        {prospect.website && !prospect.email ? (
          <button
            type="button"
            className={PROSPECT_BUTTON}
            disabled={found === "loading"}
            onClick={() => void findEmails()}
          >
            {found === "loading" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            البحث عن البريد
          </button>
        ) : null}
      </div>

      {Array.isArray(found) ? (
        <p className="mt-2 text-[13px] text-foreground">
          {found.length === 0 ? (
            <span className="text-muted-foreground">لم نجد بريدًا منشورًا في موقعه.</span>
          ) : (
            found.map((email) => (
              <a
                key={email}
                dir="ltr"
                href={`mailto:${email}`}
                className="me-3 inline-block font-semibold text-primary hover:underline"
              >
                {email}
              </a>
            ))
          )}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <span className="text-[12.5px] font-semibold text-muted-foreground">حالة التواصل:</span>
        {(Object.keys(STATUS) as CrmProspectStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => void mark(prospect.mark?.status === status ? null : status)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition",
              prospect.mark?.status === status
                ? cn("border-transparent", STATUS[status].tint)
                : "border-border bg-white text-muted-foreground hover:text-foreground"
            )}
          >
            {STATUS[status].label}
          </button>
        ))}
        <AppInput
          className="h-8 min-w-[180px] flex-1 text-[13px]"
          maxLength={500}
          placeholder="ملاحظة (تُحفظ مع الحالة)"
          value={note ?? prospect.mark?.note ?? ""}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if (prospect.mark && note !== null) void mark(prospect.mark.status)
          }}
        />
        {prospect.mark ? (
          <span className="text-[11.5px] text-muted-foreground">
            {prospect.mark.updatedBy ? `${prospect.mark.updatedBy} · ` : ""}
            {formatRelative(prospect.mark.updatedAt)}
          </span>
        ) : null}
      </div>
    </article>
  )
}

// The bar above the results: tick everyone with a phone, name the batch, add them as leads.
export function ProspectLeadBar({
  reachable,
  chosen,
  onToggleAll,
  tag,
  onTag,
  adding,
  onAdd,
}: {
  reachable: number
  chosen: number
  onToggleAll: () => void
  tag: string
  onTag: (value: string) => void
  adding: boolean
  onAdd: () => void
}) {
  const all = reachable > 0 && chosen >= reachable
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-[#c9d8ff] bg-[#f4f7ff] p-3 shadow-sm">
      <button type="button" className={PROSPECT_BUTTON} onClick={onToggleAll}>
        {all ? "إلغاء التحديد" : `تحديد كل من لديه رقم (${reachable})`}
      </button>
      <label className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        الوسم
        <AppInput
          className="h-9 w-[240px] text-[13px]"
          maxLength={40}
          value={tag}
          onChange={(event) => onTag(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={adding || chosen === 0 || tag.trim().length === 0}
        onClick={onAdd}
        className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#1d4fd8] px-4 text-[13px] font-bold text-white transition hover:bg-[#1a44bd] disabled:opacity-50"
      >
        {adding ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        إضافة المحدد عملاء محتملين ({chosen})
      </button>
    </div>
  )
}
