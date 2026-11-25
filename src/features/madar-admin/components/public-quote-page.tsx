"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Printer } from "lucide-react"

import { AppButton } from "@/components/app"

import type { PublicCrmQuote } from "../types/crm.types"
import { printSalesDocument, SalesDocument } from "./sales-document"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

const SEPARATOR = String.fromCharCode(47)
const quotePath = (token: string) =>
  ["", "v1", "public", "crm-quotes", encodeURIComponent(token)].join(SEPARATOR)

// The page a customer opens from the link a quote from Madar's sales team was sent with (on
// WhatsApp): the quote as printed, and printing or saving it as a PDF.
export function PublicQuotePage() {
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const documentRef = useRef<HTMLDivElement>(null)
  const [quote, setQuote] = useState<PublicCrmQuote | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading")

  useEffect(() => {
    if (!token) return
    let active = true
    fetch(new URL(quotePath(token), getClientEnvironment().API_BASE_URL))
      .then(async (response) => {
        if (!active) return
        if (!response.ok) {
          setState("missing")
          return
        }
        setQuote((await response.json()) as PublicCrmQuote)
        setState("ready")
      })
      .catch(() => {
        if (active) setState("failed")
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <div lang="ar" dir="rtl" className="min-h-screen bg-[#f5f8fd] px-4 py-8">
      <main className="mx-auto w-full max-w-[860px]">
        {!token || state === "missing" ? (
          <p className="rounded-2xl bg-white py-16 text-center text-lg font-bold text-[#0b1738] shadow-sm">
            رابط عرض السعر غير صالح أو انتهى.
          </p>
        ) : state === "failed" ? (
          <p className="rounded-2xl bg-white py-16 text-center text-lg font-bold text-[#0b1738] shadow-sm">
            تعذر تحميل عرض السعر، حاول مرة أخرى.
          </p>
        ) : !quote ? (
          <div className="flex justify-center py-24 text-slate-400">
            <Loader2 className="size-7 animate-spin" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-end">
              <AppButton
                variant="outline"
                icon={<Printer className="size-4" />}
                className="h-10 rounded-[10px] bg-white"
                onClick={() => {
                  if (!printSalesDocument(documentRef.current, quote.number)) window.print()
                }}
              >
                طباعة / PDF
              </AppButton>
            </div>
            <SalesDocument
              ref={documentRef}
              kind="quote"
              number={quote.number}
              issuedAt={quote.issuedAt}
              dateLabel={quote.validUntil}
              seller={quote.seller}
              customer={quote.customer}
              items={quote.items}
              totals={quote.totals}
              notes={quote.notes}
              terms={quote.terms}
            />
          </>
        )}
      </main>
    </div>
  )
}
