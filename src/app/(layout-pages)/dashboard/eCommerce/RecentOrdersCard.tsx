import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CreditCardIcon, LogOutIcon, SettingsIcon, UserIcon, EllipsisVertical} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const recentOrders = [
  {
    product: "Admin Dashboard Pro",
    customer: "Olivia Martin",
    image: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/adonisjs/adonisjs-original.svg",
    amount: "$299.00",
  },
  {
  product: "Ecommerce UI Kit",
  customer: "Jackson Lee",
  image: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bootstrap/bootstrap-original.svg",
  amount: "$39.00",
},
{
  product: "CRM Dashboard",
  customer: "Isabella Nguyen",
  image: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
  amount: "$299.00",
},
{
  product: "Landing Page Pack",
  customer: "William Kim",
  image: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg",
  amount: "$99.00",
},
{
  product: "SaaS UI Components",
  customer: "Sofia Davis",
  image: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
  amount: "$39.00",
},
{
  product: "Analytics Dashboard",
  customer: "Liam Johnson",
  image: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/chartjs/chartjs-original.svg",
  amount: "$59.00",
},
{
  product: "Marketing Toolkit",
  customer: "Ava Martinez",
  image: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/figma/figma-original.svg",
  amount: "$79.00",
},
{
  product: "Project Management Suite",
  customer: "Noah Williams",
  image: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/angular/angular-original.svg",
  amount: "$99.00",
},

]

export default function RecentOrdersCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b py-3">
        <div>
          <CardTitle className="text-lg mb-0">Recent Orders</CardTitle>
          <CardDescription>
            Latest product purchases
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
        {recentOrders.map((order, index) => (
          <div
            key={index}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              {/* Product Image */}
              <img
                src={order.image}
                alt={order.product}
                className="h-10 w-10 rounded-md object-cover border p-1"
              />

              {/* Product Info */}
              <div>
                <p className="text-md font-medium">
                  {order.product}
                </p>
                <p className="text-sm text-muted-foreground">
                  {order.customer}
                </p>
              </div>
            </div>

            {/* Amount */}
            <div className="font-medium text-foreground">
              +{order.amount}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
