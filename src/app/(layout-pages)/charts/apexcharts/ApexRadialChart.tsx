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

export function ApexRadialChart() {
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
      type: "radialBar",
      background: "transparent",
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
            fontSize: "16px",
            color: theme === "dark" ? "#e5e7eb" : "#374151",
          },
          value: {
            fontSize: "28px",
            fontWeight: 600,
            color: theme === "dark" ? "#ffffff" : "#111827",
          },
        },
      },
    },

    labels: ["Revenue Target"],
  }

  const series = [76]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Revenue Progress
        </CardTitle>
        <CardDescription>
          Monthly target completion
        </CardDescription>
      </CardHeader>

      <CardContent className="flex justify-center">
        <Chart
          options={options}
          series={series}
          type="radialBar"
          height={320}
        />
      </CardContent>
    </Card>
  )
}