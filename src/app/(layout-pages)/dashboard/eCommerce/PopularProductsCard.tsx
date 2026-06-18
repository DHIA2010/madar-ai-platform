import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CreditCardIcon, LogOutIcon, SettingsIcon, UserIcon, EllipsisVertical} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const products = [
  {
    name: "Galaxy S22",
    sku: "#FXZ-4567",
    price: "$899.00",
    quantity: 15,
    image: "/pulse-ui-next/products/01.png",
  },
  {
    name: "Ultraboost Shoes",
    sku: "#FXZ-3456",
    price: "$120.50",
    quantity: 30,
    image: "/pulse-ui-next/products/02.png",
  },
  {
    name: "Sony Headphones",
    sku: "#FXZ-9485",
    price: "$349.99",
    quantity: 20,
    image: "/pulse-ui-next/products/03.png",
  },
  {
    name: "Versa Watch",
    sku: "#FXZ-2345",
    price: "$199.95",
    quantity: 25,
    image: "/pulse-ui-next/products/04.png",
  },
  {
    name: "Nest Mini",
    sku: "#FXZ-8959",
    price: "$49.99",
    quantity: 40,
    image: "/pulse-ui-next/products/05.png",
  },
  {
    name: "Xbox Console",
    sku: "#FXZ-7892",
    price: "$299.00",
    quantity: 10,
    image: "/pulse-ui-next/products/06.png",
  },
  {
    name: "XPS Laptop",
    sku: "#FXZ-1122",
    price: "$1,199.00",
    quantity: 8,
    image: "/pulse-ui-next/products/07.png",
  },
  {
    name: "EOS Camera",
    sku: "#FXZ-3344",
    price: "$649.00",
    quantity: 12,
    image: "/pulse-ui-next/products/08.png",
  },
  {
    name: "Bose Speaker",
    sku: "#FXZ-5566",
    price: "$179.99",
    quantity: 18,
    image: "/pulse-ui-next/products/09.png",
  },
]

export default function PopularProductsCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b py-3">
        <div>
          <CardTitle className="text-lg mb-0">Popular Products</CardTitle>
          <CardDescription>
            Total 10.4k Visitors
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
        {products.map((product, index) => (
          <div
            key={index}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <img
                src={product.image}
                alt={product.name}
                className="h-12 w-12 rounded-lg object-cover p-1 bg-muted"
              />

              <div>
                <p className="text-md font-medium leading-none">
                  {product.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Item: {product.sku}
                </p>
              </div>
            </div>

            <span className="text-md font-medium">
              {product.price}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
