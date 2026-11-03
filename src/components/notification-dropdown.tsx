"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type { LucideIcon } from "lucide-react"
import {
  BadgeCheck,
  Bell,
  BellOff,
  CalendarClock,
  CalendarX,
  CheckCheck,
  CreditCard,
  PackageMinus,
  PackageX,
  ShoppingBag,
  Unplug,
  XCircle,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"

import {
  type AppNotification,
  type NotificationType,
  notificationService,
} from "@/features/notifications"

// How often the bell checks for new notifications while the page is open.
const REFRESH_MS = 60_000

const TYPE_STYLE: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  stock_low: { icon: PackageMinus, tone: "bg-amber-50 text-amber-600" },
  stock_out: { icon: PackageX, tone: "bg-rose-50 text-rose-600" },
  order_new: { icon: ShoppingBag, tone: "bg-blue-50 text-blue-600" },
  orders_new_batch: { icon: ShoppingBag, tone: "bg-blue-50 text-blue-600" },
  sync_failed: { icon: Unplug, tone: "bg-rose-50 text-rose-600" },
  subscription_ending: { icon: CalendarClock, tone: "bg-amber-50 text-amber-600" },
  subscription_expired: { icon: CalendarX, tone: "bg-rose-50 text-rose-600" },
  payment_succeeded: { icon: CreditCard, tone: "bg-emerald-50 text-emerald-600" },
  payment_failed: { icon: CreditCard, tone: "bg-rose-50 text-rose-600" },
  activation_approved: { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-600" },
  activation_rejected: { icon: XCircle, tone: "bg-rose-50 text-rose-600" },
}

// "قبل ٥ دقائق" / "5 minutes ago", in the reader's language.
function timeAgo(iso: string, locale: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "auto" })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(0, "minute")
}

function formatNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number)
    ? // Latin digits in both languages, like the rest of Madar.
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number)
    : String(value ?? "")
}

export function NotificationDropdown() {
  const t = useTranslations("shared.notificationDropdown")
  const locale = useLocale()
  const router = useRouter()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await notificationService.list()
      setItems(result.items)
      setUnreadCount(result.unreadCount)
    } catch {
      // Signed out, or the backend is unreachable: the bell just stays as it was.
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  // A store, platform or app named by its key, in the reader's language.
  const label = (group: "platforms" | "applications", key: unknown) => {
    const value = String(key ?? "")
    return t.has(`labels.${group}.${value}`) ? t(`labels.${group}.${value}`) : value
  }

  function text(item: AppNotification) {
    const p = item.params
    const values = {
      productName: String(p.productName ?? ""),
      quantity: formatNumber(p.quantity),
      minStock: formatNumber(p.minStock),
      branchName: String(p.branchName ?? ""),
      platform: label("platforms", p.platform ?? p.provider),
      orderNumber: String(p.orderNumber ?? ""),
      customerName: String(p.customerName ?? ""),
      amount: formatNumber(p.amount),
      currency: String(p.currency ?? "SAR"),
      count: Number(p.count ?? 0),
      application: label("applications", p.application),
      date: p.endsAt
        ? new Date(String(p.endsAt)).toLocaleDateString(
            locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB"
          )
        : "",
      reason: String(p.reason ?? ""),
    }
    const variant =
      item.type === "subscription_ending" && p.kind === "trial"
        ? "subscription_ending_trial"
        : item.type === "activation_rejected" && !p.reason
          ? "activation_rejected_no_reason"
          : item.type
    return {
      title: t(`types.${variant}.title`, values),
      description: t(`types.${variant}.description`, values),
    }
  }

  async function open(item: AppNotification) {
    if (!item.read) {
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry))
      )
      setUnreadCount((count) => Math.max(0, count - 1))
      void notificationService.markRead([item.id]).catch(() => undefined)
    }
    if (item.link) router.push(item.link)
  }

  async function markAllRead() {
    setItems((current) => current.map((entry) => ({ ...entry, read: true })))
    setUnreadCount(0)
    await notificationService.markAllRead().catch(() => void refresh())
  }

  return (
    <DropdownMenu
      dir={locale === "ar" ? "rtl" : "ltr"}
      onOpenChange={(isOpen) => isOpen && void refresh()}
    >
      <DropdownMenuTrigger asChild>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            aria-label={t("title")}
          >
            <Bell className="size-5" />
          </Button>

          {unreadCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[22rem] overflow-hidden rounded-xl p-0 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{t("title")}</span>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-semibold text-[#2878ff]">
                {t("unreadCount", { count: unreadCount })}
              </span>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2878ff] hover:underline"
            >
              <CheckCheck className="size-3.5" />
              {t("markAllRead")}
            </button>
          ) : null}
        </div>

        {loaded && items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BellOff className="size-5" />
            </span>
            <p className="text-sm font-semibold">{t("emptyTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("emptyDescription")}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[26rem]">
            <div className="flex flex-col">
              {items.map((item) => {
                const { icon: Icon, tone } = TYPE_STYLE[item.type] ?? {
                  icon: Bell,
                  tone: "bg-muted text-muted-foreground",
                }
                const { title, description } = text(item)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void open(item)}
                    className={cn(
                      "flex w-full gap-3 border-b px-4 py-3 text-start transition-colors last:border-b-0",
                      item.read ? "hover:bg-muted/50" : "bg-[#f5f8ff] hover:bg-[#eef4ff]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                        tone
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[13px] leading-5 font-semibold">{title}</span>
                        {item.read ? null : (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#2878ff]" />
                        )}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">{description}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {timeAgo(item.createdAt, locale)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
