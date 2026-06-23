"use client"
import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Search, Plus, MoreVertical, UserIcon, SettingsIcon, LogOutIcon } from "lucide-react"

const statusClass = (status: string) =>
  status === "Active"
    ? "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/30"
    : "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/30"

export default function CategoryList() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [categoryList, setCategoryList] = useState([
    {
      id: 1,
      name: "Outerwear",
      description: "Jackets, coats, raincoats and more",
      products: 12,
      earnings: "$12,400",
      status: "Active",
      image: "/products/01.png",
    },
    {
      id: 2,
      name: "Accessories",
      description: "Belts, hats, scarves, wallets",
      products: 25,
      earnings: "$8,950",
      status: "Active",
      image: "/products/02.png",
    },
    {
      id: 3,
      name: "Footwear",
      description: "Shoes, sneakers, boots and sandals",
      products: 8,
      earnings: "$5,600",
      status: "Inactive",
      image: "/products/03.png",
    },
    {
      id: 4,
      name: "Outerwear",
      description: "Jackets, coats, rainwear, and blazers",
      products: 12,
      earnings: "$9,200",
      status: "Published",
      image: "/products/04.png",
    },
    {
      id: 5,
      name: "Accessories",
      description: "Belts, scarves, hats, and wallets",
      products: 15,
      earnings: "$4,350",
      status: "Active",
      image: "/products/05.png",
    },
    {
      id: 6,
      name: "Tops",
      description: "Shirts, t-shirts, blouses, and polos",
      products: 20,
      earnings: "$11,800",
      status: "Published",
      image: "/products/06.png",
    },
    {
      id: 7,
      name: "Bottoms",
      description: "Jeans, trousers, shorts, and skirts",
      products: 10,
      earnings: "$7,600",
      status: "Draft",
      image: "/products/07.png",
    },
    {
      id: 8,
      name: "Sweatshirts",
      description: "Hoodies, pullovers, and zip-ups",
      products: 9,
      earnings: "$6,450",
      status: "Inactive",
      image: "/products/08.png",
    },
    {
      id: 9,
      name: "Suits & Blazers",
      description: "Formal suits, tailored blazers, and dress jackets",
      products: 7,
      earnings: "$8,900",
      status: "Published",
      image: "/products/09.png",
    },
    {
      id: 10,
      name: "Activewear",
      description: "Sportswear, gym outfits, and performance gear",
      products: 14,
      earnings: "$10,250",
      status: "Active",
      image: "/products/10.png",
    },
    {
      id: 11,
      name: "Formal Footwear",
      description: "Dress shoes, loafers, and office-ready styles",
      products: 6,
      earnings: "$6,700",
      status: "Draft",
      image: "/products/11.png",
    },
    {
      id: 12,
      name: "Casual Wear",
      description: "Everyday outfits, relaxed fits, and streetwear",
      products: 18,
      earnings: "$12,400",
      status: "Published",
      image: "/products/12.png",
    },
    {
      id: 13,
      name: "Swimwear",
      description: "Bikinis, trunks, one-piece suits, and cover-ups",
      products: 8,
      earnings: "$5,150",
      status: "Inactive",
      image: "/products/13.png",
    },
    {
      id: 14,
      name: "Formal Dresses",
      description: "Evening gowns, cocktail dresses, and party wear",
      products: 11,
      earnings: "$9,800",
      status: "Active",
      image: "/products/14.png",
    },
    {
      id: 15,
      name: "Winter Essentials",
      description: "Coats, thermal wear, gloves, and beanies",
      products: 13,
      earnings: "$10,600",
      status: "Draft",
      image: "/products/15.png",
    },
  ])
  const [selected, setSelected] = useState<number[]>([])
  const PAGE_SIZE = 5

  const filtered = useMemo(() => {
    return categoryList.filter((c) =>
      `${c.name} ${c.description} ${c.status} ${c.earnings}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [search, categoryList])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE
  const paginated = filtered.slice(start, start + PAGE_SIZE)

  const handleSelectAll = () => {
    if (selected.length === paginated.length) {
      setSelected([])
    } else {
      setSelected(paginated.map((cat) => cat.id))
    }
  }

  const handleSelectOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleDeleteSelected = () => {
    setCategoryList((prev) => prev.filter((cat) => !selected.includes(cat.id)))
    setSelected([])
  }

  const isAllSelected = paginated.length > 0 && selected.length === paginated.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category List</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="flex gap-2">
            {selected.length > 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                Delete Selected ({selected.length})
              </Button>
            )}
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add Category
            </Button>
          </div>
        </div>

        {paginated.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-muted-foreground">
            No matching categories found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} />
                </TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Earnings</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginated.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(cat.id)}
                      onCheckedChange={() => handleSelectOne(cat.id)}
                    />
                  </TableCell>

                  <TableCell>
                    <img
                      src={cat.image}
                      alt={cat.name}
                      className="h-10 w-10 rounded-full border object-cover p-1 bg-muted/50"
                    />
                  </TableCell>

                  <TableCell className="font-medium">{cat.name}</TableCell>

                  <TableCell>{cat.description}</TableCell>
                  <TableCell>{cat.products}</TableCell>
                  <TableCell>{cat.earnings}</TableCell>

                  <TableCell>
                    <Badge className={statusClass(cat.status)} variant="outline">
                      {cat.status}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-full border-gray-300 dark:border-gray-700"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            console.log("View category", cat.id)
                          }}
                        >
                          <UserIcon className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => {
                            console.log("Edit category", cat.id)
                          }}
                        >
                          <SettingsIcon className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => {
                            setCategoryList((prev) => prev.filter((c) => c.id !== cat.id))
                            setSelected((prev) => prev.filter((id) => id !== cat.id))
                          }}
                        >
                          <LogOutIcon className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Result {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>

          <div className="flex gap-2">
            <Button size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </Button>
            <Button size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px]">
          <SheetHeader>
            <SheetTitle>Add New Category</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input placeholder="Category name" />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} placeholder="Category description" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Products</Label>
                <Input type="number" placeholder="0" />
              </div>

              <div className="space-y-2">
                <Label>Total Earnings</Label>
                <Input placeholder="$0.00" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category Image</Label>
              <Input type="file" />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button>Save Category</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  )
}
