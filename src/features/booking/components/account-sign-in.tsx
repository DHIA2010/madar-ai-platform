"use client"

// Signing in to the customer's account by phone: the number, then the code that arrives on
// WhatsApp. Done, the browser keeps the proved account's secret like any other.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"

import { accountMemory } from "../services/account-memory"
import { publicBookingService } from "../services/booking.service"

const FIELD =
  "h-12 w-full rounded-[12px] border border-[#d5dbe7] bg-white px-4 text-center text-[17px] font-bold tracking-wide outline-none focus:border-[var(--bk-accent)]"
const BUTTON =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--bk-accent)] px-5 text-[15px] font-bold text-white disabled:opacity-50"
// How long before another code can be asked for.
const RESEND_SECONDS = 60

const ERRORS: Record<string, string> = {
  BOOKING_PHONE_INVALID: "errors.phone",
  BOOKING_CODE_WRONG: "errors.code",
  BOOKING_CODE_WAIT: "errors.wait",
  BOOKING_RATE_LIMITED: "errors.wait",
  BOOKING_SIGN_IN_UNAVAILABLE: "errors.unavailable",
}

export function AccountSignIn({
  slug,
  phone: knownPhone,
  onSignedIn,
}: {
  slug: string
  // The number this browser's account already has, to save typing it.
  phone?: string | null
  onSignedIn: () => void
}) {
  const t = useTranslations("booking.account.signIn")
  const [phone, setPhone] = useState(knownPhone ?? "")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((left) => left - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const fail = (caught: unknown) =>
    setError(t(ERRORS[(caught as { code?: string }).code ?? ""] ?? "errors.other"))

  const sendCode = async () => {
    if (busy || phone.trim().length < 8) return
    setBusy(true)
    setError(null)
    try {
      await publicBookingService.startSignIn(slug, phone.trim())
      setStep("code")
      setCode("")
      setWait(RESEND_SECONDS)
    } catch (caught) {
      fail(caught)
    } finally {
      setBusy(false)
    }
  }

  const enter = async () => {
    if (busy || code.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      const result = await publicBookingService.finishSignIn(slug, {
        phone: phone.trim(),
        code,
        accountToken: accountMemory.read(slug),
      })
      accountMemory.keep(slug, result.accountToken)
      onSignedIn()
    } catch (caught) {
      fail(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="mx-auto w-full max-w-[360px] space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void (step === "phone" ? sendCode() : enter())
      }}
    >
      {step === "phone" ? (
        <>
          <label className="block text-[13.5px] font-bold text-[#344054]" htmlFor="sign-in-phone">
            {t("phoneLabel")}
          </label>
          <input
            id="sign-in-phone"
            dir="ltr"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="05XXXXXXXX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={FIELD}
          />
          <button type="submit" disabled={busy || phone.trim().length < 8} className={BUTTON}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4.5" />
            )}
            {t("send")}
          </button>
        </>
      ) : (
        <>
          <p className="text-[13.5px] leading-7 text-[#52607a]">
            {t("codeHint")}{" "}
            <span dir="ltr" className="font-bold text-[#0b1738]">
              {phone.trim()}
            </span>
          </p>
          <input
            dir="ltr"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="······"
            aria-label={t("codeLabel")}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className={cn(FIELD, "text-[22px] tracking-[0.4em]")}
          />
          <button type="submit" disabled={busy || code.length !== 6} className={BUTTON}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("enter")}
          </button>
          <div className="flex items-center justify-between text-[13px] font-bold">
            <button
              type="button"
              className="text-[#52607a] underline-offset-4 hover:underline"
              onClick={() => {
                setStep("phone")
                setError(null)
              }}
            >
              {t("changePhone")}
            </button>
            <button
              type="button"
              disabled={wait > 0 || busy}
              className="text-[var(--bk-accent)] underline-offset-4 hover:underline disabled:text-[#98a2b3] disabled:no-underline"
              onClick={() => void sendCode()}
            >
              {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
            </button>
          </div>
        </>
      )}
      {error ? (
        <p className="rounded-[10px] bg-[#fef3f2] px-3 py-2 text-[13px] font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}
    </form>
  )
}
