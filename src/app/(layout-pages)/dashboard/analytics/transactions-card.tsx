import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card"
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
  Tickets
} from "lucide-react"

/* ---------------------------------- */
/* Data */
/* ---------------------------------- */

const transactions = [
  { name: "YouTube", date: "Jun 15", status: "Pending", amount: "-$50" },
  { name: "John Doe", date: "Jun 14", status: "Done", amount: "-$100" },
  { name: "Sans Brothers", date: "Jun 13", status: "Failed", amount: "$120" },
  { name: "Cinema City", date: "Jun 6", status: "Done", amount: "-$75" },
  { name: "To USD", date: "Jun 1", status: "Done", amount: "-$250" },
  { name: "Stripe Payout", date: "May 27", status: "Pending", amount: "$540" },
  { name: "Apple Store", date: "May 29", status: "Done", amount: "-$199" },
]

/* ---------------------------------- */
/* Status Styles */
/* ---------------------------------- */
const STATUS_STYLES: Record<string, string> = {
  Pending:
    "bg-yellow-600/10 text-yellow-600 border border-yellow-500/20",

  Done:
    "bg-emerald-600/10 text-emerald-600 border border-emerald-500/20",

  Failed:
    "bg-red-600/10 text-red-600 border border-red-500/20",
}


/* ---------------------------------- */
/* Icon + Color Helpers */
/* ---------------------------------- */

const ICON_MAP: Record<string, any> = {
  YouTube: Youtube,
  "John Doe": UserIcon,
  "Sans Brothers": CreditCardIcon,
  "Cinema City": Film,
  "To USD": DollarSign,
  "Apple Store": Apple,
  "Stripe Payout": Tickets,
}

const COLOR_CLASSES = [
  "bg-[linear-gradient(310deg,#ee0979,#ff6a00)]",   // red
  "bg-[linear-gradient(310deg,#00c6fb,#005bea)]",   // blue
  "bg-[linear-gradient(310deg,#17ad37,#98ec2d)]",   // green
  "bg-[linear-gradient(310deg,#7928ca,#ff0080)]",   // purple
  "bg-[linear-gradient(310deg,#f7971e,#ffd200)]",   // orange
  "bg-[linear-gradient(310deg,#3494e6,#ec6ead)]",   // voilet
  "bg-[linear-gradient(310deg,#2af598,#009efd)]",   // cyan
]

const getColorByIndex = (index: number) =>
  COLOR_CLASSES[index % COLOR_CLASSES.length]

/* ---------------------------------- */
/* Component */
/* ---------------------------------- */

export default function TransactionsCard() {
  return (
    <Card className="h-auto w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-medium">
            Transactions
          </CardTitle>
          <CardDescription>
            Recent transactions overview
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

                <div>
                  <p className="text-sm font-medium leading-none">
                    {item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.date}
                  </p>
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
                    "text-sm font-semibold",
                    item.amount.startsWith("-")
                      ? "text-muted-foreground"
                      : "text-emerald-600"
                  )}
                >
                  {item.amount}
                </span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
