"use client"

import { useState } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar"

const members = [
  {
    id: "friedrich",
    name: "Friedrich Oberbrunner",
    desc: "",
    img: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    id: "adeline",
    name: "Adeline O'Reilly",
    desc: "This user was picked",
    img: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    id: "fernando",
    name: "Fernando Pidrilo",
    desc: "",
    img: "https://randomuser.me/api/portraits/men/67.jpg",
  },
  {
    id: "anonymous",
    name: "Anonymous User",
    desc: "",
    img: "",
  },
]

export default function TeamMemberList() {
  const [selected, setSelected] = useState<string[]>(["adeline"])

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((m) => m !== id)
        : [...prev, id]
    )
  }

  return (
    <Card className="rounded-2xl">
      
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Team Members
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {members.map((member) => {
          const isChecked = selected.includes(member.id)

          return (
            <div
              key={member.id}
              onClick={() => toggleSelect(member.id)}
              className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-all
                ${isChecked
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "hover:border-muted-foreground/30"
                }`}
            >
              {/* Left Section */}
              <div className="flex items-center gap-4">
                
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() =>
                    toggleSelect(member.id)
                  }
                  onClick={(e) => e.stopPropagation()}
                />

                <div>
                  <h6 className="font-medium">
                    {member.name}
                  </h6>
                  {member.desc && (
                    <p className="text-sm text-muted-foreground">
                      {member.desc}
                    </p>
                  )}
                </div>
              </div>

              {/* Avatar */}
              <Avatar className="h-9 w-9">
                {member.img ? (
                  <AvatarImage src={member.img} />
                ) : (
                  <AvatarFallback>
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </AvatarFallback>
                )}
              </Avatar>

            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}