"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

export default function FilterCard() {
  const [view, setView] = useState("active")
  const [includeShared, setIncludeShared] = useState(true)
  const [search, setSearch] = useState("")

  return (
    <Card className="rounded-2xl">
      
      {/* Header */}
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg font-bold">
          Filter
        </CardTitle>
        <button
          aria-label="Close"
          className="p-1 rounded-md hover:bg-muted transition"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>

      <CardContent className="space-y-6">
        
        {/* Search */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Search By Keyword
          </Label>
          <Input
            type="text"
            placeholder="Search Jobs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Radio Buttons */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground">
            View
          </Label>

          <RadioGroup
            value={view}
            onValueChange={setView}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="all-posts" />
              <Label htmlFor="all-posts">All Job Posts</Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem value="active" id="active-posts" />
              <Label htmlFor="active-posts">Active Job Posts</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Checkbox */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Include
          </Label>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="job-shared"
              checked={includeShared}
              onCheckedChange={(checked) =>
                setIncludeShared(Boolean(checked))
              }
            />
            <Label htmlFor="job-shared">
              Job Shared With Me
            </Label>
          </div>
        </div>

        {/* Button */}
        <Button
          className="w-full rounded-xl font-semibold"
          onClick={() =>
            alert(
              `Filters Applied:\nSearch=${search}\nView=${view}\nIncludeShared=${includeShared}`
            )
          }
        >
          Save Changes
        </Button>

      </CardContent>
    </Card>
  )
}