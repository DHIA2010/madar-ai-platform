"use client"

import { useState } from "react"
import {
  CreditCardIcon,
  EllipsisVertical,
  LogOutIcon,
  Search,
  SettingsIcon,
  UserIcon,
} from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWidget } from "@/features/dashboard/hooks/use-widget"

export default function TrafficTable() {
  const { readModelViewModel } = useWidget("traffic-table")
  const payload = readModelViewModel?.payload
  const trafficTableData =
    payload?.dataPoints?.map((point) => ({
      month: String(point.month ?? "-"),
      source: String(point.source ?? "-"),
      icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg",
      desktop: typeof point.desktop === "number" ? point.desktop : 0,
      mobile: typeof point.mobile === "number" ? point.mobile : 0,
      sessions: typeof point.sessions === "number" ? point.sessions : 0,
      bounce: `${typeof point.bounce === "number" ? point.bounce : 0}%`,
      growth: typeof point.growth === "number" ? point.growth : 0,
    })) ?? []

  const [search, setSearch] = useState("")
  const [sortKey] = useState<"month" | "desktop" | "mobile">("month")
  const [page, setPage] = useState(1)

  const pageSize = 5

  const filteredData = trafficTableData
    .filter((row) =>
      [row.month, row.source, row.bounce].join(" ").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sortKey === "month" ? a.month.localeCompare(b.month) : b[sortKey] - a[sortKey]
    )

  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize)

  const totalPages = Math.ceil(filteredData.length / pageSize)

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-right">
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <UserIcon className="h-4 w-4 shrink-0" />
              عرض التقرير التفصيلي
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <CreditCardIcon className="h-4 w-4 shrink-0" />
              تنزيل التقرير
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <SettingsIcon className="h-4 w-4 shrink-0" />
              تصدير بصيغة CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <LogOutIcon className="h-4 w-4 shrink-0" />
              تحديث البيانات
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="text-right">
          <CardTitle className="text-lg text-right">{payload?.title ?? "مصادر الزيارات"}</CardTitle>
          <CardDescription className="num-ltr text-right">يناير - يونيو 2025</CardDescription>
        </div>

        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            placeholder="ابحث عن الشهر..."
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
        <Table dir="rtl">
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="text-right">الشهر</TableHead>
              <TableHead className="text-right">المصدر</TableHead>
              <TableHead className="text-left num-ltr">Desktop</TableHead>
              <TableHead className="text-left num-ltr">Mobile</TableHead>
              <TableHead className="text-left num-ltr">Total</TableHead>
              <TableHead className="text-left num-ltr">Sessions</TableHead>
              <TableHead className="text-left num-ltr">Bounce</TableHead>
              <TableHead className="text-left num-ltr">Growth</TableHead>
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
                  <TableCell className="text-right">
                    <span className="num-ltr">{row.month}</span>
                  </TableCell>

                  {/* Source with image */}
                  <TableCell className="text-right">
                    <div className="flex items-center gap-3">
                      <img
                        src={row.icon}
                        alt={row.source}
                        className="h-9 w-9 rounded-xl border p-1.5 object-contain"
                      />
                      <span className="font-medium num-ltr">{row.source}</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-left num-ltr">{row.desktop}</TableCell>

                  <TableCell className="text-left num-ltr">{row.mobile}</TableCell>

                  <TableCell className="text-left font-semibold num-ltr">{total}</TableCell>

                  <TableCell className="text-left num-ltr">{row.sessions}</TableCell>

                  <TableCell className="text-left num-ltr">{row.bounce}</TableCell>

                  {/* Growth badge */}
                  <TableCell className="text-left num-ltr">
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
            الصفحة <span className="num-ltr">{page}</span> من{" "}
            <span className="num-ltr">{totalPages}</span>
          </span>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              السابق
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
