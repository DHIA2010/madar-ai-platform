"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export default function FormInputGroup() {
  return (
    <div className="space-y-6">

      {/* Input Groups */}
      <Card>
        <CardHeader>
          <CardTitle>Input Groups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Username */}
          <div className="flex rounded-md border overflow-hidden">
            <span className="px-3 flex items-center bg-muted">@</span>
            <Input className="border-0 rounded-none focus-visible:ring-0" placeholder="Username" />
          </div>

          {/* Email */}
          <div className="flex rounded-md border overflow-hidden">
            <Input className="border-0 rounded-none focus-visible:ring-0" placeholder="Recipient's username" />
            <span className="px-3 flex items-center bg-muted">@example.com</span>
          </div>

          {/* URL */}
          <div className="flex rounded-md border overflow-hidden">
            <span className="px-3 flex items-center bg-muted text-sm">
              https://example.com/users/
            </span>
            <Input className="border-0 rounded-none focus-visible:ring-0" />
          </div>

          {/* Amount */}
          <div className="flex rounded-md border overflow-hidden">
            <span className="px-3 flex items-center bg-muted">$</span>
            <Input className="border-0 rounded-none focus-visible:ring-0" />
            <span className="px-3 flex items-center bg-muted">.00</span>
          </div>

          {/* Textarea */}
          <div className="flex rounded-md border overflow-hidden">
            <span className="px-3 flex items-center bg-muted">
              With textarea
            </span>
            <Textarea className="border-0 rounded-none focus-visible:ring-0" />
          </div>

        </CardContent>
      </Card>

      {/* Sizing */}
      <Card>
        <CardHeader>
          <CardTitle>Sizing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex rounded-md border overflow-hidden h-8 text-sm">
            <span className="px-3 flex items-center bg-muted">Small</span>
            <Input className="border-0 rounded-none focus-visible:ring-0 text-sm" />
          </div>

          <div className="flex rounded-md border overflow-hidden">
            <span className="px-3 flex items-center bg-muted">Default</span>
            <Input className="border-0 rounded-none focus-visible:ring-0" />
          </div>

          <div className="flex rounded-md border overflow-hidden h-12 text-lg">
            <span className="px-3 flex items-center bg-muted">Large</span>
            <Input className="border-0 rounded-none focus-visible:ring-0 text-lg" />
          </div>

        </CardContent>
      </Card>

      {/* Checkbox & Radio */}
      <Card>
        <CardHeader>
          <CardTitle>Checkboxes & Radios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex items-center gap-3 border rounded-md p-2">
            <Checkbox />
            <Input className="border-0 focus-visible:ring-0" placeholder="Text input with checkbox" />
          </div>

          <div className="flex items-center gap-3 border rounded-md p-2">
            <RadioGroup defaultValue="one">
              <RadioGroupItem value="one" />
            </RadioGroup>
            <Input className="border-0 focus-visible:ring-0" placeholder="Text input with radio" />
          </div>

        </CardContent>
      </Card>

      {/* Multiple Inputs */}
      <Card>
        <CardHeader>
          <CardTitle>Multiple Inputs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex rounded-md border overflow-hidden">
            <span className="px-3 flex items-center bg-muted">
              First and last name
            </span>
            <Input className="border-0 rounded-none focus-visible:ring-0" placeholder="First name" />
            <Input className="border-0 rounded-none focus-visible:ring-0" placeholder="Last name" />
          </div>
        </CardContent>
      </Card>

      {/* Dropdown Buttons */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons with Dropdowns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex rounded-md border overflow-hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-none">
                  Dropdown
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Action</DropdownMenuItem>
                <DropdownMenuItem>Another action</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Separated link</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Input className="border-0 rounded-none focus-visible:ring-0" />
          </div>

          <div className="flex rounded-md border overflow-hidden">
            <Input className="border-0 rounded-none focus-visible:ring-0" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-none">
                  Dropdown
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Action</DropdownMenuItem>
                <DropdownMenuItem>Another action</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Separated link</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </CardContent>
      </Card>

      {/* Buttons Addons */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons Addons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex rounded-md border overflow-hidden">
            <Button variant="outline" className="rounded-none">
              Button
            </Button>
            <Input className="border-0 rounded-none focus-visible:ring-0" />
          </div>

          <div className="flex rounded-md border overflow-hidden">
            <Input className="border-0 rounded-none focus-visible:ring-0" />
            <Button variant="outline" className="rounded-none">
              Button
            </Button>
          </div>

          <div className="flex rounded-md border overflow-hidden">
            <Button variant="outline" className="rounded-none">
              Button
            </Button>
            <Button variant="outline" className="rounded-none">
              Button
            </Button>
            <Input className="border-0 rounded-none focus-visible:ring-0" />
          </div>

        </CardContent>
      </Card>

    </div>
  )
}