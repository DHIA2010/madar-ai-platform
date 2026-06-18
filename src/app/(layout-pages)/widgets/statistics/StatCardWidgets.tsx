import { Card, CardContent } from "@/components/ui/card"
import { LucideIcon } from "lucide-react"

type StatCardProps = {
  title: string
  value: string
  icon: LucideIcon
}

export default function StatCardWidgets({ title, value, icon: Icon }: StatCardProps) {
  return (
    <Card className="stat-card-widget">
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <h2 className="text-2xl font-bold">{value}</h2>
        </div>
        <Icon className="h-8 w-8 text-muted-foreground" />
      </CardContent>
    </Card>
  )
}
