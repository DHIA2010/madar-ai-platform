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

export function ApexLineChart() {
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
      type: "line",
      toolbar: { show: false },
      background: "transparent",
    },

    theme: {
      mode: theme,
    },

    stroke: {
      curve: "straight",
      width: 3,
    },

    markers: {
      size: 5,
      hover: {
        size: 7,
      },
    },

    dataLabels: {
      enabled: false,
    },

    grid: {
      borderColor: theme === "dark" ? "#1f2937" : "#e5e7eb",
      strokeDashArray: 4,
    },

    xaxis: {
      categories: [
        "Jan", "Feb", "Mar", "Apr", "May",
        "Jun", "Jul", "Aug", "Sep",
      ],
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
    {
      name: "Users",
      data: [420, 510, 630, 700, 860, 920, 1050, 980, 1150],
    },
    {
      name: "Sessions",
      data: [380, 460, 540, 620, 720, 800, 910, 870, 1020],
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          9-Month Growth Trend
        </CardTitle>
        <CardDescription>
          Users vs Sessions comparison
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Chart
          options={options}
          series={series}
          type="line"
          height={350}
        />
      </CardContent>
    </Card>
  )
}