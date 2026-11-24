"use client"

import { useState } from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { CrmPlacesDirectory } from "./madar-admin-crm-places"
import { CrmProspectsGoogle } from "./madar-admin-crm-prospects"

const SOURCES = [
  ["directory", "دليل الأنشطة (مجاني)"],
  ["google", "خرائط قوقل"],
] as const

// The sales team's prospect finder (Madar Admin -> CRM -> "البحث عن عملاء"): businesses to
// contact, from Madar's own free directory or from a Google Maps search; the ticked ones go
// into the pipeline as leads that carry which of the two they came from.
export function MadarAdminCrmProspects() {
  const [source, setSource] = useState<(typeof SOURCES)[number][0]>("directory")
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">البحث عن عملاء محتملين</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          ابحث عن الأنشطة التجارية حسب النشاط والمدينة أو حول مكان معيّن، ثم حدّد من تريد وأضفهم
          عملاء محتملين في{" "}
          <Link href={ROUTES.madarAdminCrm} className="font-semibold text-primary hover:underline">
            مسار المبيعات
          </Link>{" "}
          وراسلهم من{" "}
          <Link
            href={ROUTES.madarAdminCrmOutreach}
            className="font-semibold text-primary hover:underline"
          >
            رسائل واتساب
          </Link>
          . كل عميل يُضاف من هنا يحمل مصدره، ويمكن تصفية العملاء به.
        </p>
      </div>
      <div className="flex w-fit gap-1 rounded-xl bg-muted p-1">
        {SOURCES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSource(key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-bold transition",
              source === key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {source === "directory" ? <CrmPlacesDirectory /> : <CrmProspectsGoogle />}
    </div>
  )
}
