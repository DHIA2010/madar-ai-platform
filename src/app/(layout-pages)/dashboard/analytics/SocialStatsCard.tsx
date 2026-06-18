"use client"

import { Facebook,
  Twitter,
  Instagram, EllipsisVertical,
  LogOutIcon, SettingsIcon, UserIcon, CreditCardIcon } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

const stats = [
  {
    name: "Facebook",
    category: "Social Media",
    value: "45,689",
    change: "+28.5%",
    positive: true,
    icon: <Facebook className="h-5 w-5 text-white" />,
    bg: "bg-blue-600",
  },
  {
    name: "Twitter",
    category: "Social Media",
    value: "34,248",
    change: "-14.5%",
    positive: false,
    icon: <Twitter className="h-5 w-5 text-white" />,
    bg: "bg-sky-500",
  },
  {
    name: "TikTok",
    category: "Entertainment",
    value: "45,689",
    change: "+28.5%",
    positive: true,
    icon: <span className="text-white font-bold">T</span>,
    bg: "bg-emerald-500",
  },
  {
    name: "Instagram",
    category: "Social Media",
    value: "67,249",
    change: "-43.5%",
    positive: false,
    icon: <Instagram className="h-5 w-5 text-white" />,
    bg: "bg-pink-500",
  },
  {
    name: "Snapchat",
    category: "Conversation",
    value: "89,178",
    change: "+24.7%",
    positive: true,
    icon: <span className="text-white font-bold">S</span>,
    bg: "bg-yellow-400",
  },
]

export default function SocialStatsCard() {
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <p className="text-lg font-medium">Social Performance</p>
          <div className="mt-2 flex items-baseline gap-3">
            <h2 className="text-3xl font-semibold">48,569</h2>
            <span className="text-sm font-medium text-green-600">
              27% ↑
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Last 1 year overview
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full [&_svg]:size-5"
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <UserIcon className="mr-2 h-4 w-4" />
              View detailed report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCardIcon className="mr-2 h-4 w-4" />
              Download report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <SettingsIcon className="mr-2 h-4 w-4" />
              Export as CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon className="mr-2 h-4 w-4" />
              Refresh data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="space-y-6 pt-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${item.bg}`}
              >
                {item.icon}
              </div>
              <div>
                <p className="text-md font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {item.category}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold">
                {item.value}
              </span>
              <Badge
                className={
                  item.positive
                    ? `
        pointer-events-none shadow-none
        rounded-full px-3 text-xs font-medium
        bg-green-500/10 text-green-500 border border-green-500/20
      `
                    : `
        pointer-events-none shadow-none
        rounded-full px-3 text-xs font-medium
        bg-red-500/10 text-red-500 border border-red-500/20
      `
                }
              >
                {item.change}
              </Badge>


            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
