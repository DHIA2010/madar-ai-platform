"use client"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal } from "lucide-react"

const products = [
  {
    id: 1,
    name: "Wireless Headphones",
    category: "Electronics",
    stock: "In Stock",
    price: "$120",
    status: "Published",
    image: "/pulse-ui-next/products/01.png",
  },
  {
    id: 2,
    name: "Gaming Mouse",
    category: "Accessories",
    stock: "In Stock",
    price: "$45",
    status: "Published",
    image: "/pulse-ui-next/products/02.png",
  },
  {
    id: 3,
    name: "Smartphone Pro",
    category: "Mobiles",
    stock: "Low Stock",
    price: "$899",
    status: "Draft",
    image: "/pulse-ui-next/products/03.png",
  },
  {
    id: 4,
    name: "Office Chair",
    category: "Furniture",
    stock: "In Stock",
    price: "$199",
    status: "Published",
    image: "/pulse-ui-next/products/04.png",
  },
  {
    id: 5,
    name: "Running Shoes",
    category: "Footwear",
    stock: "Out of Stock",
    price: "$75",
    status: "Published",
    image: "/pulse-ui-next/products/05.png",
  },
  {
    id: 6,
    name: "Coffee Maker",
    category: "Home Appliances",
    stock: "In Stock",
    price: "$149",
    status: "Draft",
    image: "/pulse-ui-next/products/06.png",
  },
]

const getStatusStyle = (status: string) => {
  switch (status) {
    case "Published":
      return "bg-green-500/10 text-green-600 border-green-500/20"
    case "Draft":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function ProductTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Products List</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          
          <div className="flex flex-wrap gap-3">
            <Input type="date" className="w-[180px]" />

            <Select>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Select>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="electronics">Electronics</SelectItem>
                <SelectItem value="fitness">Fitness</SelectItem>
                <SelectItem value="wearables">Wearables</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline">Import</Button>
            <Button variant="secondary">Export</Button>
            <Button>Add Product</Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Image</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {products.map((prod) => (
                <TableRow key={prod.id} className="hover:bg-muted/40 transition">
                  <TableCell>
                        <img
                            src={prod.image}
                            alt={prod.name}
                            className="w-12 h-12 object-cover rounded-lg border p-1"
                        />
                  </TableCell>
                  <TableCell className="font-medium">
                    {prod.name}
                  </TableCell>
                  <TableCell>{prod.category}</TableCell>
                  <TableCell>{prod.stock}</TableCell>
                  <TableCell>{prod.price}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getStatusStyle(prod.status)}
                    >
                      {prod.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View</DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Result 1–10 of 45
          </span>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>
                  1
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">2</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">3</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>

      </CardContent>
    </Card>
  )
}