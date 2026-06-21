"use client"
import { useMemo, useState } from "react"
import Link from "next/link"
import { ROUTES } from "@/constants/routes"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { MoreVertical, Plus, Search, ShoppingBag, Wallet, Users, Box } from "lucide-react"

const products = [
  {
    id: 1,
    name: "Denim Jacket",
    category: "Outerwear",
    stock: "In Stock",
    sku: "DJ-659",
    price: "$120",
    status: "Published",
    image: "/pulse-ui-next/products/01.png",
  },
  {
    id: 2,
    name: "Leather Belt",
    category: "Accessories",
    stock: "In Stock",
    sku: "LB-500",
    price: "$45",
    status: "Published",
    image: "/pulse-ui-next/products/02.png",
  },
  {
    id: 3,
    name: "Slim Fit Jeans",
    category: "Bottoms",
    stock: "Low Stock",
    sku: "SFJ-2021",
    price: "$89",
    status: "Draft",
    image: "/pulse-ui-next/products/03.png",
  },
  {
    id: 4,
    name: "Formal Blazer",
    category: "Suits & Blazers",
    stock: "In Stock",
    sku: "FB-300",
    price: "$199",
    status: "Published",
    image: "/pulse-ui-next/products/04.png",
  },
  {
    id: 5,
    name: "Running Shoes",
    category: "Footwear",
    stock: "Out of Stock",
    sku: "RS-150",
    price: "$75",
    status: "Inactive",
    image: "/pulse-ui-next/products/05.png",
  },
  {
    id: 6,
    name: "Cotton Hoodie",
    category: "Sweatshirts",
    stock: "In Stock",
    sku: "CH-100",
    price: "$149",
    status: "Draft",
    image: "/pulse-ui-next/products/06.png",
  },
  {
    id: 7,
    name: "Wool Scarf",
    category: "Accessories",
    stock: "Low Stock",
    sku: "WS-220",
    price: "$39",
    status: "Published",
    image: "/pulse-ui-next/products/07.png",
  },
  {
    id: 8,
    name: "Graphic T-Shirt",
    category: "Tops",
    stock: "In Stock",
    sku: "GT-310",
    price: "$29",
    status: "Published",
    image: "/pulse-ui-next/products/08.png",
  },
  {
    id: 9,
    name: "Raincoat",
    category: "Outerwear",
    stock: "Out of Stock",
    sku: "RC-450",
    price: "$89",
    status: "Archived",
    image: "/pulse-ui-next/products/09.png",
  },
]

const statusVariant = (status: string) => {
  switch (status) {
    case "Published":
      return "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/30"
    case "Draft":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400 border-yellow-500/30"
    case "Inactive":
      return "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/30"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function ProductGrid() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [data, setData] = useState(products)

  const PAGE_SIZE = 8

  const filtered = useMemo(() => {
    return data.filter((p) =>
      `${p.name} ${p.category} ${p.status}`.toLowerCase().includes(search.toLowerCase())
    )
  }, [search, data])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const toggleOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-md text-muted-foreground">Total Orders</p>
                <p className="text-sm text-muted-foreground">All Regions</p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Export</DropdownMenuItem>
                  <DropdownMenuItem>Refresh</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <h2 className="text-2xl font-bold">8,542</h2>

            <div className="mt-3 flex items-center gap-1 text-emerald-600">
              <ShoppingBag className="h-5 w-5" />
              <span className="text-sm font-medium">+3.5% since last month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-600 text-white border-purple-500/30">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-md">Total Revenue</p>
                <p className="text-sm opacity-80">This Quarter</p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="text-white">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Export</DropdownMenuItem>
                  <DropdownMenuItem>Refresh</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <h2 className="text-2xl font-bold">$23,456</h2>

            <div className="mt-3 flex items-center gap-1">
              <Wallet className="h-5 w-5" />
              <span className="text-sm font-medium">+8.5% since last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-md text-muted-foreground">Total Customers</p>
                <p className="text-sm text-muted-foreground">Worldwide</p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Export</DropdownMenuItem>
                  <DropdownMenuItem>Refresh</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <h2 className="text-2xl font-bold">5,678</h2>

            <div className="mt-3 flex items-center gap-1 text-rose-600">
              <Users className="h-5 w-5" />
              <span className="text-sm font-medium">-2.5% since last month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-600 text-white border-emerald-500/30">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-md">Total Products</p>
                <p className="text-sm opacity-80">Inventory</p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="text-white">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem>Export</DropdownMenuItem>
                  <DropdownMenuItem>Refresh</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <h2 className="text-2xl font-bold">1,234</h2>

            <div className="mt-3 flex items-center gap-1">
              <Box className="h-5 w-5" />
              <span className="text-sm font-medium">+5.0% since last month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-yellow-400 bg-yellow-50 text-yellow-900">
          <CardContent className="p-6">
            <p className="text-md text-muted-foreground">Active Shoppers</p>
            <p className="text-sm text-muted-foreground">Live Now</p>

            <h2 className="text-2xl font-bold my-3">179</h2>

            <div className="flex items-center gap-1 text-yellow-600">
              <Users className="h-5 w-5" />
              <span className="text-sm font-medium">44% today</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* HEADER */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap gap-4 items-center justify-between border-b py-4">
          <div>
            <CardTitle className="text-lg">Products Grid</CardTitle>
            <CardDescription>Visual product management</CardDescription>
          </div>

          <div className="flex gap-3 items-center">
            <div className="relative w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>

            <Link href={ROUTES.productsAdd}>
              <Button size="sm">
                <Plus className="mr-1 h-5 w-5" />
                Add Product
              </Button>
            </Link>
          </div>
        </CardHeader>

        {/* GRID */}
        <CardContent className="p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginated.map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                selected={selected.includes(product.id)}
                onSelect={() => toggleOne(product.id)}
                onDelete={() => setData((prev) => prev.filter((p) => p.id !== product.id))}
              />
            ))}
          </div>

          {/* PAGINATION */}
          <div className="flex justify-between items-center mt-6">
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* PRODUCT CARD */
function ProductGridCard({
  product,
  selected,
  onSelect,
  onDelete,
}: {
  product: {
    id: number
    name: string
    category: string
    stock: string
    sku: string
    price: string
    status: string
    image: string
  }
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <Card className="group overflow-hidden transition hover:shadow-lg border hover:border-primary cursor-pointer shadow-none hover:shadow-primary/10">
      <CardContent className="p-4 space-y-4">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <Checkbox checked={selected} onCheckedChange={onSelect} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem>View</DropdownMenuItem>
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Image */}
        <div className="aspect-square rounded-xl bg-muted overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300 p-4"
          />
        </div>

        {/* Info */}
        <div>
          <h4 className="font-semibold leading-tight">{product.name}</h4>
          <p className="text-sm text-muted-foreground">{product.category}</p>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between">
          <span className="font-semibold">{product.price}</span>
          <Badge className={statusVariant(product.status)} variant="outline">
            {product.status}
          </Badge>
        </div>

        {/* Footer */}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>SKU: {product.sku}</span>
          <span>{product.stock}</span>
        </div>
      </CardContent>
    </Card>
  )
}
