import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    TrendingUp,
    TrendingDown,
    CreditCardIcon,
    LogOutIcon,
    SettingsIcon,
    UserIcon,
    EllipsisVertical,
    Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function EarningsBreakdownCard() {
    return (
       
            <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between border-b">
                    <div>
                        <CardTitle className="text-lg mb-1">Earnings Breakdown</CardTitle>
                        <CardDescription>
                            Monthly financial summary
                        </CardDescription>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
                                <EllipsisVertical />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
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
                    
                </CardContent>
            </Card>

    )
}
