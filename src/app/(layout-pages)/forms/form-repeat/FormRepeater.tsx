"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Trash2, Plus } from "lucide-react"

interface Item {
  id: number
  name: string
  quantity: number
  price: number
}

let nextItemId = 1

export default function FormRepeater() {
  const [items, setItems] = useState<Item[]>([
    { id: nextItemId++, name: "", quantity: 1, price: 0 },
  ])

  const addItem = () => {
    setItems([...items, { id: nextItemId++, name: "", quantity: 1, price: 0 }])
  }

  const removeItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id))
  }

  const updateItem = (id: number, field: keyof Item, value: string | number) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const total = items.reduce((acc, item) => acc + item.quantity * item.price, 0)

  return (
    <div className="space-y-6">
      {/* Items */}
      <div className="space-y-4">
        {items.map((item, index) => (
          <Card key={item.id} className="rounded-xl shadow-sm">
            <CardContent className="p-4 grid md:grid-cols-4 gap-4 items-end">
              {/* Item Name */}
              <div className="space-y-2">
                <Label>Item Name</Label>
                <Input
                  placeholder="Enter item"
                  value={item.name}
                  onChange={(e) => updateItem(item.id, "name", e.target.value)}
                />
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))}
                />
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  type="number"
                  value={item.price}
                  onChange={(e) => updateItem(item.id, "price", Number(e.target.value))}
                />
              </div>

              {/* Remove */}
              <Button
                variant="destructive"
                size="icon"
                onClick={() => removeItem(item.id)}
                disabled={items.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Button */}
      <Button variant="outline" onClick={addItem} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Item
      </Button>

      {/* Total */}
      <div className="text-right font-semibold text-lg">Total: ₹ {total.toFixed(2)}</div>
    </div>
  )
}
