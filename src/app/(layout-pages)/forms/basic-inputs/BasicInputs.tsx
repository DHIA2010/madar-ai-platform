"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"

export default function BasicInputs() {
  return (
    <div className="space-y-6">

      {/* Basic Inputs */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email address</Label>
            <Input type="email" placeholder="name@example.com" />
          </div>

          <div className="space-y-2">
            <Label>Example textarea</Label>
            <Textarea rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Input Sizing */}
      <Card>
        <CardHeader>
          <CardTitle>Input Sizing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input className="h-12 text-lg" placeholder="Large text" />
          <Input placeholder="Normal text" />
          <Input className="h-8 text-sm" placeholder="Small text" />
        </CardContent>
      </Card>

      {/* Select */}
      <Card>
        <CardHeader>
          <CardTitle>Select</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Large select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Option One</SelectItem>
              <SelectItem value="2">Option Two</SelectItem>
            </SelectContent>
          </Select>

          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Default select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Option One</SelectItem>
              <SelectItem value="2">Option Two</SelectItem>
            </SelectContent>
          </Select>

          <Select>
            <SelectTrigger className="h-8 text-sm w-full">
              <SelectValue placeholder="Small select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Option One</SelectItem>
              <SelectItem value="2">Option Two</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Floating Labels Alternative */}
      <Card>
        <CardHeader>
          <CardTitle>Floating Style Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Input placeholder=" " />
            <Label className="absolute left-3 top-2 text-sm text-muted-foreground">
              Email address
            </Label>
          </div>

          <div className="relative">
            <Input type="password" placeholder=" " />
            <Label className="absolute left-3 top-2 text-sm text-muted-foreground">
              Password
            </Label>
          </div>

          <div className="relative">
            <Textarea placeholder=" " />
            <Label className="absolute left-3 top-2 text-sm text-muted-foreground">
              Comments
            </Label>
          </div>

          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Works with selects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">One</SelectItem>
              <SelectItem value="2">Two</SelectItem>
              <SelectItem value="3">Three</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Disabled & Readonly */}
      <Card>
        <CardHeader>
          <CardTitle>Disabled & Read Only</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Disabled input" disabled />
          <Input placeholder="Readonly input" readOnly />
        </CardContent>
      </Card>

      {/* File Input */}
      <Card>
        <CardHeader>
          <CardTitle>File Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" />
          <Input type="file" multiple />
          <Input type="file" disabled />
          <Input type="file" className="text-sm" />
          <Input type="file" className="text-lg" />
        </CardContent>
      </Card>

      {/* Range */}
      <Card>
        <CardHeader>
          <CardTitle>Range</CardTitle>
        </CardHeader>
        <CardContent>
          <Slider defaultValue={[50]} max={100} step={1} />
        </CardContent>
      </Card>

    </div>
  )
}