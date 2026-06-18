import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { LucideIcon, MoreVertical } from "lucide-react"

type ColorStatCardProps = {
  title: string
  subtitle?: string
  value: string
  trendText?: string
  icon: LucideIcon
  iconColor?: string
  cardClassName?: string
  textClassName?: string
  showMenu?: boolean
}

export default function ColorStatCard({
  title,
  subtitle,
  value,
  trendText,
  icon: Icon,
  iconColor = "text-muted-foreground",
  cardClassName = "",
  textClassName = "",
  showMenu = true,
}: ColorStatCardProps) {
  return (
    <Card className={`rounded-xl ${cardClassName}`}>
      <CardContent className={`p-6 ${textClassName}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-md">{title}</p>
            {subtitle && (
              <p className="text-sm opacity-80">{subtitle}</p>
            )}
          </div>

          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className={textClassName}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>View Details</DropdownMenuItem>
                <DropdownMenuItem>Export</DropdownMenuItem>
                <DropdownMenuItem>Refresh</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Value */}
        <h2 className="text-2xl font-bold">{value}</h2>

        {/* Trend */}
        {trendText && (
          <div className={`mt-3 flex items-center gap-1 ${iconColor}`}>
            <Icon className="h-5 w-5" />
            <span className="text-sm font-medium">{trendText}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
