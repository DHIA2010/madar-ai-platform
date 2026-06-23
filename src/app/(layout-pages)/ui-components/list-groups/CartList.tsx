"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Heart, X } from "lucide-react"

export function CartList() {
  const [items, setItems] = useState([
    {
      title: "Project Manager Tee",
      img: "/products/01.png",
      color: "Silver",
      size: "Large",
      pricePerItem: 23,
      quantity: 2,
    },
    {
      title: "Cozy Pink Zip-Up Hoodie",
      img: "/products/02.png",
      color: "Silver",
      size: "Large",
      pricePerItem: 23,
      quantity: 2,
    },
    {
      title: "Adidas Running Shoes",
      img: "/products/03.png",
      color: "Black",
      size: "Medium",
      pricePerItem: 35,
      quantity: 1,
    },
    {
      title: "Elegant White Leather Handbag",
      img: "/products/04.png",
      color: "Gold",
      size: "Small",
      pricePerItem: 15,
      quantity: 3,
    },
    {
      title: "Classic Green Formal Shirt",
      img: "/products/05.png",
      color: "Blue",
      size: "Extra Large",
      pricePerItem: 14,
      quantity: 5,
    },
  ])

  const handleRemove = (index: number) => {
    const newList = items.filter((_, i) => i !== index)
    setItems(newList)
  }

  const handleQuantityChange = (index: number, qty: number) => {
    const updated = [...items]
    updated[index].quantity = qty
    setItems(updated)
  }

  return (
    <Card>
      {/* Header */}
      <CardHeader className="border-b">
        <CardTitle className="text-xl font-medium">Cart List</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex flex-col md:flex-row justify-between gap-6 border-b pb-4 last:border-none"
          >
            {/* Left Section */}
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted p-2">
                <img src={item.img} alt={item.title} className="max-h-full object-contain" />
              </div>

              <div>
                <h6 className="text-base font-semibold leading-tight">{item.title}</h6>
                <p className="text-sm md:text-base text-muted-foreground">Color: {item.color}</p>
                <p className="text-sm md:text-base text-muted-foreground">Size: {item.size}</p>
                <p className="text-sm md:text-base text-muted-foreground">
                  Price: ${item.pricePerItem} USD / per item
                </p>
              </div>
            </div>

            {/* Right Section */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Quantity */}
              <Select
                value={String(item.quantity)}
                onValueChange={(value) => handleQuantityChange(idx, Number(value))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Qty" />
                </SelectTrigger>
                <SelectContent>
                  {[...Array(10).keys()].map((i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      Qty: {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Total Price */}
              <div className="text-base md:text-lg font-semibold">
                ${(item.pricePerItem * item.quantity).toFixed(2)} USD
              </div>

              {/* Wishlist */}
              <Button size="icon" variant="outline">
                <Heart className="h-4 w-4" />
              </Button>

              {/* Remove */}
              <Button size="icon" variant="destructive" onClick={() => handleRemove(idx)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {/* Remove All */}
        {items.length > 0 && (
          <div className="pt-2">
            <Button variant="outline" className="text-primary" onClick={() => setItems([])}>
              Remove all from cart
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
