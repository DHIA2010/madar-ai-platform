import { Card, CardContent } from "@/components/ui/card"
import {
  BarChart3,
  Users,
  Bell,
  ShoppingCart,
  DollarSign,
  ChevronRight,
  FileText,
  Settings
} from "lucide-react"

export function StatsQuickNavList() {
  return (
    <Card>
      <CardContent className="p-4">

        <div className="space-y-0">

          {/* Sales Report */}
          <div className="group flex items-center justify-between rounded-2xl p-4 hover:bg-muted/40 transition cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h6 className="text-base font-semibold">Sales Report</h6>
                <p className="text-sm text-muted-foreground">
                  Monthly performance summary
                </p>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
          </div>

          {/* New Users */}
          <div className="group flex items-center justify-between rounded-2xl p-4 hover:bg-muted/40 transition cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h6 className="text-base font-semibold">New Users</h6>
                <p className="text-sm text-muted-foreground">
                  Last 24 hours
                </p>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
          </div>

          {/* Notifications */}
          <div className="group flex items-center justify-between rounded-2xl p-4 hover:bg-muted/40 transition cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-black">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h6 className="text-base font-semibold">Notifications</h6>
                <p className="text-sm text-muted-foreground">
                  5 unread messages
                </p>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
          </div>

          {/* Orders */}
          <div className="group flex items-center justify-between rounded-2xl p-4 hover:bg-muted/40 transition cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <h6 className="text-base font-semibold">New Orders</h6>
                <p className="text-sm text-muted-foreground">
                  18 orders today
                </p>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
          </div>

          {/* Revenue */}
          <div className="group flex items-center justify-between rounded-2xl p-4 hover:bg-muted/40 transition cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <h6 className="text-base font-semibold">Revenue</h6>
                <p className="text-sm text-muted-foreground">
                  $12,450 this month
                </p>
              </div>
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
          </div>

            {/* Reports */}
            <div className="group flex items-center justify-between rounded-2xl p-4 hover:bg-muted/40 transition cursor-pointer">
                <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                        <FileText className="h-5 w-5" />
                    </div>
                    <div>
                        <h6 className="text-base font-semibold">Reports</h6>
                        <p className="text-sm text-muted-foreground">
                            4 new reports generated
                        </p>
                    </div>
                </div>

                <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
            </div>

            {/* Settings */}
            <div className="group flex items-center justify-between rounded-2xl p-4 hover:bg-muted/40 transition cursor-pointer">
                <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                        <Settings className="h-5 w-5" />
                    </div>
                    <div>
                        <h6 className="text-base font-semibold">Settings</h6>
                        <p className="text-sm text-muted-foreground">
                            Manage system preferences
                        </p>
                    </div>
                </div>

                <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" />
            </div>

        </div>

      </CardContent>
    </Card>
  )
}
