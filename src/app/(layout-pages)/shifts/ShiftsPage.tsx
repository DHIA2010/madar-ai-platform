"use client"

// الورديات -- a cashier's session at a branch, from a counted opening float to a counted closing
// one.
//
// This is the management/history view: a manager opens or closes a shift on a cashier's behalf
// and reviews past ones across every branch. The live "وردية مفتوحة" widget on the cashier
// screen's own top bar reads the same pos_shifts records this page writes.
//
// The close dialog's shift summary (cash sales, other sales, cash returns, cash withdrawals/
// deposits, expected drawer amount) is computed from real records: pos_invoices this shift's
// cashier created in this branch since it opened, and pos_cash_movements for any manual
// withdrawal/deposit recorded from the cashier screen mid-shift -- not fabricated.

import { useEffect, useMemo, useState } from "react"
import { endOfDay, isWithinInterval, startOfDay } from "date-fns"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Lightbulb,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Wallet,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
import { useWorkspace } from "@/features/workspace"
import { useUsersQuery } from "@/features/administration/queries/use-users-query"
import { useApplicationServices } from "@/application/context"
import {
  posShiftsService,
  type Shift,
  type ShiftStatus,
} from "@/features/pos/services/pos-shifts.service"
import { ShiftCloseDialog } from "./ShiftCloseDialog"

