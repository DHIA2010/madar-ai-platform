"use client"

import { useState } from "react"
import { Flag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type Language = {
  code: string
  name: string
}

const languages: Language[] = [
  { code: "01", name: "English" },
  { code: "02", name: "French" },
  { code: "03", name: "Japan" },
  { code: "04", name: "Canada" },
  { code: "05", name: "Australia" },
  { code: "06", name: "Sweden" },
  { code: "07", name: "United Kingdom" },
  { code: "08", name: "Switzerland" },
]

export function LanguageDropdown() {
  const [selected, setSelected] = useState<Language>(languages[0])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full w-10 h-10">
          <Flag className="size-5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48 rounded-xl p-2 shadow-xl">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setSelected(lang)}
            className={cn(
              "flex items-center gap-3 cursor-pointer rounded-lg p-1.5",
              selected.code === lang.code && "bg-muted/40"
            )}
          >
            <img
              src={`/images/countries/${lang.code}.png`}
              alt={lang.name}
              className="h-5 w-5 rounded-full object-cover"
            />

            <span className="text-sm">{lang.name}</span>

            {selected.code === lang.code && <Check className="ml-auto h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
