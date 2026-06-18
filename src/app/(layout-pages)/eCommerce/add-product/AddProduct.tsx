"use client"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { X, Plus, Upload } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export default function AddProduct() {
    // State for product attributes
    const [attributes, setAttributes] = useState<
        { name: string; values: string[] }[]
    >([
        { name: "Color", values: ["Black", "Blue"] },
    ])

     // Functions to manage attributes
    const addAttribute = () => {
        setAttributes([...attributes, { name: "", values: [""] }])
    }

    const removeAttribute = (index: number) => {
        setAttributes(attributes.filter((_, i) => i !== index))
    }

    const updateAttributeName = (index: number, value: string) => {
        const updated = [...attributes]
        updated[index].name = value
        setAttributes(updated)
    }

    const updateValue = (attrIndex: number, valueIndex: number, value: string) => {
        const updated = [...attributes]
        updated[attrIndex].values[valueIndex] = value
        setAttributes(updated)
    }

    const addValue = (index: number) => {
        const updated = [...attributes]
        updated[index].values.push("")
        setAttributes(updated)
    }

    const removeValue = (attrIndex: number, valueIndex: number) => {
        const updated = [...attributes]
        updated[attrIndex].values = updated[attrIndex].values.filter(
            (_, i) => i !== valueIndex
        )
        setAttributes(updated)
    }

// State for published status
  const [published, setPublished] = useState(true)

  return (
    <div className="space-y-6">

      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Add New Product</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage your products
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline">Discard</Button>
          <Button>Save Product</Button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* LEFT COLUMN */}
        <div className="space-y-6 lg:col-span-2">

          {/* GENERAL INFO */}
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Product Name</Label>
                <Input placeholder="Enter product name" />
              </div>

              <div className="space-y-2">
                <Label>SKU</Label>
                <Input placeholder="SKU-001" />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fashion">Fashion</SelectItem>
                    <SelectItem value="electronics">Electronics</SelectItem>
                    <SelectItem value="accessories">Accessories</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea rows={4} placeholder="Product description" />
              </div>
            </CardContent>
          </Card>

          {/* PRICING */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input placeholder="$0.00" />
              </div>

              <div className="space-y-2">
                <Label>Sale Price</Label>
                <Input placeholder="$0.00" />
              </div>

              <div className="space-y-2">
                <Label>Tax</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Tax</SelectItem>
                    <SelectItem value="vat">VAT</SelectItem>
                    <SelectItem value="gst">GST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* INVENTORY */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Stock Quantity</Label>
                <Input placeholder="0" />
              </div>

              <div className="space-y-2">
                <Label>Stock Status</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">In Stock</SelectItem>
                    <SelectItem value="low">Low Stock</SelectItem>
                    <SelectItem value="out">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 pt-7">
                <Switch />
                <Label>Track Inventory</Label>
              </div>
            </CardContent>
          </Card>

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Variants & Attributes</CardTitle>
                <Button size="sm" variant="outline" onClick={addAttribute}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Attribute
                </Button>
            </CardHeader>

            <CardContent className="space-y-6">
                {attributes.map((attr, attrIndex) => (
                    <div
                        key={attrIndex}
                        className="space-y-4 rounded-md border p-4"
                    >
                        {/* Attribute Header */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1 space-y-1">
                                <Label>Attribute Name</Label>
                                <Input
                                    placeholder="e.g. Color"
                                    value={attr.name}
                                    onChange={(e) =>
                                        updateAttributeName(attrIndex, e.target.value)
                                    }
                                />
                            </div>

                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => removeAttribute(attrIndex)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Values */}
                        <div className="space-y-3">
                            <Label>Values</Label>

                            {attr.values.map((val, valIndex) => (
                                <div key={valIndex} className="flex items-center gap-2">
                                    <Input
                                        placeholder="e.g. Black"
                                        value={val}
                                        onChange={(e) =>
                                            updateValue(attrIndex, valIndex, e.target.value)
                                        }
                                    />

                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => removeValue(attrIndex, valIndex)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => addValue(attrIndex)}
                            >
                                <Plus className="mr-1 h-4 w-4" />
                                Add Value
                            </Button>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>

          {/* MEDIA */}
          <ProductImageUploader />    

        </div>

        {/* RIGHT SIDEBAR */}
        <div className="space-y-6">

          {/* STATUS */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Switch
                checked={published}
                onCheckedChange={setPublished}
              />
              <span className="text-sm text-muted-foreground">
                {published ? "Published" : "Draft"}
              </span>
            </CardContent>
          </Card>

          {/* SEO */}
          <Card>
            <CardHeader>
              <CardTitle>Search Engine Listing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>SEO Title</Label>
                <Input placeholder="SEO title" />
              </div>

              <div className="space-y-2">
                <Label>Slug</Label>
                <Input placeholder="product-slug" />
              </div>

              <div className="space-y-2">
                <Label>Meta Description</Label>
                <Textarea rows={3} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Separate component for image uploading and preview
function ProductImageUploader() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<string[]>([])

  const handleFiles = (files: FileList | null) => {
    if (!files) return

    const newImages = Array.from(files).map((file) =>
      URL.createObjectURL(file)
    )

    setImages((prev) => [...prev, ...newImages])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Images</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleFiles(e.dataTransfer.files)
          }}
          className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground hover:bg-muted/40"
        >
          <Upload className="mb-2 h-6 w-6" />
          <p>
            Drag & drop images here or{" "}
            <span className="font-medium text-primary">
              click to upload
            </span>
          </p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* Preview Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((src, index) => (
              <div
                key={index}
                className="group relative aspect-square overflow-hidden rounded-md border"
              >
                <img
                  src={src}
                  alt="Product"
                  className="h-full w-full object-cover"
                />

                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={() =>
                    setImages((prev) =>
                      prev.filter((_, i) => i !== index)
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

