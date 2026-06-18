"use client"

import { useState, useMemo } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

const services = [
  { id: 1, title: "UX Consultation", checked: true },
  {
    id: 2,
    title: "Usability Audit",
    desc: "Our usability fellas will tap all day long to discover app leaks",
  },
  {
    id: 3,
    title: "Information Architecture",
    desc: "We will give you explanations",
    checked: true,
  },
  {
    id: 4,
    title: "Wireframing Overview",
    desc: "No real purpose, but sounds cool",
  },
  {
    id: 5,
    title: "Brief Estimation",
    desc: "Will take care of your routine",
  },
  { id: 6, title: "Userflow Diagram" },
]

export default function ServiceSelectorCard() {
  const [selected, setSelected] = useState<number[]>(
    services.filter((s) => s.checked).map((s) => s.id)
  )

  const [search, setSearch] = useState("")

  const toggleCheckbox = (id: number) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : [...prev, id]
    )
  }

  const filteredServices = useMemo(() => {
    return services.filter((service) =>
      service.title.toLowerCase().includes(search.toLowerCase())
    )
  }, [search])

  return (
    <Card className="rounded-2xl">
      
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Service Card
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        
        {/* Search */}
        <Input
          placeholder="Search for services"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl"
        />

        {/* Service List */}
        <div className="space-y-4">
          {filteredServices.map((service) => {
            const isChecked = selected.includes(service.id)

            return (
              <div
                key={service.id}
                className={`flex items-start gap-3 rounded-xl border p-4 transition-all
                  ${isChecked
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground/30"
                  }`}
              >
                <Checkbox
                  id={`service-${service.id}`}
                  checked={isChecked}
                  onCheckedChange={() =>
                    toggleCheckbox(service.id)
                  }
                  className="mt-1"
                />

                <div className="flex-1">
                  <Label
                    htmlFor={`service-${service.id}`}
                    className="font-medium cursor-pointer"
                  >
                    {service.title}
                  </Label>

                  {service.desc && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {service.desc}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Button */}
        <Button className="w-full rounded-xl font-semibold">
          Select {selected.length} service(s)
        </Button>

      </CardContent>
    </Card>
  )
}