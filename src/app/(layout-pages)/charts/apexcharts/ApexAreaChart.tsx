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

// ✅ Fix 1: Disable SSR for chart
const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
})

export function ApexAreaChart() {
  // ✅ Fix 2: Safe initial state (NO document here)
  const [theme, setTheme] = useState<"light" | "dark">("light")

  // ✅ Fix 3: Access document only in useEffect
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains("dark")
      setTheme(isDark ? "dark" : "light")
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
      type: "area",
      toolbar: { show: false },
      background: "transparent",
    },

    theme: {
      mode: theme,
    },

    dataLabels: {
      enabled: false,
    },

    stroke: {
      curve: "smooth",
      width: 3,
    },

    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: theme === "dark" ? 0.35 : 0.45,
        opacityTo: 0.05,
        stops: [0, 100],
      },
    },

    grid: {
      borderColor: theme === "dark" ? "#1f2937" : "#e5e7eb",
      strokeDashArray: 4,
    },

    xaxis: {
      categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      labels: {
        style: {
          colors: theme === "dark" ? "#9ca3af" : "#6b7280",
        },
      },
    },

    yaxis: {
      labels: {
        style: {
          colors: theme === "dark" ? "#9ca3af" : "#6b7280",
        },
      },
    },

    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: {
        colors: theme === "dark" ? "#e5e7eb" : "#374151",
      },
    },

    tooltip: {
      theme: theme,
    },
  }

  const series = [
    { name: "Users", data: [120, 200, 150, 300, 250, 400, 350] },
    { name: "Sessions", data: [80, 150, 100, 200, 180, 250, 220] },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Weekly Analytics
        </CardTitle>
        <CardDescription>
          Users & Sessions overview
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Chart
          options={options}
          series={series}
          type="area"
          height={350}
        />
      </CardContent>
    </Card>
  )
}