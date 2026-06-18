
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { Airplay, ChartColumnDecreasing, Clock, Lightbulb, TrendingDown, TrendingUp, UserPlus, UserRoundX, Users, Wallet } from "lucide-react"
import { Progress } from "@/components/ui/progress"

export default function TopTrafficChannelsCard() {

    return (
        <Card>
            <CardHeader className="space-y-0">
                <CardTitle className="text-lg">Top Traffic Channels</CardTitle>
                <CardDescription>Based on visitor data</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6 p-6">
                <div className="flex flex-col gap-6">

                    {/* Revenue */}
                    <div className="flex items-center gap-5">
                        <div className="
        flex h-10 w-10 items-center justify-center rounded-xl
        bg-emerald-600/10 text-emerald-500
        flex-shrink-0 border border-emerald-500/20
      ">
                            <Wallet className="h-5 w-5" />
                        </div>
                        <div className="w-full">
                            <div className="flex items-center justify-between">
                                <span className="text-md text-muted-foreground">Revenue</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">$7,926</span>
                                    <span className="flex items-center text-sm text-emerald-600">
                                        <TrendingUp className="mr-1 h-4 w-4" />12%
                                    </span>
                                </div>
                            </div>
                            <Progress value={60} className="mt-2 h-1.5 bg-muted [&>div]:bg-emerald-500 [&>div]:rounded-full" />
                        </div>
                    </div>

                    {/* Active Users */}
                    <div className="flex items-center gap-5">
                        <div className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-indigo-600/10 text-indigo-500
  flex-shrink-0 border border-indigo-500/20
">
  <UserRoundX className="h-5 w-5" />
</div>
                        <div className="w-full">
                            <div className="flex items-center justify-between">
                                <span className="text-md text-muted-foreground">Active Users</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">428</span>
                                    <span className="flex items-center text-sm text-indigo-600">
                                        <TrendingUp className="mr-1 h-4 w-4" />8%
                                    </span>
                                </div>
                            </div>
                            <Progress value={75} className="mt-2 h-1.5 bg-muted [&>div]:bg-indigo-500 [&>div]:rounded-full" />
                        </div>
                    </div>

                    {/* Bounce Rate */}
                    <div className="flex items-center gap-5">
                        <div className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-pink-600/10 text-pink-500
  flex-shrink-0 border border-pink-500/20
">
  <Lightbulb className="h-5 w-5" />
</div>
                        <div className="w-full">
                            <div className="flex items-center justify-between">
                                <span className="text-md text-muted-foreground">Bounce Rate</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">42%</span>
                                    <span className="flex items-center text-sm text-green-500">
                                        <TrendingUp className="mr-1 h-4 w-4" />5%
                                    </span>
                                </div>
                            </div>
                            <Progress value={42} className="mt-2 h-1.5 bg-muted [&>div]:bg-pink-500 [&>div]:rounded-full" />
                        </div>
                    </div>

                    {/* Customer Retention */}
                    <div className="flex items-center gap-5">
                        <div className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-teal-600/10 text-teal-500
  flex-shrink-0 border border-teal-500/20
">
  <Airplay className="h-5 w-5" />
</div>
                        <div className="w-full">
                            <div className="flex items-center justify-between">
                                <span className="text-md text-muted-foreground">Customer Retention</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">78%</span>
                                    <span className="flex items-center text-sm text-teal-500">
                                        <TrendingUp className="mr-1 h-4 w-4" />3%
                                    </span>
                                </div>
                            </div>
                            <Progress value={78} className="mt-2 h-1.5 bg-muted [&>div]:bg-teal-500 [&>div]:rounded-full" />
                        </div>
                    </div>

                    {/* Average Session Duration */}
                    <div className="flex items-center gap-5">
                        <div className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-amber-600/10 text-amber-500
  flex-shrink-0 border border-amber-500/20
">
  <Clock className="h-5 w-5" />
</div>
                        <div className="w-full">
                            <div className="flex items-center justify-between">
                                <span className="text-md text-muted-foreground">Avg. Session Duration</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">5m 20s</span>
                                    <span className="flex items-center text-sm text-rose-500">
                                        <TrendingDown className="mr-1 h-4 w-4" />1m
                                    </span>
                                </div>
                            </div>
                            <Progress value={65} className="mt-2 h-1.5 bg-muted [&>div]:bg-yellow-500 [&>div]:rounded-full" />
                        </div>
                    </div>

                    {/* Conversion Rate */}
                    <div className="flex items-center gap-5">
                        <div className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-violet-600/10 text-violet-500
  flex-shrink-0 border border-violet-500/20
">
  <ChartColumnDecreasing className="h-5 w-5" />
</div>
                        <div className="w-full">
                            <div className="flex items-center justify-between">
                                <span className="text-md text-muted-foreground">Conversion Rate</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">3.6%</span>
                                    <span className="flex items-center text-sm text-rose-500">
                                        <TrendingDown className="mr-1 h-4 w-4" />2%
                                    </span>
                                </div>
                            </div>
                            <Progress value={36} className="mt-2 h-1.5 bg-muted [&>div]:bg-violet-500 [&>div]:rounded-full" />
                        </div>
                    </div>

                    {/* New Signups */}
                    <div className="flex items-center gap-5">
                        <div className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-orange-600/10 text-orange-500
  flex-shrink-0 border border-orange-500/20
">
  <UserPlus className="h-5 w-5" />
</div>
                        <div className="w-full">
                            <div className="flex items-center justify-between">
                                <span className="text-md text-muted-foreground">New Signups</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">1,245</span>
                                    <span className="flex items-center text-sm text-green-500">
                                        <TrendingUp className="mr-1 h-4 w-4" />+12%
                                    </span>
                                </div>
                            </div>
                            <Progress value={55} className="mt-2 h-1.5 bg-muted [&>div]:bg-orange-500 [&>div]:rounded-full" />
                        </div>
                    </div>

                </div>
            </CardContent>

        </Card>
    )
}
