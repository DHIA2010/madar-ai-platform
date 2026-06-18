import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CreditCardIcon, LogOutIcon, SettingsIcon, UserIcon, EllipsisVertical, MoreVertical, ArrowUpRight, ArrowDownRight  } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const salesByCountry = [
  {
    country: "United States",
    sales: "$12,340k",
    change: "+18.6%",
    trend: "up",
    flag: "https://flagcdn.com/w40/us.png",
  },
  {
    country: "Brazil",
    sales: "$3,210k",
    change: "+7.9%",
    trend: "up",
    flag: "https://flagcdn.com/w40/br.png",
  },
  {
    country: "India",
    sales: "$1,275k",
    change: "+15.3%",
    trend: "up",
    flag: "https://flagcdn.com/w40/in.png",
  },
  {
    country: "Australia",
    sales: "$980k",
    change: "-3.8%",
    trend: "down",
    flag: "https://flagcdn.com/w40/au.png",
  },
  {
    country: "France",
    sales: "$1,145k",
    change: "+11.2%",
    trend: "up",
    flag: "https://flagcdn.com/w40/fr.png",
  },
  {
    country: "China",
    sales: "$5,890k",
    change: "-6.4%",
    trend: "down",
    flag: "https://flagcdn.com/w40/cn.png",
  },
  {
    country: "Germany",
    sales: "$2,675k",
    change: "+9.7%",
    trend: "up",
    flag: "https://flagcdn.com/w40/de.png",
  },
  {
    country: "Canada",
    sales: "$1,120k",
    change: "-5.1%",
    trend: "down",
    flag: "https://flagcdn.com/w40/ca.png",
  },
]

export default function SalesByCountriesCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b py-3">
        <div>
          <CardTitle className="text-lg mb-0">Sales by Countries</CardTitle>
          <CardDescription>
            Monthly sales overview
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
      <CardContent className="space-y-5 p-6 h-[480px] overflow-y-auto">
        {salesByCountry.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between"
          >
            {/* Flag + Info */}
            <div className="flex items-center gap-3">
              <img
                src={item.flag}
                alt={item.country}
                className="h-10 w-10 rounded-full object-cover border p-0.5"
              />
              <div>
                <p className="font-medium">{item.sales}</p>
                <p className="text-sm text-muted-foreground">
                  {item.country}
                </p>
              </div>
            </div>
            {/* Badge */}
            {item.trend === "up" ? (
              <span
                className="
                  inline-flex items-center gap-1 rounded-full
                  bg-emerald-600/10 text-emerald-500 border border-emerald-500/20
                  px-2 py-0.5 text-xs font-medium border border-emerald-200
                "
              >
                <ArrowUpRight className="h-3 w-3" />
                {item.change}
              </span>
            ) : (
              <span
                className="
                  inline-flex items-center gap-1 rounded-full
                  bg-rose-600/10 text-rose-500 border border-rose-500/20
                  px-2 py-0.5 text-xs font-medium
                "
              >
                <ArrowDownRight className="h-3 w-3" />
                {item.change}
              </span>
            )}

          </div>
        ))}
      </CardContent>
    </Card>
  )
}
