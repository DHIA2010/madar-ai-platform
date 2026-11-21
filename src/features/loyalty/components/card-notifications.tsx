"use client"

// Notifications for a card saved to the phone's home screen: new points and the business's
// messages arrive like an app's, with no app. The customer switches them on here; a phone only
// asks "Allow?" after a tap, so it cannot be done for them. On an iPhone they exist only once
// the card is opened from its home screen icon, so until then this explains how to get there.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { publicLoyaltyService } from "../services/loyalty.service"

type State = "checking" | "hidden" | "install" | "blocked" | "off" | "on"

const isIphone = () => {
  const agent = navigator.userAgent
  // An iPad says it is a Mac, but a Mac has no touch screen.
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
}
// Opened from its home screen icon rather than inside the browser.
const openedAsApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const supported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window

async function subscriptionOf(scope: string): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(scope)
  return (await registration?.pushManager.getSubscription()) ?? null
}

async function stateNow(scope: string): Promise<State> {
  if (!supported()) return isIphone() && !openedAsApp() ? "install" : "hidden"
  if (Notification.permission === "denied") return "blocked"
  if (Notification.permission !== "granted") return "off"
  return (await subscriptionOf(scope)) ? "on" : "off"
}

// The key as the bytes a phone's push service asks for.
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, "+").replace(/_/g, String.fromCharCode(47))
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

// A worker just registered needs a moment before it can take a subscription.
const working = (registration: ServiceWorkerRegistration) =>
  new Promise<void>((resolve) => {
    if (registration.active) return resolve()
    const worker = registration.installing ?? registration.waiting
    if (!worker) return resolve()
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve()
    })
  })

const DAY_MS = 24 * 60 * 60_000

export function CardNotifications({ token }: { token: string }) {
  const t = useTranslations("loyalty.notify")
  const [state, setState] = useState<State>("checking")
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const scope = ROUTES.loyaltyServiceWorker.scope(encodeURIComponent(token))

  useEffect(() => {
    let cancelled = false
    void stateNow(scope)
      .then(async (found) => {
        if (cancelled) return
        setState(found)
        if (found !== "on") return
        // A phone's address can change quietly, so it is sent again now and then.
        const stamp = `loyalty-push-${token.slice(0, 12)}`
        let last = 0
        try {
          last = Number(window.localStorage.getItem(stamp) ?? 0)
        } catch {
          last = 0
        }
        if (Date.now() - last < DAY_MS) return
        const current = await subscriptionOf(scope)
        if (!current) return
        await publicLoyaltyService.pushOn(token, current.toJSON())
        try {
          window.localStorage.setItem(stamp, String(Date.now()))
        } catch {
          // Private browsing: it is simply sent again next time.
        }
      })
      .catch(() => {
        if (!cancelled) setState("hidden")
      })
    return () => {
      cancelled = true
    }
  }, [scope, token])

  const switchOn = async () => {
    setBusy(true)
    setFailed(false)
    try {
      // Asked first, straight from the tap: a phone ignores a question that comes later.
      const answer = await Notification.requestPermission()
      if (answer !== "granted") {
        setState(answer === "denied" ? "blocked" : "off")
        return
      }
      const registration = await navigator.serviceWorker.register(
        ROUTES.loyaltyServiceWorker.script,
        { scope }
      )
      await working(registration)
      const { publicKey } = await publicLoyaltyService.pushKey(token)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      })
      try {
        await publicLoyaltyService.pushOn(token, subscription.toJSON())
      } catch (error) {
        // Not saved on Madar's side: the phone must not think it is on.
        await subscription.unsubscribe().catch(() => undefined)
        throw error
      }
      setState("on")
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const switchOff = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const current = await subscriptionOf(scope)
      if (current) {
        await publicLoyaltyService.pushOff(token, current.endpoint).catch(() => undefined)
        await current.unsubscribe()
      }
      setState("off")
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (state === "checking" || state === "hidden") return null

  if (state === "install" || state === "blocked") {
    return (
      <section className="flex items-start gap-3 rounded-[18px] border border-[#e4e9f2] bg-white p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f1f4f9] text-[#6b7b96]">
          <BellOff className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-[#0b1738]">{t("title")}</span>
          <span className="block text-[12.5px] leading-5 text-[#6b7b96]">
            {state === "install" ? t("install") : t("blocked")}
          </span>
        </span>
      </section>
    )
  }

  return (
    <section className="rounded-[18px] border border-[#e4e9f2] bg-white p-4">
      <div className="flex items-center gap-3">
        <span
          className={
            state === "on"
              ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#067647]"
              : "flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#1d4fd8]"
          }
        >
          {state === "on" ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-[#0b1738]">
            {state === "on" ? t("onTitle") : t("title")}
          </span>
          <span className="block text-[12.5px] leading-5 text-[#6b7b96]">
            {state === "on" ? t("onHint") : t("hint")}
          </span>
        </span>
        {state === "on" ? (
          <button
            type="button"
            className="h-9 shrink-0 rounded-full border border-[#e1e7f0] px-3 text-[12.5px] font-bold text-[#0b1738] disabled:opacity-60"
            disabled={busy}
            onClick={() => void switchOff()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : t("switchOff")}
          </button>
        ) : null}
      </div>
      {state === "off" ? (
        <button
          type="button"
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0b1738] text-[14px] font-bold text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => void switchOn()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
          {t("switchOn")}
        </button>
      ) : null}
      {failed ? (
        <p className="mt-2 text-[12.5px] font-semibold text-[#b42318]">{t("failed")}</p>
      ) : null}
    </section>
  )
}
