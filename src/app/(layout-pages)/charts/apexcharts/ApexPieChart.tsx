"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import type { ApexOptions } from "apexcharts"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

// ✅ SSR-safe chart
const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
})

export function ApexPieChart() {
  const [theme, setTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
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

  const options: ApexOptions = {
    chart: {
      type: "pie",
      background: "transparent",
    },

    theme: {
      mode: theme,
    },

    labels: ["Desktop", "Mobile", "Tablet", "Other"],

    legend: {
      position: "bottom",
      labels: {
        colors: theme === "dark" ? "#e5e7eb" : "#374151",
      },
    },

    dataLabels: {
      enabled: true,
      style: {
        fontSize: "13px",
      },
    },

    tooltip: {
      theme: theme,
    },

    stroke: {
      width: 2,
      colors: theme === "dark" ? ["#111827"] : ["#ffffff"],
    },
  }

  const series = [5400, 7200, 2100, 900]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          User Distribution
        </CardTitle>
        <CardDescription>
          Breakdown by device type
        </CardDescription>
      </CardHeader>

      <CardContent className="flex justify-center">
        <Chart
          options={options}
          series={series}
          type="pie"
          width={380}
        />
      </CardContent>
    </Card>
  )
}