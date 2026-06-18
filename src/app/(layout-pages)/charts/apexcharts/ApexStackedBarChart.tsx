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

export function ApexStackedBarChart() {
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
      type: "bar",
      stacked: true,
      toolbar: { show: false },
      background: "transparent",
    },

    theme: {
      mode: theme,
    },

    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "30%",
        borderRadius: 6,
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
          9-Month Stacked Performance
        </CardTitle>
        <CardDescription>
          Users + Sessions combined (Jan – Sep)
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Chart
          options={options}
          series={series}
          type="bar"
          height={350}
        />
      </CardContent>
    </Card>
  )
}