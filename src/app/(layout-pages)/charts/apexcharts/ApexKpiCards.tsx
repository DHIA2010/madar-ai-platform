"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import type { ApexOptions } from "apexcharts"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// ✅ Fix: dynamic import
const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
})

export function ApexKpiCards() {
  const [theme, setTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    // ✅ Safe access to document
    const updateTheme = () => {
      setTheme(
        document.documentElement.classList.contains("dark")
          ? "dark"
          : "light"
      )
    }

    updateTheme()

    const observer = new MutationObserver(updateTheme)

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  const baseOptions: ApexOptions = {
    chart: {
      type: "radialBar",
      background: "transparent",
      sparkline: { enabled: true },
    },

    theme: {
      mode: theme,
    },

    plotOptions: {
      radialBar: {
        hollow: {
          size: "65%",
        },
        track: {
          background: theme === "dark" ? "#1f2937" : "#e5e7eb",
        },
        dataLabels: {
          name: {
            show: false,
          },
          value: {
            fontSize: "26px",
            fontWeight: 600,
            color: theme === "dark" ? "#ffffff" : "#111827",
            formatter: function (val: number) {
              return val + "%"
            },
          },
        },
      },
    },
  }

  const kpis = [
    { title: "Revenue", value: 76 },
    { title: "Sales", value: 63 },
    { title: "Growth", value: 89 },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {kpis.map((kpi, index) => (
        <Card key={index} className="rounded-2xl border bg-background shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {kpi.title}
            </CardTitle>
          </CardHeader>

          <CardContent className="flex justify-center">
            <Chart
              options={{ ...baseOptions, labels: [kpi.title] }}
              series={[kpi.value]}
              type="radialBar"
              height={250}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}