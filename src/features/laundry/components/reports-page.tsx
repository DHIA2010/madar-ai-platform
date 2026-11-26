"use client"

import { useEffect, useState } from "react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"

import { AppDateRangeFilter } from "@/components/app"

import { type LaundryReport, laundryService } from "../services/laundry.service"
import { HEADING, LaundryPage, Loading, MUTED, PANEL, useTx } from "./shell"

function defaultRange(): DateRange {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from, to }
}

// A list of names with a bar for how many pieces each had, longest first.
function Bars({
  title,
  rows,
  emptyText,
  unit,
}: {
  title: string
  rows: Array<{ name: string; pieces: number }>
  emptyText: string
  unit: string
}) {
  const top = rows[0]?.pieces ?? 0
  return (
    <section className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>{title}</h3>
      {rows.length === 0 ? (
        <p className={cn("text-[12.5px]", MUTED)}>{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <div key={row.name}>
              <div className="mb-1 flex justify-between text-[12.5px]">
                <span className={HEADING}>{row.name}</span>
                <span className={MUTED}>
                  {row.pieces} {unit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#f1f4f9]">
                <div
                  className="h-1.5 rounded-full bg-[#2563eb]"
                  style={{ width: `${top ? Math.max(4, (row.pieces / top) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function LaundryReportsPage() {
  const { tx, money } = useTx()
  const [range, setRange] = useState<DateRange | undefined>(defaultRange)
  const [report, setReport] = useState<LaundryReport | null>(null)

  useEffect(() => {
    if (!range?.from) return
    const to = new Date(range.to ?? range.from)
    to.setHours(23, 59, 59, 999)
    void laundryService
      .report({ from: range.from.toISOString(), to: to.toISOString() })
      .then(setReport)
  }, [range])

  return (
    <LaundryPage
      title={tx("تقارير المغسلة", "Laundry reports")}
      actions={<AppDateRangeFilter value={range} onChange={setRange} />}
    >
      {!report ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [tx("الطلبات", "Orders"), String(report.orders)],
              [tx("القطع", "Pieces"), String(report.pieces)],
              [tx("قيمة الطلبات", "Order value"), money(report.revenue)],
              [tx("لم يُحصّل بعد", "Not yet collected"), money(report.outstanding)],
              [tx("في الموعد / متأخرة", "On time / late"), `${report.onTime} / ${report.late}`],
              [
                tx("متوسط مدة الجاهزية", "Avg turnaround"),
                report.averageTurnaroundHours === null
                  ? "—"
                  : `${report.averageTurnaroundHours} ${tx("ساعة", "h")}`,
              ],
              [
                tx("جاهزة لم تُستلم", "Ready, not collected"),
                `${report.readyNotCollected} (${tx("متأخرة", "overdue")} ${report.unclaimed})`,
              ],
              [tx("اشتراكات مباعة", "Plans sold"), String(report.subscriptionsSold)],
            ].map(([label, value]) => (
              <div key={label} className={cn(PANEL, "p-4")}>
                <p className={cn("text-[12px] font-semibold", MUTED)}>{label}</p>
                <p className={cn("mt-1 text-[19px] font-black", HEADING)}>{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars
              title={tx("القطع حسب الخدمة", "Pieces by service")}
              rows={report.byService}
              emptyText={tx("لا توجد بيانات.", "No data.")}
              unit={tx("قطعة", "pcs")}
            />
            <Bars
              title={tx("أكثر القطع", "Top pieces")}
              rows={report.byItem}
              emptyText={tx("لا توجد بيانات.", "No data.")}
              unit={tx("قطعة", "pcs")}
            />
          </div>
          <section className={cn(PANEL, "p-4")}>
            <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>
              {tx("القطع يوميًا", "Pieces per day")}
            </h3>
            {report.byDay.length === 0 ? (
              <p className={cn("text-[12.5px]", MUTED)}>{tx("لا توجد بيانات.", "No data.")}</p>
            ) : (
              <div className="flex h-40 items-end gap-1">
                {report.byDay.map((entry) => {
                  const top = Math.max(...report.byDay.map((row) => row.pieces), 1)
                  return (
                    <div
                      key={entry.day}
                      className="flex flex-1 flex-col items-center gap-1"
                      title={`${entry.day}: ${entry.pieces}`}
                    >
                      <div
                        className="w-full rounded-t bg-[#2563eb]"
                        style={{ height: `${Math.max(4, (entry.pieces / top) * 140)}px` }}
                      />
                      <span className={cn("text-[9.5px]", MUTED)}>{entry.day.slice(8)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </LaundryPage>
  )
}
