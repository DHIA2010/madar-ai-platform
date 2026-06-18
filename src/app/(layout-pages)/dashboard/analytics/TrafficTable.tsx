"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const trafficTableData = [
  {
    month: "January",
    source: "Google",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg",
    desktop: 186,
    mobile: 80,
    sessions: 4200,
    bounce: "42%",
    growth: -4.2,
  },
  {
    month: "February",
    source: "Facebook",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/facebook/facebook-original.svg",
    desktop: 305,
    mobile: 200,
    sessions: 6850,
    bounce: "38%",
    growth: 7.1,
  },
  {
    month: "March",
    source: "Twitter",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/twitter/twitter-original.svg",
    desktop: 237,
    mobile: 120,
    sessions: 5120,
    bounce: "46%",
    growth: -2.4,
  },
  {
    month: "April",
    source: "Direct",
    icon: "https://img.icons8.com/ios-filled/50/000000/link.png",
    desktop: 273,
    mobile: 190,
    sessions: 5980,
    bounce: "40%",
    growth: 3.9,
  },
  {
    month: "May",
    source: "TikTok",
    icon: "https://img.icons8.com/ios-filled/50/000000/tiktok.png",
    desktop: 309,
    mobile: 230,
    sessions: 7340,
    bounce: "35%",
    growth: 5.6,
  },
  {
    month: "June",
    source: "LinkedIn",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/linkedin/linkedin-original.svg",
    desktop: 334,
    mobile: 240,
    sessions: 7680,
    bounce: "33%",
    growth: 6.1,
  },
  {
    month: "July",
    source: "Angular",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/angularjs/angularjs-original.svg",
    desktop: 368,
    mobile: 260,
    sessions: 8240,
    bounce: "36%",
    growth: 4.8,
  },
  {
    month: "August",
    source: "Reddit",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/redhat/redhat-original.svg",
    desktop: 402,
    mobile: 295,
    sessions: 9120,
    bounce: "38%",
    growth: 7.4,
  },
  {
    month: "September",
    source: "Twitter",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/redux/redux-original.svg",
    desktop: 386,
    mobile: 310,
    sessions: 8890,
    bounce: "41%",
    growth: -1.9,
  },

]

export default function TrafficTable() {
  const [search, setSearch] = useState("")
  const [sortKey] = useState<"month" | "desktop" | "mobile">("month")
  const [page, setPage] = useState(1)

  const pageSize = 5

  const filteredData = useMemo(() => {
    return trafficTableData
      .filter((row) =>
  [
    row.month,
    row.source,
    row.bounce,
  ]
    .join(" ")
    .toLowerCase()
    .includes(search.toLowerCase())
)
      .sort((a, b) =>
        sortKey === "month"
          ? a.month.localeCompare(b.month)
          : b[sortKey] - a[sortKey]
      )
  }, [search, sortKey])

  const paginatedData = filteredData.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  const totalPages = Math.ceil(filteredData.length / pageSize)

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b">
        <div>
          <CardTitle className="text-lg">Traffic Details</CardTitle>
          <CardDescription>January - June 2025</CardDescription>
        </div>

        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            placeholder="Search month..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Desktop</TableHead>
              <TableHead className="text-right">Mobile</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Bounce</TableHead>
              <TableHead className="text-right">Growth</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedData.map((row) => {
              const total = row.desktop + row.mobile
              const isPositive = row.growth >= 0

              return (
                <TableRow
                  key={`${row.month}-${row.source}`}
                  className="hover:bg-muted/50 transition"
                >
                  {/* Month */}
                  <TableCell className="font-medium">
                    {row.month}
                  </TableCell>

                  {/* Source with image */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={row.icon}
                        alt={row.source}
                        className="h-9 w-9 rounded-xl border p-1.5 object-contain"
                      />
                      <span className="font-medium">
                        {row.source}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-right">
                    {row.desktop}
                  </TableCell>

                  <TableCell className="text-right">
                    {row.mobile}
                  </TableCell>

                  <TableCell className="text-right font-semibold">
                    {total}
                  </TableCell>

                  <TableCell className="text-right">
                    {row.sessions}
                  </TableCell>

                  <TableCell className="text-right">
                    {row.bounce}
                  </TableCell>

                  {/* Growth badge */}
                  <TableCell className="text-right">
                    <Badge
                      className={
                        isPositive
                          ? "pointer-events-none bg-green-500/10 text-green-500 border border-green-500/20 rounded-full px-3 text-xs font-medium shadow-none"
                          : "pointer-events-none bg-red-500/10 text-red-500 border border-red-500/20 rounded-full px-3 text-xs font-medium shadow-none"
                      }
                    >
                      {isPositive ? "+" : ""}
                      {row.growth}%
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>


        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
