"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Lock, LockOpen, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  useAccountingAccess,
  useAccountingError,
  useFormatters,
  useLoader,
} from "../hooks/use-accounting"
import { accountingService } from "../services/accounting.service"
import { AccountingPage, DateField, LoadFailed, Loading } from "./shell"
import { FIELD_LABEL, HEADING, MUTED, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles"

// Closing a period (nothing in it changes afterwards) and rebuilding the automatic entries.
export function AccountingSettingsPage() {
  const t = useTranslations("accounting.settings")
  const { date, dateTime } = useFormatters()
  const { canManage } = useAccountingAccess()
  const errorText = useAccountingError()
  const { data, failed, reload } = useLoader(() => accountingService.getSettings(), "settings")
  const [lockDay, setLockDay] = useState("")
  const [busy, setBusy] = useState<"lock" | "rebuild" | null>(null)

  useEffect(() => {
    if (data?.lockedThrough) setLockDay(data.lockedThrough)
  }, [data?.lockedThrough])

  async function setLock(day: string | null) {
    setBusy("lock")
    try {
      await accountingService.setLockedThrough(day)
      toast.success(day ? t("closed", { day: date(day) }) : t("reopened"))
      reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  async function rebuild() {
    setBusy("rebuild")
    try {
      const result = await accountingService.sync(true)
      toast.success(t("rebuilt", { count: result.created + result.updated + result.removed }))
      reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AccountingPage title={t("title")} subtitle={t("subtitle")}>
      {failed ? (
        <LoadFailed onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("flex items-center gap-2 text-[15px] font-extrabold", HEADING)}>
              <Lock className="size-4 text-[#047857]" />
              {t("closingTitle")}
            </h2>
            <p className={cn("mt-2 text-[13px] leading-6", MUTED)}>{t("closingDescription")}</p>
            <p className="mt-4 rounded-[12px] bg-[#f7f9fc] px-3.5 py-3 text-[13px] font-semibold text-[#0b1738]">
              {data.lockedThrough
                ? t("closedThrough", { day: date(data.lockedThrough) })
                : t("notClosed")}
            </p>
            {canManage ? (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <span className={FIELD_LABEL}>{t("closeThrough")}</span>
                  <DateField
                    ariaLabel={t("closeThrough")}
                    value={lockDay}
                    onChange={setLockDay}
                    clearable
                  />
                </div>
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  disabled={!lockDay || busy !== null}
                  onClick={() => setLock(lockDay)}
                >
                  <Lock className="size-4" />
                  {t("close")}
                </button>
                {data.lockedThrough ? (
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    disabled={busy !== null}
                    onClick={() => setLock(null)}
                  >
                    <LockOpen className="size-4" />
                    {t("reopen")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("flex items-center gap-2 text-[15px] font-extrabold", HEADING)}>
              <RefreshCw className="size-4 text-[#047857]" />
              {t("postingTitle")}
            </h2>
            <p className={cn("mt-2 text-[13px] leading-6", MUTED)}>{t("postingDescription")}</p>
            <p className="mt-4 rounded-[12px] bg-[#f7f9fc] px-3.5 py-3 text-[13px] font-semibold text-[#0b1738]">
              {data.lastSyncedAt
                ? t("lastPosted", { when: dateTime(data.lastSyncedAt) })
                : t("neverPosted")}
            </p>
            {canManage ? (
              <button
                type="button"
                className={cn(SECONDARY_BUTTON, "mt-4")}
                disabled={busy !== null}
                onClick={rebuild}
              >
                <RefreshCw className={cn("size-4", busy === "rebuild" && "animate-spin")} />
                {t("rebuild")}
              </button>
            ) : null}
            <p className={cn("mt-3 text-[12px] leading-5", MUTED)}>{t("rebuildNote")}</p>
          </section>
        </div>
      )}
    </AccountingPage>
  )
}
