import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  CreditCardIcon,
  UserIcon,
  Youtube,
  Film,
  DollarSign,
  Apple,
  Tickets,
  type LucideIcon,
} from "lucide-react"
import { useWidget } from "@/features/dashboard/hooks/use-widget"

/* ---------------------------------- */
/* Status Styles */
/* ---------------------------------- */
const STATUS_STYLES: Record<string, string> = {
  مربحة: "bg-emerald-600/10 text-emerald-600 border border-emerald-500/20",
  مستقرة: "bg-yellow-600/10 text-yellow-600 border border-yellow-500/20",
  منخفضة: "bg-red-600/10 text-red-600 border border-red-500/20",
}

/* ---------------------------------- */
/* Icon + Color Helpers */
/* ---------------------------------- */

const ICON_MAP: Record<string, LucideIcon> = {
  YouTube: Youtube,
  "John Doe": UserIcon,
  "Sans Brothers": CreditCardIcon,
  "Cinema City": Film,
  "To USD": DollarSign,
  "Apple Store": Apple,
  "Stripe Payout": Tickets,
}

const COLOR_CLASSES = [
  "bg-[linear-gradient(310deg,#ee0979,#ff6a00)]", // red
  "bg-[linear-gradient(310deg,#00c6fb,#005bea)]", // blue
  "bg-[linear-gradient(310deg,#17ad37,#98ec2d)]", // green
  "bg-[linear-gradient(310deg,#7928ca,#ff0080)]", // purple
  "bg-[linear-gradient(310deg,#f7971e,#ffd200)]", // orange
  "bg-[linear-gradient(310deg,#3494e6,#ec6ead)]", // voilet
  "bg-[linear-gradient(310deg,#2af598,#009efd)]", // cyan
]

const getColorByIndex = (index: number) => COLOR_CLASSES[index % COLOR_CLASSES.length]

/* ---------------------------------- */
/* Component */
/* ---------------------------------- */

export default function TransactionsCard() {
  const { readModelViewModel } = useWidget("transactions-card")
  const payload = readModelViewModel?.payload
  const transactions =
    payload?.dataPoints?.map((point) => ({
      name: String(point.name ?? "-"),
      date: String(point.date ?? "-"),
      status: String(point.status ?? "مستقرة"),
      amount: typeof point.amount === "number" ? point.amount : 0,
    })) ?? []

  return (
    <Card className="h-auto w-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="text-right">
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
          <CardTitle className="text-lg font-medium">{payload?.title ?? "أداء الحملات"}</CardTitle>
          <CardDescription>{payload?.summary ?? "نظرة عامة على آخر الحملات"}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="px-3">
        {transactions.map((item, index) => {
          const Icon = ICON_MAP[item.name] || UserIcon

          return (
            <div
              key={index}
              className="flex items-center justify-between rounded-lg px-3 py-3 hover:bg-muted/50 transition"
            >
              {/* Left */}
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center text-white",
                    getColorByIndex(index)
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium leading-none num-ltr">{item.name}</p>
                  <p className="text-xs text-muted-foreground num-ltr">{item.date}</p>
                </div>
              </div>

              {/* Right */}
              <div className="flex items-center gap-3">
                <Badge
                  className={cn(
                    "pointer-events-none rounded-full px-3 text-xs font-medium shadow-none hover:shadow-none dark:bg-transparent",
                    STATUS_STYLES[item.status]
                  )}
                >
                  {item.status}
                </Badge>

                <span
                  className={cn(
                    "text-sm font-semibold num-ltr",
                    item.amount >= 0 ? "text-emerald-600" : "text-muted-foreground"
                  )}
                >
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(item.amount)}
                </span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
