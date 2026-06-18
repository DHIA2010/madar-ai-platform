"use client"

import {
  CreditCardIcon,
  DollarSign,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  TrendingDown,
  TrendingUp,
  UserIcon,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Progress } from "@/components/ui/progress"

export default function WebsiteAnalytics() {
  return (
    <Card className="relative overflow-hidden h-full">
      {/* Gaussian Glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="mb-1 text-xl">
            Website Analytics
          </CardTitle>

          <CardDescription>
            Overview of your website analytics data
          </CardDescription>
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
              <UserIcon />
              View detailed report
            </DropdownMenuItem>

            <DropdownMenuItem>
              <CreditCardIcon />
              Download report
            </DropdownMenuItem>

            <DropdownMenuItem>
              <SettingsIcon />
              Export as CSV / PDF
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem>
              <LogOutIcon />
              Refresh data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        {/* Top Stats */}
        <div>
          <h2 className="text-4xl font-bold tracking-tight">
            685.7K
          </h2>

          <p className="mt-1 text-muted-foreground">
            Total Users
          </p>
        </div>

        {/* Metrics */}
        <div className="mt-7 flex flex-col gap-7">

          {/* Revenue */}
          <div className="flex items-center gap-5">

            <div
              className="
                flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                bg-emerald-600/10 text-emerald-600 border border-emerald-500/20
                shadow-[0_0_20px_rgba(168,85,247,.15)]
              "
            >
              <DollarSign className="h-5 w-5" />
            </div>

            <div className="w-full">

              <div className="flex items-center justify-between">

                <span className="text-muted-foreground">
                  Revenue
                </span>

                <div className="flex items-center gap-2">

                  <span className="font-medium">
                    $7,926
                  </span>

                  <span
                    className="
                      flex items-center rounded-full
                      bg-emerald-500/10 px-2 py-0.5
                      text-sm text-emerald-400
                    "
                  >
                    <TrendingUp className="mr-1 h-4 w-4" />
                    12%
                  </span>

                </div>

              </div>

              <Progress
                value={45}
                className="
                  mt-2 h-2 bg-muted

                  [&>div]:rounded-full

                  [&>div]:bg-[linear-gradient(90deg,#98ec2d,#17ad37)]

                  [&>div]:shadow-[0_0_14px_rgba(23,173,55,.35)]
                "
              />

            </div>

          </div>


          {/* Active Users */}
          <div className="flex items-center gap-5">

            <div
              className="
                flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                bg-rose-600/10 text-rose-600 border border-rose-500/20
                shadow-[0_0_20px_rgba(168,85,247,.15)]
              "
            >
              <Users className="h-5 w-5" />
            </div>

            <div className="w-full">

              <div className="flex items-center justify-between">

                <span className="text-muted-foreground">
                  Active Users
                </span>

                <div className="flex items-center gap-2">

                  <span className="font-medium">
                    428
                  </span>

                  <span
                    className="
                      flex items-center rounded-full
                      bg-emerald-500/10 px-2 py-0.5
                      text-sm text-emerald-400
                    "
                  >
                    <TrendingUp className="mr-1 h-4 w-4" />
                    8%
                  </span>

                </div>

              </div>

              <Progress
                value={60}
                className="
                  mt-2 h-2 bg-muted

                  [&>div]:rounded-full

                  [&>div]:bg-[linear-gradient(90deg,#ff4ecd,#ff0080)]

                  [&>div]:shadow-[0_0_14px_rgba(255,0,128,.35)]
                "
              />

            </div>

          </div>


          {/* Conversion Rate */}
          <div className="flex items-center gap-5">

            <div
              className="
                flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                bg-violet-600/10 text-violet-600 border border-violet-500/20
                shadow-[0_0_20px_rgba(168,85,247,.15)]
              "
            >
              <TrendingUp className="h-5 w-5" />
            </div>

            <div className="w-full">

              <div className="flex items-center justify-between">

                <span className="text-muted-foreground">
                  Conversion Rate
                </span>

                <div className="flex items-center gap-2">

                  <span className="font-medium">
                    3.6%
                  </span>

                  <span
                    className="
                      flex items-center rounded-full
                      bg-rose-500/10 px-2 py-0.5
                      text-sm text-rose-400
                    "
                  >
                    <TrendingDown className="mr-1 h-4 w-4" />
                    2%
                  </span>

                </div>

              </div>

              <Progress
                value={75}
                className="
                  mt-2 h-2 bg-muted

                  [&>div]:rounded-full

                  [&>div]:bg-[linear-gradient(90deg,#a855f7,#7c3aed)]

                  [&>div]:shadow-[0_0_14px_rgba(168,85,247,.35)]
                "
              />

            </div>

          </div>

        </div>
      </CardContent>
    </Card>
  )
}