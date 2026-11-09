"use client"

// واتساب -- how the store's invoices and messages reach its customers (backend:
// whatsapp/merchant-connection.ts). Two ways, side by side:
// - WhatsApp Web: Madar opens the customer's chat in the merchant's own WhatsApp with the message
//   ready, and the merchant presses send. Nothing to set up.
// - Their business number: connected once through Meta's Embedded Signup, after which Madar sends
//   automatically from it. The page walks through what to prepare and what Meta's window asks.

import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Lightbulb,
  Loader2,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  Unplug,
  UserRound,
  Zap,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import {
  whatsAppConnectionService,
  type WhatsAppConnectionOverview,
  type WhatsAppSendMode,
} from "@/features/settings/services/whatsapp-connection.service"
import { runEmbeddedSignup } from "@/features/settings/services/whatsapp-embedded-signup"

import { Button } from "@/components/ui/button"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const WHATSAPP_MANAGER_URL = "https://business.facebook.com/wa/manage/home/"

const BEFORE_ICONS = [UserRound, Smartphone, BadgeCheck, CreditCard]

type SignupPhase = "idle" | "opening" | "finishing"

export default function WhatsAppSettings() {
  const t = useTranslations("settings.whatsapp")
  const locale = useLocale() as Locale

  const [overview, setOverview] = useState<WhatsAppConnectionOverview | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // Which way the page is showing -- starts on the one in use, the merchant can look at the other.
  const [view, setView] = useState<WhatsAppSendMode>("web")
  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState<SignupPhase>("idle")

  const load = useCallback(async () => {
    setLoadFailed(false)
    try {
      const loaded = await whatsAppConnectionService.get()
      setOverview(loaded)
      setView(loaded.sendMode)
    } catch {
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const failMessage = (error: unknown, fallback: string) =>
    error instanceof AppError && error.status === 403 ? t("toasts.forbidden") : fallback

  const setMode = async (sendMode: WhatsAppSendMode) => {
    setSaving(true)
    try {
      setOverview(await whatsAppConnectionService.setMode(sendMode))
      setView(sendMode)
      toast.success(sendMode === "web" ? t("toasts.modeWeb") : t("toasts.modeBusiness"))
    } catch (error) {
      toast.error(failMessage(error, t("toasts.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  const connect = async () => {
    if (!overview?.embeddedSignup) return
    setPhase("opening")
    try {
      const result = await runEmbeddedSignup(overview.embeddedSignup)
      if (result.kind === "cancelled") {
        toast.message(t("toasts.cancelled"))
        return
      }
      if (result.kind === "error") {
        toast.error(result.message ?? t("toasts.failed"))
        return
      }
      setPhase("finishing")
      const connected = await whatsAppConnectionService.completeSignup(result)
      setOverview(connected)
      setView("business")
      if (connected.connection?.lastError) {
        toast.warning(t("toasts.connectedWithIssues"))
      } else {
        toast.success(
          t("toasts.connected", {
            number: connected.connection?.displayPhoneNumber ?? "",
          })
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "FACEBOOK_SDK_UNAVAILABLE"
          ? t("toasts.sdkFailed")
          : failMessage(error, error instanceof AppError ? error.message : t("toasts.failed"))
      )
    } finally {
      setPhase("idle")
    }
  }

  const disconnect = async () => {
    if (!window.confirm(t("connected.disconnectConfirm"))) return
    setSaving(true)
    try {
      setOverview(await whatsAppConnectionService.disconnect())
      setView("web")
      toast.success(t("toasts.disconnected"))
    } catch (error) {
      toast.error(failMessage(error, t("toasts.saveFailed")))
    } finally {
      setSaving(false)
    }
  }

  if (loadFailed) {
    return (
      <div className={cn(PANEL, "p-10 text-center text-[13px]", MUTED)}>
        <p>{t("loadError")}</p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>
          {t("retry")}
        </Button>
      </div>
    )
  }
  if (!overview) {
    return (
      <div className="flex justify-center p-16 text-[#98A2B3]">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  const connected = overview.connection?.status === "connected" ? overview.connection : null

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5">
      <div className="flex items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[#e7f8ee] text-[#1a9e55]">
          <MessageCircle className="size-6" />
        </span>
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ModeCard
          mode="web"
          icon={<MonitorSmartphone className="size-5" />}
          tone="green"
          active={overview.sendMode === "web"}
          selected={view === "web"}
          onSelect={() => setView("web")}
        />
        <ModeCard
          mode="business"
          icon={<Zap className="size-5" />}
          tone="blue"
          active={overview.sendMode === "business"}
          selected={view === "business"}
          onSelect={() => setView("business")}
        />
      </div>

      {view === "web" ? (
        <WebGuide
          canSwitch={overview.sendMode !== "web"}
          saving={saving}
          onUse={() => void setMode("web")}
        />
      ) : connected ? (
        <ConnectedPanel
          connection={connected}
          automatic={overview.sendMode === "business"}
          saving={saving}
          locale={locale}
          onUseAuto={() => void setMode("business")}
          onDisconnect={() => void disconnect()}
        />
      ) : (
        <BusinessGuide
          available={Boolean(overview.embeddedSignup)}
          previousNumber={
            overview.connection?.status === "disconnected"
              ? overview.connection.displayPhoneNumber
              : null
          }
          phase={phase}
          onConnect={() => void connect()}
        />
      )}
    </div>
  )
}

function ModeCard({
  mode,
  icon,
  tone,
  active,
  selected,
  onSelect,
}: {
  mode: WhatsAppSendMode
  icon: ReactNode
  tone: "green" | "blue"
  active: boolean
  selected: boolean
  onSelect: () => void
}) {
  const t = useTranslations("settings.whatsapp")
  const points = t.raw(`modes.${mode}.points`) as string[]
  const palette =
    tone === "green"
      ? {
          tile: "bg-[#e7f8ee] text-[#1a9e55]",
          ring: "border-[#1a9e55] ring-[#1a9e55]/15",
          check: "text-[#1a9e55]",
          badge: "bg-[#e7f8ee] text-[#137a41]",
        }
      : {
          tile: "bg-[#eaf1ff] text-[#2563eb]",
          ring: "border-[#2563eb] ring-[#2563eb]/15",
          check: "text-[#2563eb]",
          badge: "bg-[#eaf1ff] text-[#1d4ed8]",
        }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        PANEL,
        "group relative flex flex-col gap-4 p-5 text-start transition-all",
        selected ? cn("ring-4", palette.ring) : "hover:border-[#cfd6e2] hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn("flex size-11 items-center justify-center rounded-[12px]", palette.tile)}
        >
          {icon}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#0b1738] px-2.5 py-1 text-[11px] font-bold text-white">
              <CheckCircle2 className="size-3" />
              {t("current")}
            </span>
          ) : null}
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", palette.badge)}>
            {t(`modes.${mode}.badge`)}
          </span>
        </div>
      </div>
      <div>
        <h2 className={cn("text-[17px] font-extrabold", HEADING)}>{t(`modes.${mode}.name`)}</h2>
        <p className={cn("mt-1 text-[12.5px]", MUTED)}>{t(`modes.${mode}.tagline`)}</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[12.5px] leading-5 text-[#344054]">
            <Check className={cn("mt-0.5 size-4 shrink-0", palette.check)} />
            {point}
          </li>
        ))}
      </ul>
    </button>
  )
}

function StepNumber({ index, tone }: { index: number; tone: "green" | "blue" }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold",
        tone === "green" ? "bg-[#1a9e55] text-white" : "bg-[#2563eb] text-white"
      )}
    >
      {index + 1}
    </span>
  )
}

function WebGuide({
  canSwitch,
  saving,
  onUse,
}: {
  canSwitch: boolean
  saving: boolean
  onUse: () => void
}) {
  const t = useTranslations("settings.whatsapp.web")
  const steps = t.raw("steps") as string[]
  return (
    <section className={cn(PANEL, "flex flex-col gap-5 p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={cn("text-[15px] font-bold", HEADING)}>{t("howTitle")}</h3>
        {canSwitch ? (
          <Button
            disabled={saving}
            onClick={onUse}
            className="h-auto gap-2 rounded-[10px] bg-[#1a9e55] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#158546]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("use")}
          </Button>
        ) : null}
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-3 rounded-[14px] border border-[#eef1f5] bg-[#fafbfc] p-4"
          >
            <StepNumber index={index} tone="green" />
            <p className="pt-1 text-[12.5px] leading-6 text-[#344054]">{step}</p>
          </li>
        ))}
      </ol>
      <div className="flex items-start gap-3 rounded-[14px] bg-[#fff8e6] p-4">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#d48a00]" />
        <p className="text-[12.5px] leading-6 text-[#6b4e00]">
          <span className="font-bold">{t("tipTitle")}: </span>
          {t("tip")}
        </p>
      </div>
    </section>
  )
}

function BusinessGuide({
  available,
  previousNumber,
  phase,
  onConnect,
}: {
  available: boolean
  previousNumber: string | null
  phase: SignupPhase
  onConnect: () => void
}) {
  const t = useTranslations("settings.whatsapp.business")
  const tConnected = useTranslations("settings.whatsapp.connected")
  const before = t.raw("before") as Array<{ title: string; body: string }>
  const steps = t.raw("steps") as string[]
  const after = t.raw("after") as string[]
  const busy = phase !== "idle"

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <section className={cn(PANEL, "flex flex-col gap-4 p-6")}>
        <h3 className={cn("text-[15px] font-bold", HEADING)}>{t("beforeTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {before.map((item, index) => {
            const Icon = BEFORE_ICONS[index] ?? Check
            return (
              <div
                key={item.title}
                className="flex flex-col gap-2.5 rounded-[14px] border border-[#eef1f5] bg-[#fafbfc] p-4"
              >
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-white text-[#2563eb] shadow-[0_1px_3px_rgba(16,42,92,0.08)]">
                  <Icon className="size-[18px]" />
                </span>
                <p className={cn("text-[13.5px] font-bold", HEADING)}>{item.title}</p>
                <p className={cn("text-[12px] leading-6", MUTED)}>{item.body}</p>
              </div>
            )
          })}
        </div>
        <p className={cn("flex items-center gap-2 text-[12.5px]", MUTED)}>
          <Clock className="size-4 text-[#2563eb]" />
          {t("duration")}
        </p>

        <div className="mt-2 border-t border-[#eef1f5] pt-5">
          <h3 className={cn("mb-3 text-[15px] font-bold", HEADING)}>{t("afterTitle")}</h3>
          <ul className="flex flex-col gap-2.5">
            {after.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-[12.5px] leading-6 text-[#344054]"
              >
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-[#1a9e55]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className={cn(PANEL, "flex h-fit flex-col gap-5 p-6 xl:sticky xl:top-4")}>
        <h3 className={cn("text-[15px] font-bold", HEADING)}>{t("stepsTitle")}</h3>
        <ol className="relative flex flex-col gap-4">
          <span
            aria-hidden
            className="absolute bottom-4 top-4 w-px bg-[#dbe5f5] ltr:left-4 rtl:right-4"
          />
          {steps.map((step, index) => (
            <li key={step} className="relative flex items-center gap-3">
              <StepNumber index={index} tone="blue" />
              <p className="text-[12.5px] leading-6 text-[#344054]">{step}</p>
            </li>
          ))}
        </ol>

        {previousNumber ? (
          <p className="rounded-[12px] bg-[#f2f5fa] p-3 text-[12px] leading-6 text-[#475467]">
            {tConnected("previous", { number: previousNumber })}
          </p>
        ) : null}

        {/* Always shown, so the way to connect is never a mystery -- disabled, with the reason
            under it, until Madar's Meta app is ready for merchants. */}
        <Button
          onClick={onConnect}
          disabled={busy || !available}
          className="h-12 gap-2 rounded-[12px] bg-[#1877F2] text-[14px] font-bold text-white hover:bg-[#1465d6] disabled:bg-[#1877F2]/45 disabled:opacity-100"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FacebookMark />}
          {phase === "opening"
            ? t("opening")
            : phase === "finishing"
              ? t("finishing")
              : t("connect")}
        </Button>
        {!available ? (
          <div className="-mt-2 flex items-start gap-3 rounded-[14px] border border-[#fde7c2] bg-[#fffaf0] p-4">
            <Clock className="mt-0.5 size-4 shrink-0 text-[#d48a00]" />
            <div>
              <p className="text-[13px] font-bold text-[#6b4e00]">{t("unavailableTitle")}</p>
              <p className="mt-1 text-[12px] leading-6 text-[#7a5a00]">{t("unavailableBody")}</p>
            </div>
          </div>
        ) : null}

        <p className={cn("flex items-start gap-2 text-[11.5px] leading-5", MUTED)}>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#1a9e55]" />
          {t("secure")}
        </p>
      </aside>
    </div>
  )
}

function ConnectedPanel({
  connection,
  automatic,
  saving,
  locale,
  onUseAuto,
  onDisconnect,
}: {
  connection: NonNullable<WhatsAppConnectionOverview["connection"]>
  automatic: boolean
  saving: boolean
  locale: Locale
  onUseAuto: () => void
  onDisconnect: () => void
}) {
  const t = useTranslations("settings.whatsapp.connected")
  const quality = (connection.qualityRating ?? "UNKNOWN").toUpperCase()
  const qualityKey = ["GREEN", "YELLOW", "RED"].includes(quality) ? quality : "UNKNOWN"
  const qualityTone: Record<string, string> = {
    GREEN: "bg-[#e7f8ee] text-[#137a41]",
    YELLOW: "bg-[#fff4db] text-[#946200]",
    RED: "bg-[#fdeeee] text-[#c4262e]",
    UNKNOWN: "bg-[#f2f5fa] text-[#5b6b85]",
  }
  const since = connection.connectedAt
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
        dateStyle: "medium",
      }).format(new Date(connection.connectedAt))
    : null

  return (
    <section className={cn(PANEL, "flex flex-col gap-5 p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex size-14 items-center justify-center rounded-[16px] bg-[#e7f8ee] text-[#1a9e55]">
            <BadgeCheck className="size-7" />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-[#1a9e55]">{t("title")}</p>
            <p dir="ltr" className={cn("mt-0.5 text-[20px] font-extrabold tracking-wide", HEADING)}>
              {connection.displayPhoneNumber ?? "—"}
            </p>
            {connection.verifiedName ? (
              <p className={cn("text-[13px] font-semibold", MUTED)}>{connection.verifiedName}</p>
            ) : null}
            {since ? (
              <p className="mt-1 text-[11.5px] text-[#98A2B3]">{t("since", { date: since })}</p>
            ) : null}
          </div>
        </div>
        <span
          className={cn("rounded-full px-3 py-1 text-[12px] font-bold", qualityTone[qualityKey])}
        >
          {t("quality")}: {t(`qualityValues.${qualityKey}`)}
        </span>
      </div>

      {connection.lastError ? (
        <div className="flex items-start gap-3 rounded-[14px] border border-[#f7d4a8] bg-[#fff8ef] p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#d97706]" />
          <div>
            <p className="text-[13px] font-bold text-[#92400e]">{t("attention")}</p>
            <p
              dir="ltr"
              className="mt-1 break-words text-start text-[12px] leading-5 text-[#9a3412]"
            >
              {connection.lastError}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-[14px] p-4",
          automatic ? "bg-[#f0f9f4]" : "bg-[#f5f7fa]"
        )}
      >
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#344054]">
          {automatic ? (
            <Zap className="size-4 text-[#1a9e55]" />
          ) : (
            <MonitorSmartphone className="size-4 text-[#667085]" />
          )}
          {automatic ? t("autoOn") : t("autoOff")}
        </p>
        {!automatic ? (
          <Button
            disabled={saving}
            onClick={onUseAuto}
            className="h-auto gap-2 rounded-[10px] bg-[#2563eb] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#1d4ed8]"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            {t("useAuto")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] pt-4">
        <a
          href={WHATSAPP_MANAGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#2563eb] hover:underline"
        >
          <ExternalLink className="size-3.5" />
          {t("manage")}
        </a>
        <Button
          variant="outline"
          disabled={saving}
          onClick={onDisconnect}
          className="h-auto gap-2 rounded-[10px] border-[#f7c9ca] px-4 py-2 text-[12.5px] font-semibold text-[#d92d20] hover:bg-[#fdeeee] hover:text-[#b42318]"
        >
          <Unplug className="size-4" />
          {t("disconnect")}
        </Button>
      </div>
    </section>
  )
}

// Meta's "f" -- the connect button opens Meta's own window, so it carries Facebook's mark.
function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  )
}
