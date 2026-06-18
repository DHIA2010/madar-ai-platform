"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

const tools = [
  {
    id: "blender",
    name: "Blender",
    desc: "It is a long established fact that a reader will be distracted by the readable content of a page when looking it is a long.",
    img: "https://cdn-icons-png.flaticon.com/512/5969/5969282.png",
  },
  {
    id: "figma",
    name: "Figma",
    desc: "It is a long established fact that a reader will be distracted by the readable content of a page when looking it is a long.",
    img: "https://cdn-icons-png.flaticon.com/512/5968/5968705.png",
  },
  {
    id: "sketch",
    name: "Sketch",
    desc: "It is a long established fact that a reader will be distracted by the readable content of a page when looking it is a long.",
    img: "https://cdn-icons-png.flaticon.com/512/5969/5969294.png",
  },
  {
    id: "illustrator",
    name: "Illustrator",
    desc: "It is a long established fact that a reader will be distracted by the readable content of a page when looking it is a long.",
    img: "https://cdn-icons-png.flaticon.com/512/5968/5968472.png",
  },
  {
    id: "photoshop",
    name: "Photoshop",
    desc: "It is a long established fact that a reader will be distracted by the readable content of a page when looking it is a long.",
    img: "https://cdn-icons-png.flaticon.com/512/5968/5968520.png",
  },
  {
    id: "invision",
    name: "Invision",
    desc: "It is a long established fact that a reader will be distracted by the readable content of a page when looking it is a long.",
    img: "https://cdn-icons-png.flaticon.com/512/5968/5968706.png",
  },
]

export default function CheckboxCardList() {
  const [selected, setSelected] = useState<string[]>([
    "figma",
    "photoshop",
  ])

  const toggleCheck = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    )
  }

  return (
    <Card className="p-6 rounded-2xl space-y-4">
      {tools.map((tool) => {
        const isChecked = selected.includes(tool.id)

        return (
          <div
            key={tool.id}
            onClick={() => toggleCheck(tool.id)}
            className={`cursor-pointer transition-all duration-200 rounded-xl border
              ${isChecked
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "hover:border-muted-foreground/30"
              }`}
          >
            <CardContent className="p-5 flex items-center gap-4">
              
              {/* Icon */}
              <img
                src={tool.img}
                alt={tool.name}
                className="w-10 h-10 rounded-md object-contain"
              />

              {/* Content */}
              <div className="flex-1">
                <h6 className="font-semibold">
                  {tool.name}
                </h6>
                <p className="text-sm text-muted-foreground">
                  {tool.desc}
                </p>
              </div>

              {/* Checkbox */}
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleCheck(tool.id)}
              />

            </CardContent>
          </div>
        )
      })}
    </Card>
  )
}