import {
  AppDateRangeFilter,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
// A darker secondary gray than the app's usual #8098b4 -- that shade read as too faint across
// this page's table headers, subtitle, notes, and pagination text.
const MUTED = "text-[#5b6b85]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
const BLUE_TINT = "bg-[#eff6ff] text-[#2563eb]"

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

type ShiftsTranslator = ReturnType<typeof useTranslations<"shifts">>

function amountFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatAmount(value: number | null, locale: Locale): string {
  if (value === null) return "—"
  const amount = amountFormatter(locale).format(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

function dateTimeFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}
function formatDateTime(value: string | null, locale: Locale): string {
  return value ? dateTimeFormatter(locale).format(new Date(value)) : "—"
}

// "3h 20m" between two timestamps -- open shifts measure against now, closed ones against their
// own closedAt, so a shift closed yesterday does not keep counting up on screen.
function formatDuration(openedAt: string, closedAt: string | null, t: ShiftsTranslator): string {
  const end = closedAt ? new Date(closedAt).getTime() : Date.now()
  const totalMinutes = Math.max(0, Math.round((end - new Date(openedAt).getTime()) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return t("page.duration.minutesOnly", { minutes })
  return t("page.duration.hoursAndMinutes", { hours, minutes })
}

type StatusFilter = "all" | ShiftStatus

export default function ShiftsPage() {
  const t = useTranslations("shifts")
  const locale = useLocale() as Locale
  const router = useRouter()
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const { administrationApplicationService } = useApplicationServices()
  // Real madar.app users (Administration → Users) -- the same roster a cashier now signs in as,
  // rather than a fabricated employee list.
  const { data: usersData } = useUsersQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const employees = useMemo(() => usersData ?? [], [usersData])

  const workspaceName = useMemo(() => {
    const map = new Map(availableWorkspaces.map((workspace) => [workspace.id, workspace.name]))
    return (id: string) => map.get(id) ?? "—"
  }, [availableWorkspaces])

  const cashierName = useMemo(() => {
    const map = new Map(employees.map((employee) => [employee.id, employee.fullName]))
    return (id: string) => map.get(id) ?? "—"
  }, [employees])

  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setShifts(await posShiftsService.list())
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(status === 403 ? t("page.loadError.forbidden") : t("page.loadError.generic"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [search, setSearch] = useState("")
  // A short default keeps the whole panel (filters, table, pagination footer) inside one
  // viewport for a typical shift count -- 10 pushed the footer below the fold, forcing a page
  // scroll just to page through the list.
  const [pageSize, setPageSize] = useState(5)
  const [page, setPage] = useState(1)

  const filteredShifts = useMemo(() => {
    const query = search.trim()
    return shifts.filter((shift) => {
      const matchesStatus = statusFilter === "all" || shift.status === statusFilter
      const matchesWorkspace = workspaceFilter === "all" || shift.workspaceId === workspaceFilter
      const matchesQuery = !query || cashierName(shift.cashierUserId).includes(query)
      const matchesDate =
        !dateRange?.from ||
        isWithinInterval(new Date(shift.openedAt), {
          start: startOfDay(dateRange.from),
          end: endOfDay(dateRange.to ?? dateRange.from),
        })
      return matchesStatus && matchesWorkspace && matchesQuery && matchesDate
    })
  }, [shifts, statusFilter, workspaceFilter, dateRange, search, cashierName])

  const pageCount = Math.max(1, Math.ceil(filteredShifts.length / pageSize))
  const clampedPage = Math.min(page, pageCount)
  const pagedShifts = filteredShifts.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  useEffect(() => {
    setPage(1)
  }, [statusFilter, workspaceFilter, dateRange, search, pageSize])

  const openShiftsCount = useMemo(
    () => shifts.filter((shift) => shift.status === "open").length,
    [shifts]
  )

  // --- Open a new shift -------------------------------------------------------------------

  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false)
  const [openWorkspaceId, setOpenWorkspaceId] = useState("")
  const [openCashierId, setOpenCashierId] = useState("")
  const [openingCashAmount, setOpeningCashAmount] = useState("")
  const [openingNotes, setOpeningNotes] = useState("")
  const [opening, setOpening] = useState(false)
  const [showOpenErrors, setShowOpenErrors] = useState(false)

  function resetOpenForm() {
    setOpenWorkspaceId(availableWorkspaces[0]?.id ?? "")
    setOpenCashierId("")
    setOpeningCashAmount("")
    setOpeningNotes("")
    setShowOpenErrors(false)
  }

  const openErrors = {
    workspace: openWorkspaceId ? null : t("startDialog.errors.workspaceRequired"),
    cashier: openCashierId ? null : t("startDialog.errors.cashierRequired"),
    amount:
      openingCashAmount.trim() && Number(openingCashAmount) >= 0
        ? null
        : t("startDialog.errors.invalidAmount"),
  }
  const isOpenFormValid = Object.values(openErrors).every((error) => error === null)

  const submitOpenShift = async () => {
    setShowOpenErrors(true)
    if (!isOpenFormValid) return

    setOpening(true)
    try {
      await posShiftsService.open({
        workspaceId: openWorkspaceId,
        cashierUserId: openCashierId,
        openingCashAmount: Number(openingCashAmount),
        openingNotes: openingNotes.trim() || null,
      })
      toast.success(t("startDialog.toasts.success"))
      setIsOpenDialogOpen(false)
      await load()
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      const code = error instanceof AppError ? error.code : undefined
      if (code === "POS_SHIFT_ALREADY_OPEN") {
        toast.error(t("startDialog.toasts.alreadyOpen"))
      } else {
        toast.error(
          status === 403 ? t("startDialog.toasts.forbidden") : t("startDialog.toasts.genericError"),
          {
            description: status === 403 ? t("startDialog.toasts.forbiddenDescription") : undefined,
          }
        )
      }
    } finally {
      setOpening(false)
    }
  }

  // --- Close an existing shift -------------------------------------------------------------
  // The dialog itself (real cash summary, keypad, variance message) is shared with the single-
  // shift detail page -- see ShiftCloseDialog.tsx.

  const [closeTarget, setCloseTarget] = useState<Shift | null>(null)

  if (loading) {
    return (
      <div
        dir={localeDirection(locale)}
        className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}
      >
        <Loader2 className="size-4 animate-spin" />
        {t("page.loading")}
      </div>
    )
  }

  if (loadError) {
    return (
      <div
        dir={localeDirection(locale)}
        className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}
      >
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          {t("page.retry")}
        </Button>
      </div>
    )
  }

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-3">
      {/* RTL: the copy is written first so the icon tile lands on the left. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>
            {t("page.title")}
          </h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("page.subtitle")}</p>
        </div>
        <span
          className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", BLUE_TINT)}
        >
          <Clock className="size-[22px]" />
        </span>
      </div>

      {openShiftsCount > 0 ? (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-[#dcfce7] bg-[#f0fdf4] px-4 py-3 text-[12.5px] font-semibold text-[#15803d]"
          )}
        >
          <CheckCircle2 className="size-4" />
          {openShiftsCount === 1
            ? t("page.openBanner.one")
            : t("page.openBanner.many", { count: openShiftsCount })}
        </div>
      ) : null}

      <section className={cn(PANEL, "p-4")}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={cn("text-[16px] font-bold", HEADING)}>{t("page.history.title")}</h2>
            <p className={cn("mt-1 text-[11.5px]", MUTED)}>{t("page.history.subtitle")}</p>
          </div>
          <Button
            className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1d4ed8]"
            onClick={() => {
              resetOpenForm()
              setIsOpenDialogOpen(true)
            }}
          >
            <Plus className="size-4" />
            {t("page.startShiftButton")}
          </Button>
        </div>

        <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("page.searchPlaceholder")}
              className={cn(FIELD_CLASS, "ps-9")}
            />
          </div>
          <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
          <div className="sm:w-[170px]">
            <AppSelect value={workspaceFilter} onValueChange={setWorkspaceFilter}>
              <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="all">{t("page.filters.allWorkspaces")}</AppSelectItem>
                {availableWorkspaces.map((workspace) => (
                  <AppSelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
          <div className="sm:w-[150px]">
            <AppSelect
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="all">{t("page.filters.allStatuses")}</AppSelectItem>
                <AppSelectItem value="open">{t("page.statusLabel.open")}</AppSelectItem>
                <AppSelectItem value="closed">{t("page.statusLabel.closed")}</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>

        {shifts.length === 0 ? (
          <div
            className={cn(
              "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
              MUTED
            )}
          >
            {t("page.emptyNoShifts")}
          </div>
        ) : filteredShifts.length === 0 ? (
          <div
            className={cn(
              "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
              MUTED
            )}
          >
            {t("page.emptyNoMatches")}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-center">
                <thead>
                  <tr>
                    {[
                      {
                        key: "cashier",
                        label: t("page.table.columns.cashier"),
                        align: "text-right",
                      },
                      {
                        key: "workspace",
                        label: t("page.table.columns.workspace"),
                        align: "text-center",
                      },
                      {
                        key: "opening",
                        label: t("page.table.columns.opening"),
                        align: "text-center",
                      },
                      {
                        key: "closing",
                        label: t("page.table.columns.closing"),
                        align: "text-center",
                      },
                      {
                        key: "duration",
                        label: t("page.table.columns.duration"),
                        align: "text-center",
                      },
                      {
                        key: "status",
                        label: t("page.table.columns.status"),
                        align: "text-center",
                      },
                      {
                        key: "actions",
                        label: t("page.table.columns.actions"),
                        align: "text-center",
                      },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "border-b border-[#eef2f8] bg-[#f4f7fc] px-3 py-3 text-[11px] font-semibold",
                          MUTED,
                          column.align
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedShifts.map((shift, index) => (
                    <tr
                      key={shift.id}
                      onClick={() => router.push(ROUTES.shiftsDetails(shift.id))}
                      className={cn(
                        "cursor-pointer border-b border-[#f4f7fb] last:border-b-0 hover:bg-[#f7faff]",
                        index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                      )}
                    >
                      <td className={cn("px-3 py-2.5 text-right text-[12.5px] font-bold", HEADING)}>
                        {cashierName(shift.cashierUserId)}
                        <p className={cn("mt-0.5 text-[11px] font-normal", MUTED)}>
                          {t("page.table.openedAt", {
                            time: formatDateTime(shift.openedAt, locale),
                          })}
                        </p>
                      </td>
                      <td className={cn("px-3 py-2.5 text-[12px] font-semibold", HEADING)}>
                        {workspaceName(shift.workspaceId)}
                      </td>
                      <td className={cn("px-3 py-2.5 text-[12px] font-semibold", HEADING)}>
                        {formatAmount(shift.openingCashAmount, locale)}
                      </td>
                      <td className={cn("px-3 py-2.5 text-[12px] font-semibold", HEADING)}>
                        {formatAmount(shift.closingCashAmount, locale)}
                      </td>
                      <td className={cn("px-3 py-2.5 text-[12px] font-semibold", HEADING)}>
                        {formatDuration(shift.openedAt, shift.closedAt, t)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            shift.status === "open"
                              ? "bg-[#f0fdf4] text-[#15803d]"
                              : "bg-[#f2f5fa] text-[#5b6b85]"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              shift.status === "open" ? "bg-[#22c55e]" : "bg-[#8098b4]"
                            )}
                          />
                          {t(`page.statusLabel.${shift.status}`)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            className="h-8 gap-1 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
                            onClick={() => router.push(ROUTES.shiftsDetails(shift.id))}
                          >
                            <Eye className="size-3.5" />
                            {t("page.table.viewAction")}
                          </Button>
                          {shift.status === "open" ? (
                            <Button
                              variant="outline"
                              className="h-8 rounded-[8px] border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
                              onClick={() => setCloseTarget(shift)}
                            >
                              {t("page.table.closeAction")}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f8] pt-2">
              <div className="flex items-center gap-2.5">
                <div className="w-[76px]">
                  <AppSelect
                    value={String(pageSize)}
                    onValueChange={(value) => setPageSize(Number(value))}
                  >
                    <AppSelectTrigger className="h-9 w-full rounded-[8px] border-[#e8edf3] text-[12px]">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <AppSelectItem key={size} value={String(size)}>
                          {size}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
                <span className={cn("text-[12px]", MUTED)}>
                  {t("page.pagination.showing", {
                    from: (clampedPage - 1) * pageSize + 1,
                    to: Math.min(clampedPage * pageSize, filteredShifts.length),
                    total: filteredShifts.length,
                  })}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label={t("page.pagination.previousAriaLabel")}
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5 rtl:rotate-180" />
                </button>
                <span className="flex size-7 items-center justify-center rounded-[7px] bg-[#2563eb] text-[12.5px] font-bold text-white">
                  {clampedPage}
                </span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  aria-label={t("page.pagination.nextAriaLabel")}
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Open shift dialog */}
      <Dialog
        open={isOpenDialogOpen}
        onOpenChange={(open) => {
          if (!opening) setIsOpenDialogOpen(open)
        }}
      >
        <DialogContent
          className={cn(
            "sm:max-w-[26rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
        >
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              {t("startDialog.title")}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              {t("startDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("startDialog.workspaceLabel")} <span className="text-[#e0484d]">*</span>
              </Label>
              <AppSelect value={openWorkspaceId} onValueChange={setOpenWorkspaceId}>
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder={t("startDialog.workspacePlaceholder")} />
                </AppSelectTrigger>
                <AppSelectContent>
                  {availableWorkspaces.map((workspace) => (
                    <AppSelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
              {showOpenErrors && openErrors.workspace ? (
                <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{openErrors.workspace}</p>
              ) : null}
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("startDialog.cashierLabel")} <span className="text-[#e0484d]">*</span>
              </Label>
              <AppSelect value={openCashierId} onValueChange={setOpenCashierId}>
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder={t("startDialog.cashierPlaceholder")} />
                </AppSelectTrigger>
                <AppSelectContent>
                  {employees.map((employee) => (
                    <AppSelectItem key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
              {showOpenErrors && openErrors.cashier ? (
                <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{openErrors.cashier}</p>
              ) : null}
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("startDialog.openingAmountLabel")} <span className="text-[#e0484d]">*</span>
              </Label>
              <div className="relative">
                <Wallet className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={openingCashAmount}
                  onChange={(event) => setOpeningCashAmount(event.target.value)}
                  placeholder="0.00"
                  className={cn(FIELD_CLASS, "ps-9")}
                />
              </div>
              {showOpenErrors && openErrors.amount ? (
                <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{openErrors.amount}</p>
              ) : null}
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("startDialog.notesLabel")}
              </Label>
              <Input
                value={openingNotes}
                onChange={(event) => setOpeningNotes(event.target.value)}
                placeholder={t("startDialog.notesPlaceholder")}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={opening}
              onClick={() => void submitOpenShift()}
            >
              {opening ? t("startDialog.opening") : t("startDialog.submit")}
              {opening ? <Loader2 className="size-4 animate-spin" /> : null}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
              disabled={opening}
              onClick={() => setIsOpenDialogOpen(false)}
            >
              {t("startDialog.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShiftCloseDialog
        shift={closeTarget}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        onClosed={() => {
          setCloseTarget(null)
          void load()
        }}
      />

      <section className={cn(PANEL, "flex items-start gap-3 p-3")}>
        <Lightbulb className="mt-0.5 size-[18px] shrink-0 text-[#e08b00]" />
        <p className={cn("text-[12px] leading-6", MUTED)}>{t("page.tip")}</p>
      </section>
    </div>
  )
}
